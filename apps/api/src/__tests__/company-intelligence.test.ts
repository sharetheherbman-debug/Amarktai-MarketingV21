const queryMock = jest.fn();
const transactionMock = jest.fn();
const validateUrlMock = jest.fn(async (value: string) => new URL(value));
const collectMock = jest.fn();
const listMock = jest.fn();
const createMock = jest.fn();
const updateMock = jest.fn();
const syncMock = jest.fn();
const brandGetMock = jest.fn();
const brandUpsertMock = jest.fn();
const generateMock = jest.fn();
const quoteMock = jest.fn();

jest.mock('../config/env', () => ({ env: { DEFAULT_TEXT_MODEL: 'genx-text-fixture' } }));
jest.mock('../config/database', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  transaction: (...args: unknown[]) => transactionMock(...args),
}));
jest.mock('../utils/safe-fetch', () => ({
  validatePublicHttpUrl: (value: string) => validateUrlMock(value),
}));
jest.mock('../services/knowledge-ingestion.service', () => {
  const actual = jest.requireActual('../services/knowledge-ingestion.service');
  return {
    ...actual,
    collectWebsiteDocumentsDetailed: (...args: unknown[]) => collectMock(...args),
  };
});
jest.mock('../services/knowledge.service', () => ({
  list: (...args: unknown[]) => listMock(...args),
  create: (...args: unknown[]) => createMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  syncSource: (...args: unknown[]) => syncMock(...args),
}));
jest.mock('../services/brand-dna.service', () => ({
  get: (...args: unknown[]) => brandGetMock(...args),
  upsert: (...args: unknown[]) => brandUpsertMock(...args),
}));
jest.mock('../services/governed-text-generation.service', () => ({
  generateGovernedText: (...args: unknown[]) => generateMock(...args),
}));
jest.mock('../services/genx-pricing.service', () => ({
  quoteGeneration: (...args: unknown[]) => quoteMock(...args),
}));

import {
  analyseCompany,
  estimateAnalysis,
  saveState,
  saveWebEstate,
} from '../services/company-intelligence.service';

const products = [
  { scopeKey: 'management', name: 'Management', lifecycleStatus: 'live' },
  { scopeKey: 'academy', name: 'Academy', lifecycleStatus: 'live' },
  { scopeKey: 'shop', name: 'Shop', lifecycleStatus: 'coming_soon' },
];

const evidenceRows = products.map((product, index) => ({
  source_id: `source-${index + 1}`,
  source_name: product.name,
  source_url: `https://${product.scopeKey}.example.test`,
  page_url: `https://${product.scopeKey}.example.test/`,
  title: `${product.name} home`,
  content: `${product.name} first-party facts for its own customers and use cases.`,
  fingerprint: `fingerprint-${product.scopeKey}`,
  config: { product_scopes: [product.scopeKey], lifecycle_status: product.lifecycleStatus, approved_web_estate: true },
}));

