const queryMock = jest.fn();
const transactionMock = jest.fn();
const ensureMarketingWorkforceMock = jest.fn();

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  transaction: (...args: unknown[]) => transactionMock(...args),
}));
jest.mock('../services/marketing-workforce.service', () => ({
  ensureMarketingWorkforce: (...args: unknown[]) => ensureMarketingWorkforceMock(...args),
}));
jest.mock('../services/campaign-production.service', () => ({ queueCampaignProduction: jest.fn() }));
jest.mock('../services/controlled-social-publishing.service', () => ({ schedulePostThroughControlCentre: jest.fn() }));
jest.mock('../services/campaign-planner.service', () => ({ generatePlan: jest.fn() }));
jest.mock('../services/context-engine.service', () => ({ contextEngine: { assemble: jest.fn() } }));
jest.mock('../services/content-engine.service', () => ({ reviseContentFromOwnerFeedback: jest.fn() }));
jest.mock('../services/content-workflow.service', () => ({ submitForReview: jest.fn() }));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

import { createOwnerGrowthCycle } from '../services/growth-director.service';

describe('owner-initiated autonomous campaign entry point', () => {
  beforeEach(() => {
    queryMock.mockReset();
    transactionMock.mockReset();
    ensureMarketingWorkforceMock.mockReset().mockResolvedValue(19);
  });

  test('persists the exact instruction, bounded scope, ceiling, governance snapshot and event', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: jest.fn(async (sqlValue: unknown, params: unknown[] = []) => {
        const sql = String(sqlValue);
        calls.push({ sql, params });
        if (sql.includes('SELECT * FROM relaunch_control_policies')) {
          return { rows: [{ operating_mode: 'approval', emergency_stop: false, version: 7 }] };
        }
        if (sql.includes('WHERE organization_id=$1 AND idempotency_key=$2')) return { rows: [] };
        if (sql.includes('INSERT INTO autonomous_growth_cycles')) {
          return { rows: [{ id: 'cycle-1', objective: params[1], originating_instruction: params[1], status: 'observing' }] };
        }
        return { rows: [] };
      }),
    };
    transactionMock.mockImplementation(async (callback: (value: typeof client) => unknown) => callback(client));

    const objective = 'Create a complete Academy launch campaign for UK horse owners.';
    const result = await createOwnerGrowthCycle({
      organizationId: 'org-1', userId: 'owner-1', objective,
      productLines: ['Shop', 'Academy'], idempotencyKey: 'owner-cycle-0001', generationCreditCeiling: 2500,
    });

    expect(result).toMatchObject({ id: 'cycle-1', originating_instruction: objective });
    expect(ensureMarketingWorkforceMock).toHaveBeenCalledWith('org-1');
    const insert = calls.find((call) => call.sql.includes('INSERT INTO autonomous_growth_cycles'))!;
    expect(insert.params).toEqual(expect.arrayContaining([
      objective, JSON.stringify(['academy', 'shop']), 2500, 'owner-cycle-0001', 'owner-1',
    ]));
    const event = calls.find((call) => call.sql.includes('INSERT INTO autonomous_growth_events'))!;
    expect(JSON.parse(String(event.params[2]))).toMatchObject({
      originating_instruction: objective,
      product_lines: ['academy', 'shop'],
      generation_credit_ceiling: 2500,
      governance_mode: 'approval',
    });
  });

  test('fails closed while Emergency Stop is active', async () => {
    const client = {
      query: jest.fn(async (sqlValue: unknown) => String(sqlValue).includes('SELECT * FROM relaunch_control_policies')
        ? { rows: [{ operating_mode: 'manual', emergency_stop: true, version: 2 }] }
        : { rows: [] }),
    };
    transactionMock.mockImplementation(async (callback: (value: typeof client) => unknown) => callback(client));
    await expect(createOwnerGrowthCycle({
      organizationId: 'org-1', userId: 'owner-1', objective: 'Create a bounded campaign from current Business Brain facts.',
      idempotencyKey: 'owner-cycle-0002', generationCreditCeiling: 100,
    })).rejects.toMatchObject({ code: 'EMERGENCY_STOP_ACTIVE', statusCode: 409 });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO autonomous_growth_cycles'))).toBe(false);
  });
});
