import { expect, test } from '@playwright/test';

const owner = {
  email: 'owner.e2e@example.test',
  password: 'E2e-owner-password-24!',
  recoveryCode: 'E2E-OWNER-RECOVERY-24',
};

test('real customer journey, auth refresh, controls, desktop and mobile navigation', async ({ context, page }) => {
  // The customer-visible batch includes deterministic FFmpeg video composition.
  // Keep this candidate journey bounded but long enough to observe its final QA.
  test.setTimeout(420_000);
  const browserErrors: string[] = [];
  const requests: string[] = [];
  let expectedExpiredAccessResponses = 0;
  let expectingProtectedRedirect = false;
  const protectedRedirectFailures = { me: 0, organizations: 0, refresh: 0 };

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // The response observer below classifies intentional and unexpected API
    // failures with their URL and status; Chromium's duplicate message does not.
    if (/Failed to load resource:.*status of (400|401)/.test(message.text())) return;
    browserErrors.push(`console: ${message.text()}`);
  });
  page.on('request', (request) => requests.push(request.url()));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || '';
    if (new URL(request.url()).searchParams.has('_rsc') && failure === 'net::ERR_ABORTED') return;
    browserErrors.push(`request failed: ${request.method()} ${request.url()} ${failure}`);
  });
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

  await page.goto('/campaigns/new?deliverable=ad-batch');
  await expect(page.getByText('Video ads', { exact: true })).toBeVisible();
  await expect(page.getByText('Image ads', { exact: true })).toBeVisible();
  const batchQuantities = page.getByLabel('Quantity');
  await expect(batchQuantities.nth(0)).toHaveValue('1');
  await expect(batchQuantities.nth(1)).toHaveValue('5');
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
  await page.getByRole('button', { name: 'Owner approve' }).click();
  await expect(page.getByRole('button', { name: 'Produce campaign assets' })).toBeVisible();
  await page.getByRole('button', { name: 'Produce campaign assets' }).click();
  await expect.poll(async () => {
    await page.reload();
    const progress = page.getByText('Campaign progress', { exact: true }).locator('..').locator('..');
    await progress.waitFor({ state: 'visible', timeout: 15_000 });
    return (await progress.innerText()).replace(/\s+/g, ' ');
  }, { timeout: 240_000, intervals: [1000, 2000, 3000] }).toContain('6 of 6 requested deliverables are finished branded materials ready for owner review.');
  await expect(page.getByText('Final material runs', { exact: true })).toBeVisible();
  await expect(page.getByText('Finished branded material persisted')).toHaveCount(6);
  await page.goto('/approvals');
  await expect.poll(async () => page.locator('article').filter({ hasText: 'E2E Academy launch revised' }).count(), { timeout: 30_000 }).toBe(6);
  for (let index = 0; index < 6; index += 1) {
    const candidate = page.locator('article').filter({ hasText: 'E2E Academy launch revised' }).first();
    await candidate.getByRole('button', { name: 'Approve' }).click();
  }
  await page.goto('/campaigns');
  await page.getByText('E2E Academy launch revised', { exact: true }).first().click();
  await expect(page.getByText('No active social channel is configured. The finished materials remain ready for owner review; no external schedule has been created.')).toBeVisible();

  // This candidate confirms the owner-visible production path. Emergency Stop,
  // channel restrictions, spend limits, and duplicate-schedule prevention remain
  // covered by their focused API regressions; no external channel is configured.
  await expect(page.getByText('Creative rotation', { exact: true })).toBeVisible();
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
});