describe('Company Intelligence governance', () => {
  let websiteSnapshot: Record<string, unknown> | null;
  let organizationState: Record<string, unknown>;
  const txQuery = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    websiteSnapshot = null;
    organizationState = { step: 2, products };
    queryMock.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (sql.includes("settings->'business_brain'")) return { rows: [{ business_brain: organizationState }] };
      if (sql.includes('UPDATE organizations')) return { rows: [] };
      if (sql.includes('JOIN knowledge_page_versions')) return { rows: evidenceRows };
      if (sql.includes('FROM business_knowledge_snapshots')) return { rows: websiteSnapshot ? [websiteSnapshot] : [] };
      return { rows: [] };
    });
    txQuery.mockImplementation(async (sqlValue: unknown, values?: unknown[]) => {
      const sql = String(sqlValue);
      if (sql.includes('INSERT INTO business_knowledge_snapshots')) {
        return { rows: [{ id: 'snapshot-1', version: values?.[3] || 1, fingerprint: values?.[4], payload: JSON.parse(String(values?.[5] || '{}')) }] };
      }
      return { rows: [] };
    });
    transactionMock.mockImplementation(async (callback: (client: { query: typeof txQuery }) => unknown) => callback({ query: txQuery }));
    brandGetMock.mockResolvedValue({ brand_voice: 'calm and practical' });
    brandUpsertMock.mockResolvedValue({});
    quoteMock.mockResolvedValue({ reservation_credits: 7 });
    listMock.mockResolvedValue([]);
    createMock.mockImplementation(async (_orgId, input) => ({ id: `source-${input.name}`, ...input }));
    updateMock.mockImplementation(async (id, _orgId, input) => ({ id, ...input }));
    syncMock.mockResolvedValue({ pages_accepted: 1 });
  });

  test('saves and resumes bounded onboarding state without replacing unrelated fields', async () => {
    organizationState = { step: 3, company: { name: 'EquiProfile' }, channels: ['email'], products };
    const saved = await saveState('org-1', { step: 5, strategy: { objective: 'growth' } });
    expect(saved).toMatchObject({
      step: 5,
      company: { name: 'EquiProfile' },
      channels: ['email'],
      strategy: { objective: 'growth' },
    });
    const update = queryMock.mock.calls.find(([sql]) => String(sql).includes('UPDATE organizations'));
    expect(JSON.parse(String(update?.[1]?.[0]))).toMatchObject({ company: { name: 'EquiProfile' }, step: 5 });
  });

  test('persists the approved three-site estate with isolated scope and lifecycle metadata', async () => {
    const result = await saveWebEstate('org-1', 'owner-1', [
      { url: 'https://equiprofile.online', name: 'Management', relationship: 'primary', productScopes: ['management'], lifecycleStatus: 'live', approved: true, primary: true },
      { url: 'https://academy.equiprofile.online', name: 'Academy', relationship: 'product', productScopes: ['academy'], lifecycleStatus: 'live', approved: true },
      { url: 'https://shop.equiprofile.online', name: 'Shop', relationship: 'product', productScopes: ['shop'], lifecycleStatus: 'coming_soon', approved: true },
      { url: 'https://unapproved.example.test', name: 'Unapproved', approved: false },
    ], true);

    expect(result.sites).toHaveLength(3);
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(syncMock).toHaveBeenCalledTimes(3);
    const configs = createMock.mock.calls.map((call) => call[1].config);
    expect(configs).toEqual(expect.arrayContaining([
      expect.objectContaining({ product_scopes: ['management'], lifecycle_status: 'live', primary: true }),
      expect.objectContaining({ product_scopes: ['academy'], lifecycle_status: 'live' }),
      expect.objectContaining({ product_scopes: ['shop'], lifecycle_status: 'coming_soon' }),
    ]));
  });

  test('estimates a bounded explicit GenX action and reuses an unchanged evidence fingerprint', async () => {
    const estimate = await estimateAnalysis('org-1');
    expect(estimate).toMatchObject({
      provider: 'genx', model: 'genx-text-fixture', pages: 3, sources: 3,
      maximum_reserved_credits: 14, requires_explicit_action: true,
    });
    expect(quoteMock).toHaveBeenCalledTimes(2);

    websiteSnapshot = {
      version: 4,
      fingerprint: 'snapshot-hash',
      payload: { source_fingerprint: estimate.source_fingerprint, profile: { company: { name: 'EquiProfile' } } },
    };
    const reused = await analyseCompany('org-1', 'owner-1', 'same-evidence');
    expect(reused).toMatchObject({ reused: true, snapshot_version: 4 });
    expect(generateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  test('keeps configured lifecycle authoritative and never saves malformed GenX output', async () => {
    generateMock.mockResolvedValueOnce({ content: JSON.stringify({
      company: { name: 'EquiProfile' },
      products: [{ scope_key: 'shop', name: 'Invented shop name', lifecycle_status: 'live', description: 'Available now' }],
    }) });
    const result = await analyseCompany('org-1', 'owner-1', 'review-1');
    expect((result.profile as any).products).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope_key: 'shop', name: 'Shop', lifecycle_status: 'coming_soon' }),
    ]));
    expect(transactionMock).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    websiteSnapshot = null;
    queryMock.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (sql.includes("settings->'business_brain'")) return { rows: [{ business_brain: organizationState }] };
      if (sql.includes('JOIN knowledge_page_versions')) return { rows: evidenceRows };
      if (sql.includes('FROM business_knowledge_snapshots')) return { rows: [] };
      return { rows: [] };
    });
    brandGetMock.mockResolvedValue({});
    generateMock.mockResolvedValue({ content: 'not valid JSON' });
    await expect(analyseCompany('org-1', 'owner-1', 'review-invalid')).rejects.toMatchObject({
      code: 'COMPANY_ANALYSIS_INVALID',
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
