const queryMock = jest.fn();
const queueCampaignProductionMock = jest.fn();
const schedulePostMock = jest.fn();

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  transaction: jest.fn(),
}));
jest.mock('../services/marketing-workforce.service', () => ({ ensureMarketingWorkforce: jest.fn() }));
jest.mock('../services/campaign-production.service', () => ({
  queueCampaignProduction: (...args: unknown[]) => queueCampaignProductionMock(...args),
}));
jest.mock('../services/controlled-social-publishing.service', () => ({
  schedulePostThroughControlCentre: (...args: unknown[]) => schedulePostMock(...args),
}));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

import { advanceGrowthCycles } from '../services/growth-director.service';

describe('mocked autonomous growth lifecycle', () => {
  test('learns from attributable results and never schedules before owner approval', async () => {
    let status = 'observing';
    let approved = false;
    let attemptCount = 0;
    const transitions: string[] = [];
    const cycle = {
      id: 'cycle-1', organization_id: 'org-1', campaign_plan_id: 'plan-1',
      status, attempt_count: attemptCount,
    };

    queueCampaignProductionMock.mockResolvedValue([]);
    schedulePostMock.mockResolvedValue({ id: 'post-1' });
    queryMock.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue).replace(/\s+/g, ' ');
      if (sql.includes('SELECT cycle.* FROM autonomous_growth_cycles')) {
        return status === 'completed' ? { rows: [] } : { rows: [{ ...cycle, status, attempt_count: attemptCount }] };
      }
      if (sql.includes('SET claim_token=')) {
        attemptCount += 1;
        return { rows: [{ ...cycle, status, attempt_count: attemptCount }] };
      }
      if (sql.includes("SET status='planning'")) { status = 'planning'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('FROM campaign_plans')) return { rows: [{ id: 'plan-1', created_by: 'owner-1' }] };
      if (sql.includes("SET status='producing'")) { status = 'producing'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('FROM organization_members')) return { rows: [{ user_id: 'owner-1' }] };
      if (sql.includes("SET status='quality_review'")) { status = 'quality_review'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('FROM campaign_asset_runs WHERE')) return { rows: [{ total: 1, completed: 1, failed: 0 }] };
      if (sql.includes("SET status='awaiting_owner_approval'")) { status = 'awaiting_owner_approval'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('COUNT(*) FILTER (WHERE content.status')) return { rows: [{ total: 1, approved: approved ? 1 : 0 }] };
      if (sql.includes("SET status='distributing'")) { status = 'distributing'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('SELECT DISTINCT ON (content.id,connection.id)')) {
        return { rows: [{
          id: 'content-1', title: 'Approved native post', type: 'social', platform: 'x',
          status: 'approved', body: 'Approved body', metadata: { delivery: { social: { body: 'Approved body' } } },
          connection_id: 'connection-1', existing_post_id: null,
        }] };
      }
      if (sql.includes("SET status='measuring'")) { status = 'measuring'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('COUNT(*)::int count FROM marketing_performance_events')) return { rows: [{ count: 2 }] };
      if (sql.includes("SET status='optimizing'")) { status = 'optimizing'; transitions.push(status); return { rows: [] }; }
      if (sql.includes('COUNT(event.id)::int AS event_count')) {
        return { rows: [{ id: 'content-1', title: 'Approved native post', platform: 'x', event_count: 2, value_pence: 5000 }] };
      }
      if (sql.includes("SET status='completed'")) { status = 'completed'; transitions.push(status); return { rows: [] }; }
      return { rows: [] };
    });

    await advanceGrowthCycles(1); // observing -> planning
    await advanceGrowthCycles(1); // planning -> producing
    await advanceGrowthCycles(1); // producing -> quality
    await advanceGrowthCycles(1); // quality -> approval
    await advanceGrowthCycles(1); // waits for owner
    expect(status).toBe('awaiting_owner_approval');
    expect(schedulePostMock).not.toHaveBeenCalled();

    approved = true;
    await advanceGrowthCycles(1); // approval -> distributing
    expect(schedulePostMock).not.toHaveBeenCalled();
    await advanceGrowthCycles(1); // schedules through Control Centre
    expect(schedulePostMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1', contentId: 'content-1', requestedBy: 'system',
    }));
    await advanceGrowthCycles(1); // measurement
    await advanceGrowthCycles(1); // learning and completion

    expect(status).toBe('completed');
    expect(transitions).toEqual([
      'planning', 'producing', 'quality_review', 'awaiting_owner_approval',
      'distributing', 'measuring', 'optimizing', 'completed',
    ]);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('owner_marketing_preferences'))).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("'performance_learning'"))).toBe(true);
  });
});
