const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  transaction: (...args: unknown[]) => transactionMock(...args),
}));
jest.mock('../utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));

import { approve, reject, requestChanges } from '../services/content-workflow.service';

describe('owner feedback closes campaign asset state', () => {
  const content = {
    id: 'content-1', organization_id: 'org-1', version: 4, type: 'social', platform: 'x',
    title: 'Campaign post', body: 'Exact version four', format: 'markdown', metadata: {},
  };

  beforeEach(() => {
    queryMock.mockReset();
    transactionMock.mockReset();
  });

  test.each([
    ['changes_requested', requestChanges, 'revision_requested'],
    ['rejected', reject, 'rejection_received'],
  ] as const)('%s records durable autonomous follow-up state', async (decision, operation, resolution) => {
    const clientQuery = jest.fn(async (sqlValue: unknown, params: unknown[] = []) => {
      const sql = String(sqlValue).replace(/\s+/g, ' ');
      if (sql.includes('SELECT content.*')) return { rows: [content] };
      if (sql.includes('UPDATE content_approvals approval')) return { rows: [{
        id: 'approval-1', content_id: content.id, organization_id: 'org-1', status: decision,
        assigned_to: 'owner-1', comments: 'Owner direction', reviewed_by: 'owner-1',
      }] };
      if (sql.includes('UPDATE campaign_asset_runs SET resolution_status=')) {
        expect(params[0]).toBe(resolution);
        expect(JSON.parse(String(params[1]))).toEqual(expect.objectContaining({
          decision, comments: 'Owner direction', content_version: 4,
        }));
        return { rows: [{ id: 'run-1', campaign_plan_id: 'plan-1' }] };
      }
      return { rows: [] };
    });
    transactionMock.mockImplementation(async (callback: (client: { query: typeof clientQuery }) => unknown) => callback({ query: clientQuery }));

    await operation(content.id, 'org-1', 'owner-1', 'Owner direction');
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('owner_marketing_preferences'))).toBe(true);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE campaign_asset_runs SET resolution_status='))).toBe(true);
  });

  test('approval resolves the exact content version for governed distribution', async () => {
    const clientQuery = jest.fn(async (sqlValue: unknown, params: unknown[] = []) => {
      const sql = String(sqlValue).replace(/\s+/g, ' ');
      if (sql.includes('SELECT content.*')) return { rows: [content] };
      if (sql.includes('UPDATE content_approvals approval')) return { rows: [{
        id: 'approval-1', content_id: content.id, organization_id: 'org-1', status: 'approved', assigned_to: 'owner-1',
      }] };
      if (sql.includes('UPDATE campaign_asset_runs SET resolution_status=')) {
        expect(params[0]).toBe('approved');
        expect(params[2]).toBe(4);
        return { rows: [{ id: 'run-1', campaign_plan_id: 'plan-1' }] };
      }
      return { rows: [] };
    });
    transactionMock.mockImplementation(async (callback: (client: { query: typeof clientQuery }) => unknown) => callback({ query: clientQuery }));

    await approve(content.id, 'org-1', 'owner-1', 'Approved');
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('campaign_asset_resolution_events'))).toBe(true);
  });
});
