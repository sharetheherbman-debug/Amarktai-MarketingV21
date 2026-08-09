import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('Relaunch Control execution boundary', () => {
  test('manual and scheduled social delivery cannot bypass the approval gate', () => {
    const scheduler = read('apps/api/src/services/scheduler.service.ts');
    const controlled = read('apps/api/src/services/controlled-social-publishing.service.ts');
    const controlledRoutes = read('apps/api/src/routes/controlled-social.ts');
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
    expect(server.indexOf("app.use('/api/v1/amai', ...tenant, controlledSocialRoutes)")).toBeLessThan(
      server.indexOf("app.use('/api/v1/amai', ...tenant, amaiRoutes)")
    );
    expect(gate).toContain('Emergency stop is active');
    expect(gate).toContain('Daily Generation Credit limit exceeded');
    expect(gate).toContain('Daily advertising budget exceeded');
    expect(gate).toContain("status='running'");
    expect(gate).toContain("status='completed'");
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

  test('a worker that loses the atomic post claim cannot fail another worker decision', () => {
    const controlled = read('apps/api/src/services/controlled-social-publishing.service.ts');
    const claimedBlock = controlled.indexOf('if (claimed) {');
    const markFailed = controlled.indexOf('markExecutionFailed(decisionId, error)');

    expect(claimedBlock).toBeGreaterThan(-1);
    expect(markFailed).toBeGreaterThan(claimedBlock);
  });
});
