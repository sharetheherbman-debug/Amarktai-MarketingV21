const queryMock = jest.fn();
const queueCampaignProductionMock = jest.fn();
const schedulePostMock = jest.fn();
const ensureMarketingWorkforceMock = jest.fn();
const generatePlanMock = jest.fn();
const assembleContextMock = jest.fn();
const reviseFromFeedbackMock = jest.fn();
const submitForReviewMock = jest.fn();

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  transaction: jest.fn(),
}));
jest.mock('../services/marketing-workforce.service', () => ({
  ensureMarketingWorkforce: (...args: unknown[]) => ensureMarketingWorkforceMock(...args),
}));
jest.mock('../services/campaign-production.service', () => ({
  queueCampaignProduction: (...args: unknown[]) => queueCampaignProductionMock(...args),
}));
jest.mock('../services/controlled-social-publishing.service', () => ({
  schedulePostThroughControlCentre: (...args: unknown[]) => schedulePostMock(...args),
}));
jest.mock('../services/campaign-planner.service', () => ({
  generatePlan: (...args: unknown[]) => generatePlanMock(...args),
}));
jest.mock('../services/context-engine.service', () => ({
  contextEngine: { assemble: (...args: unknown[]) => assembleContextMock(...args) },
}));
jest.mock('../services/content-engine.service', () => ({
  reviseContentFromOwnerFeedback: (...args: unknown[]) => reviseFromFeedbackMock(...args),
}));
jest.mock('../services/content-workflow.service', () => ({
  submitForReview: (...args: unknown[]) => submitForReviewMock(...args),
}));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

import { advanceGrowthCycles, ensureBaselineCycle } from '../services/growth-director.service';

