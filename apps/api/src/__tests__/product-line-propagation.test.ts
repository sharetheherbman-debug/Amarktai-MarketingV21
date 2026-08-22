import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('generic product-line campaign propagation', () => {
  const root = resolve(process.cwd());
  const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

  const migration = source('src/db/migrations/033_product_line_campaign_intelligence.sql');
  const connector = source('src/services/application-connector.service.ts');
  const planner = source('src/services/campaign-planner.service.ts');
  const production = source('src/services/campaign-production.service.ts');
  const growthDirector = source('src/services/growth-director.service.ts');
  const campaignRoute = source('src/routes/campaigns.ts');
  const campaignAiRoute = source('src/routes/campaign-ai.ts');
  const validation = source('src/utils/validation.ts');
  const worker = source('src/workers/generation-worker.ts');
  const plannerUi = readFileSync(resolve(root, '../web/app/(dashboard)/campaign-planner/page.tsx'), 'utf8');

  it('adds an additive, nullable product-line dimension without assigning legacy records', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS product_line VARCHAR(32)');
    expect(migration).toContain("CHECK (product_line IN ('management','academy','shop'))");
    for (const table of [
      'campaign_plans',
      'campaigns',
      'campaign_asset_runs',
      'application_conversion_events',
      'marketing_performance_events',
    ]) {
      expect(migration).toContain(`ALTER TABLE ${table}`);
    }
    expect(migration).not.toContain('UPDATE campaign_plans SET product_line');
    expect(migration).not.toContain('UPDATE campaigns SET product_line');
  });

  it('stores validated connector scope in immutable conversions and derived attribution', () => {
    expect(connector).toContain('export function normalizeProductLine');
    expect(connector).toContain('consent_basis,product_line,properties');
    expect(connector).toContain('value_pence,product_line,metrics');
    expect(connector).toContain("'conversion_signal'");
  });

  it('carries optional product-line scope through campaign planning and plan versioning', () => {
    expect(planner).toContain('product_line?: HostProductLine');
    expect(planner).toContain("product_line: input.product_line || 'unclassified'");
    expect(planner).toContain('planning_idempotency_key,product_line');
    expect(planner).toContain("['product_line', 'product_line', false]");
  });

  it('validates and persists the same generic scope in campaign CRUD', () => {
    expect(validation).toContain("product_line: z.enum(['management', 'academy', 'shop']).optional()");
    expect(campaignRoute).toContain('type, product_line, project_id');
    expect(campaignRoute).toContain('product_line, config, schedule, created_by');
    expect(campaignRoute).toContain('CAMPAIGN_PRODUCT_LINE_INVALID');
    expect(campaignAiRoute).toContain("code: 'PRODUCT_LINE_INVALID'");
    expect(campaignAiRoute).toContain('product_line: product_line || undefined');
  });

  it('propagates plan scope into durable asset runs and generated content metadata', () => {
    expect(production).toContain('variant_number,product_line,generation_kind');
    expect(production).toContain('product_line: plan.product_line || null');
    expect(production).toContain('product_line: plan.product_line || undefined');
    expect(worker).toContain('data.request?.product_line');
    expect(worker).toContain("JSON.stringify({ product_line: data.request.product_line })");
  });

  it('exposes optional scope in the Campaign Planner user interface', () => {
    expect(plannerUi).toContain('Product line');
    expect(plannerUi).toContain('No product-line scope');
    expect(plannerUi).toContain('product_line: form.product_line || undefined');
    expect(plannerUi).toContain('plan.product_line');
  });

  it('keeps Growth Director reuse and performance learning scoped to the product line', () => {
    expect(growthDirector).toContain("AND ($3::text IS NULL OR plan.product_line=$3)");
    expect(growthDirector).toContain('[organizationId, cycle.id, opportunityProductLine]');
    expect(growthDirector).toContain('event.product_line=run.product_line');
    expect(growthDirector).toContain('product_line: opportunityProductLine');
    expect(growthDirector).toContain('product_line: winner.product_line || null');
  });
});
