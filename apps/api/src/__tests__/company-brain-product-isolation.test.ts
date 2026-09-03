const queryMock = jest.fn();
const hybridSearchMock = jest.fn();

jest.mock('../config/database', () => ({ query: (...args: unknown[]) => queryMock(...args) }));
jest.mock('../services/knowledge-ingestion.service', () => ({
  hybridSearch: (...args: unknown[]) => hybridSearchMock(...args),
}));
jest.mock('../services/brand-dna.service', () => ({
  get: jest.fn(async () => ({ company_name: 'EquiProfile' })),
  getContextString: jest.fn(async () => 'COMPANY: EquiProfile'),
}));
jest.mock('../services/platform-intelligence.service', () => ({ getPlatformIntelligenceContext: jest.fn(() => '') }));

import { contextEngine } from '../services/context-engine.service';

const allProducts = [
  { scope_key: 'management', name: 'Management', lifecycle_status: 'live', description: 'Horse records and yard workflows' },
  { scope_key: 'academy', name: 'Academy', lifecycle_status: 'live', description: 'Equestrian learning and assessments' },
  { scope_key: 'shop', name: 'Shop', lifecycle_status: 'coming_soon', description: 'Future curated shopping experience' },
];

describe('Company Brain product-scope isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hybridSearchMock.mockImplementation(async (_orgId, _query, _limit, scopes: string[]) =>
      allProducts.filter((product) => scopes.length === 0 || scopes.includes(product.scope_key)).map((product) => ({
        title: product.name,
        content: product.description,
        url: `https://${product.scope_key}.example.test`,
        metadata: { product_scopes: [product.scope_key], lifecycle_status: product.lifecycle_status },
      })),
    );
    queryMock.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (sql.includes('FROM agents')) return { rows: [] };
      if (sql.includes('FROM business_knowledge_snapshots')) return { rows: [{
        source_type: 'owner',
        payload: { profile: { company: { name: 'EquiProfile' }, products: allProducts } },
      }] };
      return { rows: [] };
    });
  });

  test.each([
    [['academy'], ['Academy'], ['Horse records and yard workflows', 'Future curated shopping experience']],
    [['management'], ['Management'], ['Equestrian learning and assessments', 'Future curated shopping experience']],
    [['management', 'academy'], ['Management', 'Academy'], ['Future curated shopping experience']],
  ])('limits assembled context for scopes %j', async (scopes, included, excluded) => {
    const context = await contextEngine.assemble({
      orgId: 'org-1',
      includeKnowledge: true,
      includePlatformIntelligence: false,
      knowledgeQuery: 'campaign',
      productScopes: scopes,
    });
    for (const expected of included) expect(context.fullContext).toContain(expected);
    for (const absent of excluded) expect(context.fullContext).not.toContain(absent);
    expect(hybridSearchMock).toHaveBeenCalledWith('org-1', 'campaign', 7, scopes);
  });
});