describe('fresh-workspace autonomous growth and owner-feedback lifecycle', () => {
  beforeEach(() => {
    for (const mock of [
      queryMock, queueCampaignProductionMock, schedulePostMock, ensureMarketingWorkforceMock,
      generatePlanMock, assembleContextMock, reviseFromFeedbackMock, submitForReviewMock,
    ]) mock.mockReset();
  });

  test('creates its first campaign, closes owner feedback, governs distribution, learns, and completes', async () => {
    let status = 'observing';
    let campaignPlanId: string | null = null;
    let attemptCount = 0;
    let baselineNumber = 0;
    let allowNextBaseline = false;
    let feedbackActive = false;
    let revisedApproved = false;
    let runOneResolution = 'pending_review';
    let runTwoResolution = 'pending_review';
    let runThreeResolution = 'pending_review';
    const transitions: string[] = [];

    ensureMarketingWorkforceMock.mockResolvedValue(19);
    assembleContextMock.mockResolvedValue({
      brandDna: 'Configured brand', knowledge: 'Shared living business brain', fullContext: 'Evidence',
    });
    generatePlanMock.mockResolvedValue({
      id: 'plan-1', strategy_validation_status: 'valid', owner_clarification: [],
      asset_requirements: [
        { brief_id: 'brief-1', platform: 'x', format: 'social' },
        { brief_id: 'brief-2', platform: 'x', format: 'social' },
        { brief_id: 'brief-3', platform: 'x', format: 'social' },
      ],
    });
    queueCampaignProductionMock.mockResolvedValue([]);
    submitForReviewMock.mockResolvedValue({ id: 'approval-new' });
    reviseFromFeedbackMock.mockImplementation(async (contentId: string) => ({ id: contentId, version: 2 }));
    schedulePostMock.mockResolvedValue({ id: 'post-1' });

    queryMock.mockImplementation(async (sqlValue: unknown, params: unknown[] = []) => {
      const sql = String(sqlValue).replace(/\s+/g, ' ');
      if (sql.includes('started_at > NOW()')) return { rows: allowNextBaseline ? [] : baselineNumber > 0 ? [{ id: 'cycle-1' }] : [] };
      if (sql.includes('INSERT INTO autonomous_growth_cycles (organization_id,status,trigger_type')) {
        baselineNumber += 1;
        status = 'observing';
        campaignPlanId = null;
        return { rows: [{ id: `cycle-${baselineNumber}` }] };
      }
      if (sql.includes('SELECT cycle.* FROM autonomous_growth_cycles')) {
        return status === 'completed' ? { rows: [] } : { rows: [{
          id: `cycle-${baselineNumber}`, organization_id: 'org-1', campaign_plan_id: campaignPlanId,
          status, attempt_count: attemptCount, trigger_type: 'scheduled',
          objective: 'Continuous organic growth review', opportunity: { source: 'scheduled_baseline' },
        }] };
      }
      if (sql.includes('SET claim_token=')) {
        attemptCount += 1;
        return { rows: [{
          id: `cycle-${baselineNumber}`, organization_id: 'org-1', campaign_plan_id: campaignPlanId,
          status, attempt_count: attemptCount, trigger_type: 'scheduled',
          objective: 'Continuous organic growth review', opportunity: { source: 'scheduled_baseline' },
        }] };
      }
      if (sql.includes("SET status='planning'")) { status = 'planning'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('SELECT plan.* FROM campaign_plans')) return { rows: [] };
      if (sql.includes("role='owner'")) return { rows: [{ user_id: 'owner-1' }] };
      if (sql.includes("SET status='producing'")) {
        status = 'producing'; campaignPlanId = String(params[0]); transitions.push(status); return { rows: [] };
      }
      if (sql.includes("SET status='quality_review'")) { status = 'quality_review'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('COUNT(*) FILTER (WHERE status=\'completed\')')) {
        return { rows: [{ total: 3, completed: 3, failed: 0, terminal_failed: 0 }] };
      }
      if (sql.includes('LEFT JOIN content_items content') && sql.includes("run.status='completed'")) {
        return { rows: [
          { campaign_asset_run_id: 'run-1', id: 'run-1', campaign_plan_id: 'plan-1', content_id: 'content-1', version: 1, content_status: 'draft', workflow_state: 'ready_for_review' },
          { campaign_asset_run_id: 'run-2', id: 'run-2', campaign_plan_id: 'plan-1', content_id: 'content-2', version: 1, content_status: 'draft', workflow_state: 'ready_for_review' },
          { campaign_asset_run_id: 'run-3', id: 'run-3', campaign_plan_id: 'plan-1', content_id: 'content-3', version: 1, content_status: 'draft', workflow_state: 'ready_for_review' },
        ] };
      }
      if (sql.includes("SET status='awaiting_owner_approval'")) { status = 'awaiting_owner_approval'; transitions.push(status); return { rows: [] }; }
      if (sql.includes("run.resolution_status IN ('revision_requested','rejection_received','revision_generated')")) {
        if (!feedbackActive) return { rows: [] };
        feedbackActive = false;
        return { rows: [
          {
            campaign_asset_run_id: 'run-1', id: 'run-1', campaign_plan_id: 'plan-1', brief_id: 'brief-1',
            content_id: 'content-1', version: 1, resolved_content_version: 1, feedback_attempt_count: 0,
            resolution_status: 'revision_requested', owner_feedback: { decision: 'changes_requested', comments: 'Make the opening clearer', approval_id: 'approval-1', content_version: 1 },
            asset_requirements: [{ brief_id: 'brief-1' }, { brief_id: 'brief-2' }],
          },
          {
            campaign_asset_run_id: 'run-2', id: 'run-2', campaign_plan_id: 'plan-1', brief_id: 'brief-2',
            content_id: 'content-2', version: 1, resolved_content_version: 1, feedback_attempt_count: 0,
            resolution_status: 'rejection_received', owner_feedback: { decision: 'rejected', comments: 'Do not use this angle', approval_id: 'approval-2', content_version: 1 },
            asset_requirements: [{ brief_id: 'brief-1' }, { brief_id: 'brief-2' }],
          },
          {
            campaign_asset_run_id: 'run-3', id: 'run-3', campaign_plan_id: 'plan-1', brief_id: 'brief-3',
            content_id: 'content-3', version: 1, resolved_content_version: 1, feedback_attempt_count: 0,
            resolution_status: 'rejection_received', owner_feedback: { decision: 'rejected', comments: 'Retire this optional angle', approval_id: 'approval-3', content_version: 1 },
            asset_requirements: [{ brief_id: 'brief-1' }, { brief_id: 'brief-2' }, { brief_id: 'brief-3' }],
          },
        ] };
      }
      if (sql.includes('brief_id=$3 AND id<>$4')) return { rows: String(params[2]) === 'brief-3' ? [{ id: 'run-3-alternative' }] : [] };
      if (sql.includes('UPDATE campaign_asset_runs SET resolution_status=$1')) {
        const resolution = String(params[0]);
        const runId = String(params[2]);
        if (runId === 'run-1') runOneResolution = resolution;
        if (runId === 'run-2') runTwoResolution = resolution;
        if (runId === 'run-3') runThreeResolution = resolution;
        return { rows: [] };
      }
      if (sql.includes("SET resolution_status='pending_review'")) {
        const runId = String(params[1]);
        if (runId === 'run-1') runOneResolution = 'pending_review';
        if (runId === 'run-2') runTwoResolution = 'pending_review';
        if (runId === 'run-3') runThreeResolution = 'pending_review';
        return { rows: [] };
      }
      if (sql.includes("content.status='approved' AND run.resolution_status='pending_review'")) {
        if (revisedApproved) { runOneResolution = 'approved'; runTwoResolution = 'approved'; }
        return { rows: [] };
      }
      if (sql.includes("COUNT(*) FILTER (WHERE resolution_status IN")) {
        const resolved = [runOneResolution, runTwoResolution, runThreeResolution].filter((value) => [
          'approved','approved_and_scheduled','retired_by_owner','replaced',
          'failed_after_bounded_retries','owner_clarification_required',
        ].includes(value)).length;
        return { rows: [{ total: 3, resolved,
          approved: [runOneResolution, runTwoResolution].filter((value) => value.startsWith('approved')).length,
          retired: runThreeResolution === 'retired_by_owner' ? 1 : 0, failed: 0, clarification: 0 }] };
      }
      if (sql.includes("SET status='distributing'")) { status = 'distributing'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('SELECT DISTINCT ON (content.id,connection.id)')) {
        return { rows: [{
          id: 'content-1', campaign_asset_run_id: 'run-1', campaign_plan_id: 'plan-1', title: 'Approved revised post',
          type: 'social', platform: 'x', status: 'approved', version: 2, body: 'Approved revised body',
          metadata: { delivery: { social: { body: 'Approved revised body' } } },
          connection_id: 'connection-1', existing_post_id: null,
        }] };
      }
      if (sql.includes("SET status='measuring'")) { status = 'measuring'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('COUNT(*)::int count FROM marketing_performance_events')) return { rows: [{ count: 2 }] };
      if (sql.includes("SET status='optimizing'")) { status = 'optimizing'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('COUNT(event.id)::int AS event_count')) {
        return { rows: [{ id: 'content-1', title: 'Approved revised post', platform: 'x', event_count: 2, value_pence: 5000 }] };
      }
      if (sql.includes("SET status='completed'")) { status = 'completed'; transitions.push(status); return { rows: [] }; }
      return { rows: [] };
    });

    expect(await ensureBaselineCycle('org-1')).toBe('cycle-1');
    expect(ensureMarketingWorkforceMock).toHaveBeenCalledWith('org-1');

    await advanceGrowthCycles(1); // observe -> plan
    await advanceGrowthCycles(1); // create/validate plan -> produce
    expect(assembleContextMock).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1', includeKnowledge: true }));
    expect(generatePlanMock).toHaveBeenCalledWith('org-1', expect.objectContaining({
      idempotency_key: 'growth-cycle:cycle-1:campaign-plan:v1', budget_cents: 0,
    }), 'owner-1');
    await advanceGrowthCycles(1); // queue production
    await advanceGrowthCycles(1); // quality -> submit both -> owner review
    expect(submitForReviewMock).toHaveBeenCalledTimes(3);
    await advanceGrowthCycles(1); // no owner decision: remain waiting
    expect(status).toBe('awaiting_owner_approval');
    expect(schedulePostMock).not.toHaveBeenCalled();

    feedbackActive = true;
    await advanceGrowthCycles(1); // targeted revision + reject/retire
    expect(reviseFromFeedbackMock).toHaveBeenCalledWith('content-1', 'org-1', 'owner-1', expect.objectContaining({
      decision: 'changes_requested', instruction: 'Make the opening clearer',
    }));
    expect(reviseFromFeedbackMock).toHaveBeenCalledWith('content-2', 'org-1', 'owner-1', expect.objectContaining({
      decision: 'rejected', instruction: 'Do not use this angle',
    }));
    expect(runOneResolution).toBe('pending_review');
    expect(runTwoResolution).toBe('pending_review');
    expect(runThreeResolution).toBe('retired_by_owner');
    expect(status).toBe('awaiting_owner_approval');
    expect(schedulePostMock).not.toHaveBeenCalled();

    revisedApproved = true;
    await advanceGrowthCycles(1); // all required assets now resolved
    expect(status).toBe('distributing');
    expect(schedulePostMock).not.toHaveBeenCalled();
    await advanceGrowthCycles(1); // exact approved version through Control Centre
    expect(schedulePostMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', contentId: 'content-1', requestedBy: 'system',
    }));
    await advanceGrowthCycles(1); // measure
    await advanceGrowthCycles(1); // optimize/complete

    expect(status).toBe('completed');
    expect(transitions).toEqual([
      'planning', 'producing', 'quality_review', 'awaiting_owner_approval',
      'distributing', 'measuring', 'optimizing', 'completed',
    ]);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('owner_marketing_preferences'))).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("'performance_learning'"))).toBe(true);

    allowNextBaseline = true;
    expect(await ensureBaselineCycle('org-1')).toBe('cycle-2');
    expect(ensureMarketingWorkforceMock).toHaveBeenCalledTimes(2);
  });

  test('pauses truthfully for genuine owner-dependent campaign facts', async () => {
    let ownerClarificationState: Record<string, unknown> | null = null;
    assembleContextMock.mockResolvedValue({ brandDna: 'Brand', knowledge: 'Business brain' });
    generatePlanMock.mockResolvedValue({
      id: 'plan-clarification', strategy_validation_status: 'owner_clarification',
      owner_clarification: [{ type: 'missing_information', question: 'Confirm the current price' }],
    });
    queryMock.mockImplementation(async (sqlValue: unknown, params: unknown[] = []) => {
      const sql = String(sqlValue).replace(/\s+/g, ' ');
      if (sql.includes('SELECT cycle.* FROM autonomous_growth_cycles')) return { rows: [{
        id: 'cycle-clarification', organization_id: 'org-1', status: 'planning', attempt_count: 0,
        trigger_type: 'scheduled', objective: 'Baseline', opportunity: { source: 'scheduled_baseline' },
      }] };
      if (sql.includes('SET claim_token=')) return { rows: [{
        id: 'cycle-clarification', organization_id: 'org-1', status: 'planning', attempt_count: 1,
        trigger_type: 'scheduled', objective: 'Baseline', opportunity: { source: 'scheduled_baseline' },
      }] };
      if (sql.includes('SELECT plan.* FROM campaign_plans')) return { rows: [] };
      if (sql.includes("role='owner'")) return { rows: [{ user_id: 'owner-1' }] };
      if (sql.includes("waiting_for: 'owner_clarification'") || sql.includes('state=state || $3::jsonb')) {
        ownerClarificationState = JSON.parse(String(params[2]));
      }
      return { rows: [] };
    });

    await advanceGrowthCycles(1);
    expect(ownerClarificationState).toEqual(expect.objectContaining({ waiting_for: 'owner_clarification' }));
    expect(queueCampaignProductionMock).not.toHaveBeenCalled();
  });
});
