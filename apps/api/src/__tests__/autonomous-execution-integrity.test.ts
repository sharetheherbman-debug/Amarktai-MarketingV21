import fs from 'fs';
import path from 'path';
import { executionPayloadHash } from '../services/relaunch-execution-gate.service';

const root = path.resolve(__dirname, '../../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const listTypeScript = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return listTypeScript(target);
  return entry.isFile() && entry.name.endsWith('.ts') ? [target] : [];
});

describe('autonomous execution integrity', () => {
  it('binds approvals to a canonical exact payload', () => {
    expect(executionPayloadHash({ b: 2, a: { y: true, x: 'value' } }))
      .toBe(executionPayloadHash({ a: { x: 'value', y: true }, b: 2 }));
    expect(executionPayloadHash({ body: 'approved copy' }))
      .not.toBe(executionPayloadHash({ body: 'altered copy' }));
  });

  it('rechecks expiry, policy version and emergency stop when execution is claimed', () => {
    const source = read('apps/api/src/services/relaunch-execution-gate.service.ts');
    expect(source).toContain('policy.emergency_stop=FALSE');
    expect(source).toContain('decision.policy_version=policy.version');
    expect(source).toContain('decision.approval_expires_at > NOW()');
    expect(source).toContain('RELAUNCH_APPROVAL_PAYLOAD_MISMATCH');
    expect(source).toContain("event_type,next_state,reason");
    expect(source).toContain('Campaign Generation Credit limit exceeded');
  });

  it('routes Studio and long-form GenX jobs through one governed credit lifecycle', () => {
    const worker = read('apps/api/src/workers/generation-worker.ts');
    expect((worker.match(/beginGovernedGeneration\(/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((worker.match(/markGovernedGenerationSubmitted\(/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((worker.match(/completeGovernedGeneration\(/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((worker.match(/failGovernedGeneration\(/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('routes every remote text generation call through the governed credit lifecycle', () => {
    const sourceRoot = path.join(root, 'apps/api/src');
    const bypasses = listTypeScript(sourceRoot)
      .filter((file) => !file.endsWith('provider-router.ts'))
      .filter((file) => !file.endsWith('governed-text-generation.service.ts'))
      .filter((file) => !file.endsWith('autonomous-execution-integrity.test.ts'))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('providerRouter.routeRequest('));
    expect(bypasses).toEqual([]);
    const governed = read('apps/api/src/services/governed-text-generation.service.ts');
    expect(governed).toContain("operation: 'text_input'");
    expect(governed).toContain("operation: 'text_output'");
    expect(governed).toContain('requireExecutionApproval');
    expect(governed).toContain('credits.reserveCredits({');
    expect(governed).toContain('credits.markReservationSubmitted');
    expect(governed).toContain('credits.settleReservation({');
    expect(governed).toContain('credits.releaseReservation({');
    expect(governed.indexOf('await input.onAuthorized?.()'))
      .toBeLessThan(governed.indexOf('credits.reserveCredits({'));
  });

  it('does not allow agent tools to call low-level publication or email delivery', () => {
    const tools = read('apps/api/src/services/tool.service.ts');
    expect(tools).toContain('publishPostThroughControlCentre');
    expect(tools).toContain('schedulePostThroughControlCentre');
    expect(tools).toContain('deliverEmailBatchThroughControlCentre');
    expect(tools).not.toContain('socialService.publishPost(');
    expect(tools).not.toContain("fetch('https://api.resend.com");
    expect(tools).not.toContain("fetch('https://api.sendgrid.com");
  });

  it('isolates campaign asset variations for partial recovery and replay safety', () => {
    const migration = read('apps/api/src/db/migrations/029_campaign_intelligence_and_execution_integrity.sql');
    const production = read('apps/api/src/services/campaign-production.service.ts');
    const worker = read('apps/api/src/workers/generation-worker.ts');
    expect(migration).toContain('UNIQUE (campaign_plan_id, brief_id, variant_number)');
    expect(migration).toContain('attempt_count INTEGER NOT NULL DEFAULT 0');
    expect(migration).toContain('ranked_pending_approvals');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS decision_id UUID');
    expect(migration).toContain('AFTER INSERT OR UPDATE ON relaunch_action_decisions');
    expect(production).toContain("generationQueue.add('campaign-text'");
    expect(production).toContain("status='queueing',attempt_count=attempt_count+1");
    expect(production).toContain('campaign-text:${run.id}:attempt:${attempt}');
    expect(production).toContain('studioService.retryGeneration');
    expect(production).toContain("SET status='failed',error_message=$1");
    expect(worker).toContain("job.name === 'campaign-text'");
    expect(worker).toContain("SET status='completed',content_id=$1");
  });

  it('scopes campaign reads and mutations to the authenticated organization', () => {
    const campaigns = read('apps/api/src/routes/campaigns.ts');
    expect(campaigns).toContain('id = $1 AND organization_id = $2');
    expect(campaigns).toContain('organization_id = $${paramCount + 1}');
  });
});
