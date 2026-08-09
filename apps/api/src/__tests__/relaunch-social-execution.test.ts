import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('Relaunch Control execution boundary', () => {
  test('scheduled social delivery cannot bypass the approval gate', () => {
    const scheduler = read('apps/api/src/services/scheduler.service.ts');
    const controlled = read('apps/api/src/services/controlled-social-publishing.service.ts');
    const gate = read('apps/api/src/services/relaunch-execution-gate.service.ts');

    expect(scheduler).toContain('publishDuePostsThroughControlCentre');
    expect(scheduler).not.toContain("from './social-publishing.service'");
    expect(controlled).toContain('requireExecutionApproval');
    expect(controlled).toContain("idempotency_key: `social-publish:${postId}`");
    expect(controlled).toContain("status='publishing'");
    expect(controlled).toContain("status='scheduled'");
    expect(controlled.indexOf('requireExecutionApproval')).toBeLessThan(controlled.indexOf('publishPost(postId'));
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
});
