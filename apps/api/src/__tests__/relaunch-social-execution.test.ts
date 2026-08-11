import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8').replace(/\r\n/g, '\n');

function walkTypeScript(relative: string): string[] {
  const root = path.resolve(repositoryRoot, relative);
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(absolute);
    }
  };
  visit(root);
  return files;
}

describe('Relaunch Control execution boundary', () => {
  test('manual and scheduled social delivery cannot bypass the approval gate', () => {
    const scheduler = read('apps/api/src/services/scheduler.service.ts');
    const controlled = read('apps/api/src/services/controlled-social-publishing.service.ts');
    const controlledRoutes = read('apps/api/src/routes/controlled-social.ts');
    const legacyRoutes = read('apps/api/src/routes/amai.ts');
    const server = read('apps/api/src/server.ts');
    const gate = read('apps/api/src/services/relaunch-execution-gate.service.ts');

    expect(scheduler).toContain('publishDuePostsThroughControlCentre');
    expect(scheduler).not.toContain("from './social-publishing.service'");
    expect(controlled).toContain('requireExecutionApproval');
    expect(controlled).toContain('publishPostThroughControlCentre');
    expect(controlled).toContain("idempotency_key: `social-publish:${postId}`");
    expect(controlled).toContain("status='publishing'");
    expect(controlled).toContain("status IN ('draft','scheduled','failed')");
    expect(controlled.indexOf('requireExecutionApproval')).toBeLessThan(controlled.indexOf('deliverApprovedSocialPost(postId'));
    expect(controlledRoutes).toContain("router.post('/social/posts'");
    expect(controlledRoutes).toContain("router.post('/social/posts/:id/publish'");
    expect(controlledRoutes).toContain('publishPostThroughControlCentre');
    expect(controlledRoutes).toContain('res.status(202).json');
    expect(controlledRoutes).toContain("status: 'pending_approval'");
    expect(controlledRoutes).toContain("status: 'blocked_by_policy'");
    expect(legacyRoutes).not.toContain("router.post('/social/posts'");
    expect(legacyRoutes).not.toContain("router.post('/social/posts/:id/publish'");
    expect(legacyRoutes).not.toContain('socialService.publishPost(');
    expect(server.indexOf("app.use('/api/v1/amai', ...tenant, controlledSocialRoutes)")).toBeLessThan(
      server.indexOf("app.use('/api/v1/amai', ...tenant, amaiRoutes)")
    );
    expect(gate).toContain('Emergency stop is active');
    expect(gate).toContain('Daily Generation Credit limit exceeded');
    expect(gate).toContain('Daily advertising budget exceeded');
    expect(gate).toContain("status='running'");
    expect(gate).toContain("status='completed'");
  });

  test('external email delivery cannot bypass the approval gate', () => {
    const controlled = read('apps/api/src/services/controlled-email-delivery.service.ts');
    const reports = read('apps/api/src/services/client-reports.service.ts');
    const reportRoutes = read('apps/api/src/routes/client-reports.ts');

    expect(controlled).toContain('requireExecutionApproval');
    expect(controlled).toContain("action_type: 'email_send'");
    expect(controlled).toContain("channel: 'email'");
    expect(controlled).toContain('markExecutionRunning');
    expect(controlled).toContain('markExecutionCompleted');
    expect(controlled).toContain('markExecutionFailed');
    expect(controlled.indexOf('requireExecutionApproval')).toBeLessThan(controlled.indexOf('await deliverEmail('));

    expect(reports).toContain('deliverEmailBatchThroughControlCentre');
    expect(reports).not.toContain("from './email-delivery.service'");
    expect(reports).toContain('client-report-email:');
    expect(reportRoutes).toContain('req.user!.userId');

    const allowedRawSender = path.resolve(repositoryRoot, 'apps/api/src/services/controlled-email-delivery.service.ts');
    const lowLevelSender = path.resolve(repositoryRoot, 'apps/api/src/services/email-delivery.service.ts');
    const rawImportPattern = /from\s+['"](?:\.\.\/services\/|\.\/)?email-delivery\.service['"]/;
    const directImports = walkTypeScript('apps/api/src')
      .filter((file) => file !== allowedRawSender && file !== lowLevelSender && !file.includes(`${path.sep}__tests__${path.sep}`))
      .filter((file) => rawImportPattern.test(fs.readFileSync(file, 'utf8')));

    expect(directImports).toEqual([]);
  });

  test('advertising integration remains read-only until a controlled mutation path is implemented', () => {
    const integrationRoutes = read('apps/api/src/routes/integrations.ts');
    const external = read('apps/api/src/services/external-platform.service.ts');

    expect(integrationRoutes).toContain("router.post('/advertising/connections/:id/sync'");
    expect(integrationRoutes).toContain("router.get('/advertising/campaigns'");
    expect(integrationRoutes).not.toMatch(/router\.(post|put|patch|delete)\('\/advertising\/campaigns/);
    expect(external).toContain('export async function syncAdvertising(');
    expect(external).not.toContain('campaigns:mutate');
    expect(external).not.toContain('adGroups:mutate');
    expect(external).not.toContain('campaignBudgets:mutate');
  });

  test('pending decisions are committed before the operational hold is thrown', () => {
    const gate = read('apps/api/src/services/relaunch-execution-gate.service.ts');
    const transactionIndex = gate.indexOf('const decision = await transaction');
    const transactionCloseIndex = gate.indexOf("if (decision.status === 'approved') return decision;");
    const throwIndex = gate.lastIndexOf('throwForDecision(decision);');

    expect(transactionIndex).toBeGreaterThan(-1);
    expect(transactionCloseIndex).toBeGreaterThan(transactionIndex);
    expect(throwIndex).toBeGreaterThan(transactionCloseIndex);
  });

  test('temporary operating-window and daily-budget holds are re-evaluated later', () => {
    const gate = read('apps/api/src/services/relaunch-execution-gate.service.ts');

    expect(gate).toContain("return recordTemporaryBlock('The action is outside the configured operating window'");
    expect(gate).toContain("return recordTemporaryBlock('Daily Generation Credit limit exceeded'");
    expect(gate).toContain("return recordTemporaryBlock('Daily advertising budget exceeded'");
  });

  test('a worker that loses the atomic post claim cannot fail another worker decision', () => {
    const controlled = read('apps/api/src/services/controlled-social-publishing.service.ts');
    const claimedBlock = controlled.indexOf('if (claimed) {');
    const markFailed = controlled.indexOf('markExecutionFailed(decisionId, error)');

    expect(claimedBlock).toBeGreaterThan(-1);
    expect(markFailed).toBeGreaterThan(claimedBlock);
  });
});
