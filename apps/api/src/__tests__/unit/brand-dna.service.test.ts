jest.mock('../../config/database', () => ({ query: jest.fn() }));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { query } from '../../config/database';
import * as brandDnaService from '../../services/brand-dna.service';

const queryMock = query as jest.MockedFunction<typeof query>;
const organizationId = '10000000-0000-4000-8000-000000000001';

const row = {
  id: '20000000-0000-4000-8000-000000000001',
  organization_id: organizationId,
  company_name: 'Acceptance Equine',
  company_description: 'Practical equestrian learning.',
  industry: 'Equestrian education',
  products: ['Academy', 'Shop'],
  brand_voice: 'Clear and warm',
  tone: 'professional',
  colors: { primary: '#123456' },
  logo_url: '',
  target_audience: { demographics: 'UK horse owners' },
  competitors: [],
  goals: ['Grow academy enrolment'],
  keywords: ['horse care'],
  writing_style: 'Plain English',
  compliance_rules: ['Use verified claims only'],
  preferred_ctas: ['Explore the Academy'],
  prohibited_phrases: ['guaranteed outcome'],
  social_handles: {},
  website_url: 'https://example.test',
  created_at: new Date('2026-08-24T00:00:00Z'),
  updated_at: new Date('2026-08-24T00:00:00Z'),
};

describe('Brand DNA schema contract', () => {
  beforeEach(() => queryMock.mockReset());

  it('creates and maps every customer field through the established direct columns', async () => {
    queryMock.mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

    const result = await brandDnaService.create(organizationId, {
      company_name: row.company_name,
      company_description: row.company_description,
      industry: row.industry,
      products: row.products,
      brand_voice: row.brand_voice,
      tone: row.tone,
      colors: row.colors,
      logo_url: row.logo_url,
      target_audience: row.target_audience,
      competitors: row.competitors,
      goals: row.goals,
      keywords: row.keywords,
      writing_style: row.writing_style,
      compliance_rules: row.compliance_rules,
      preferred_ctas: row.preferred_ctas,
      prohibited_phrases: row.prohibited_phrases,
      social_handles: row.social_handles,
      website_url: row.website_url,
    });

    const [sql, values] = queryMock.mock.calls[0];
    expect(sql).toContain('company_description');
    expect(sql).toContain('compliance_rules');
    expect(sql).not.toMatch(/\b(fonts|metadata)\b/);
    expect(values).toHaveLength(19);
    expect(result.products).toEqual(['Academy', 'Shop']);
    expect(result.compliance_rules).toEqual(['Use verified claims only']);
    expect(result.website_url).toBe('https://example.test');
  });

  it('updates only known direct columns and JSON-encodes structured values', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ ...row, tone: 'confident' }], rowCount: 1 } as any);

    await brandDnaService.update(organizationId, {
      tone: 'confident',
      products: ['Academy'],
      social_handles: { instagram: '@acceptance' },
    });

    const [sql, values] = queryMock.mock.calls[1];
    expect(sql).toContain('products = $1');
    expect(sql).toContain('tone = $2');
    expect(sql).toContain('social_handles = $3');
    expect(sql).not.toMatch(/\b(fonts|metadata)\b/);
    expect(values).toEqual([
      JSON.stringify(['Academy']),
      'confident',
      JSON.stringify({ instagram: '@acceptance' }),
      organizationId,
    ]);
  });
});
