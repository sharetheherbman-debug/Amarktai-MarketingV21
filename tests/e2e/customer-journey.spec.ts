import { expect, test } from '@playwright/test';

const owner = {
  email: 'owner.e2e@example.test',
  password: 'E2e-owner-password-24!',
  recoveryCode: 'E2E-OWNER-RECOVERY-24',
};

test('real customer journey, auth refresh, controls, desktop and mobile navigation', async ({ context, page }) => {
  const browserErrors: string[] = [];
  const requests: string[] = [];
  let expectedExpiredAccessResponses = 0;
  let expectingProtectedRedirect = false;
  const protectedRedirectFailures = { me: 0, organizations: 0, refresh: 0 };

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  page.on('request', (request) => requests.push(request.url()));
  page.on('requestfailed', (request) => browserErrors.push(`request failed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => {
    if (response.status() < 400 || !response.url().includes('/api/v1/')) return;
    if (expectingProtectedRedirect) {
      if (response.status() === 401 && response.url().includes('/auth/me')) { protectedRedirectFailures.me += 1; return; }
      if (response.status() === 401 && response.url().includes('/organizations')) { protectedRedirectFailures.organizations += 1; return; }
      if (response.status() === 400 && response.url().includes('/auth/refresh')) { protectedRedirectFailures.refresh += 1; return; }
    }
    if (response.status() === 401 && expectedExpiredAccessResponses > 0) {
      expectedExpiredAccessResponses -= 1;
      return;
    }
    browserErrors.push(`response ${response.status()}: ${response.request().method()} ${response.url()}`);
  });

  await page.goto('/login');
  await expect(page).toHaveTitle(/Acceptance Marketing/);
  await expect(page.getByText('Acceptance Marketing', { exact: true })).toBeVisible();
  await expect(page.getByText(/Connected to Acceptance Host/)).toBeVisible();
  await expect(page.locator('img').first()).toHaveAttribute('src', '/logo.svg');
  expect(await page.locator('body').evaluate((node) => getComputedStyle(node).getPropertyValue('--ep-navy').trim())).toBe('#123456');
  expect(await page.locator('body').evaluate((node) => getComputedStyle(node).getPropertyValue('--ep-blue').trim())).toBe('#abcdef');

  await page.getByLabel('Email').fill(owner.email);
  await page.locator('#password').fill(owner.password);
  await page.getByLabel('Authenticator or recovery code').fill(owner.recoveryCode);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Acceptance');

  const authCookies = await context.cookies();
  expect(authCookies.find((cookie) => cookie.name === 'accessToken')?.httpOnly).toBe(true);
  expect(authCookies.find((cookie) => cookie.name === 'refreshToken')?.httpOnly).toBe(true);
  expect(await page.evaluate(() => ({ access: localStorage.getItem('auth_token'), refresh: localStorage.getItem('refresh_token') }))).toEqual({ access: null, refresh: null });

  await page.goto('/brand-dna');
  const companyName = page.getByLabel('Company name');
  await expect(companyName).toHaveValue('Acceptance Equine');
  await companyName.fill('Acceptance Equine Academy');
  await page.getByLabel('What the business does').fill('Practical equestrian learning, responsibly selected products, and grounded owner guidance.');
  await page.getByRole('button', { name: 'Save Brand DNA' }).click();
  await expect(page.getByText(/Saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Company name')).toHaveValue('Acceptance Equine Academy');

  await page.goto('/campaigns/new');
  await page.getByLabel('Campaign name *').fill('E2E Academy launch');
  await page.getByLabel('What must this campaign achieve? *').fill('Grow qualified Academy enrolments with a truthful owner education campaign.');
  await page.getByLabel('Target audience').fill('UK horse owners and riders');
  await page.getByLabel('Products / services').fill('Academy and Shop');
  await page.getByLabel('Offer').fill('Explore the Academy');
  await page.getByRole('button', { name: 'Generate campaign strategy' }).click();
  await page.waitForURL(/\/campaigns\/[0-9a-f-]{36}$/i, { timeout: 60_000 });
  await expect(page.getByText('E2E Academy launch', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Edit strategy' }).click();
  await page.getByLabel('Campaign name').fill('E2E Academy launch revised');
  await page.getByLabel('Change summary').fill('Owner clarified the customer-facing launch name.');
  await page.getByRole('button', { name: 'Save new version' }).click();
  await expect(page.getByText('E2E Academy launch revised', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('E2E Academy launch revised', { exact: true }).first()).toBeVisible();

  await page.goto('/creative-studio');
  await expect(page.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Text to Image', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Text to Video', exact: true })).toBeVisible();
  const currentCookies = await context.cookies();
  const access = currentCookies.find((cookie) => cookie.name === 'accessToken');
  expect(access).toBeTruthy();
  await context.addCookies([{ ...access!, value: 'expired-e2e-access-token' }]);
  expectedExpiredAccessResponses = 4;
  const refreshResponse = page.waitForResponse((response) => response.url().includes('/api/v1/auth/refresh') && response.status() === 200);
  await page.getByRole('button', { name: 'Refresh capabilities' }).click();
  await refreshResponse;
  await expect(page.getByRole('button', { name: 'Chat', exact: true })).toBeVisible();
  expect(expectedExpiredAccessResponses).toBe(0);

  await page.getByRole('button', { name: 'Long-form Production' }).click();
  await page.getByPlaceholder('Project name').fill('E2E 60-second Academy film');
  await page.getByLabel('Target seconds').fill('60');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'E2E 60-second Academy film' })).toBeVisible();
  await page.getByPlaceholder('Scene title').fill('Academy learning journey');
  await page.getByPlaceholder('Seconds').fill('60');
  await page.getByPlaceholder('Visual prompt / shot direction').fill('A calm horse owner learning practical care in a natural stable environment.');
  await page.getByRole('button', { name: 'Add scene' }).click();
  await expect(page.getByText('1 scene', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate scenes' })).toBeDisabled();
  await page.getByLabel('Production strategy').selectOption('smart');
  await page.getByLabel('Maximum project credits').fill('1000');
  await page.getByRole('button', { name: 'Calculate project quote' }).click();
  await expect(page.getByText('1 / 60s', { exact: true })).toBeVisible();
  await expect(page.getByText(/Approved ceiling covers this estimate/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate scenes' })).toBeEnabled();

  const destinations = [
    ['/dashboard', /Good to see you/],
    ['/business-brain', /Teach your marketing team/],
    ['/intelligence', /See what is changing/],
    ['/campaigns', /Plan the campaign/],
    ['/content-studio', /Create, review, version/],
    ['/creative-studio', /Create campaign media/],
    ['/approvals', /Review/],
    ['/social', /Publish/],
    ['/crm', /Connect marketing activity/],
    ['/analytics', /Measure/],
    ['/marketing-team', /virtual marketing department/],
    ['/connections', /Connect the channels/],
    ['/usage-safety', /Know what can run/],
    ['/settings', /Workspace, identity and security/],
  ] as const;
  for (const [route, heading] of destinations) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
  }

  await page.goto('/relaunch-control');
  await expect(page.getByRole('heading', { name: 'Relaunch Control Centre' })).toBeVisible();
  page.once('dialog', async (dialog) => dialog.accept('E2E acceptance verifies the real emergency stop.'));
  await page.getByRole('button', { name: 'Emergency stop' }).click();
  await expect(page.getByRole('button', { name: 'Release emergency stop' })).toBeVisible();
  page.once('dialog', async (dialog) => dialog.accept('E2E acceptance restores governed autonomous operation.'));
  await page.getByRole('button', { name: 'Release emergency stop' }).click();
  await expect(page.getByRole('button', { name: 'Emergency stop' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
  await page.getByRole('link', { name: 'Campaigns', exact: true }).last().click();
  await expect(page).toHaveURL(/\/campaigns$/);
  await page.getByRole('button', { name: 'More modules' }).click();
  await expect(page.getByRole('navigation', { name: 'Marketing workspace' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  expect((await context.cookies()).filter((cookie) => ['accessToken', 'refreshToken'].includes(cookie.name))).toHaveLength(0);
  expectingProtectedRedirect = true;
  await page.goto('/dashboard');
  await page.waitForURL('**/login');
  expectingProtectedRedirect = false;
  expect(protectedRedirectFailures).toEqual({ me: 1, organizations: 1, refresh: 1 });

  expect(requests.some((url) => url.includes('/assets/cinema/'))).toBe(false);
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});
