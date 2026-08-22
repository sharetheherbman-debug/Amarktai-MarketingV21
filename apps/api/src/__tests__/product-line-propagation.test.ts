import { readFileSync } from 'fs';
import { resolve } from 'path';
import { legacyProductLine, normalizeProductScopeKey, normalizeProductScopes } from '../utils/product-scope';

describe('generic multi-product campaign propagation', () => {
  const root = resolve(process.cwd());
  const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

  const legacyMigration = source('src/db/migrations/033_product_line_campaign_intelligence.sql');
  const genericMigration = source('src/db/migrations/034_generic_multi_product_scope.sql');
  const connector = source('src/services/application-connector.service.ts');
  const planner = source('src/services/campaign-planner.service.ts');
  const production = source('src/services/campaign-production.service.ts');
  const growthDirector = source('src/services/growth-director.service.ts');
  const campaignRoute = source('src/routes/campaigns.ts');
  const campaignAiRoute = source('src/routes/campaign-ai.ts');
  const validation = source('src/utils/validation.ts');
  const worker = source('src/workers/generation-worker.ts');
  const plannerUi = readFileSync(resolve(root, '../web/app/(dashboard)/campaign-planner/page.tsx'), 'utf8');

  it('keeps legacy migration history immutable and adds a forward generic multi-scope migration', () => {
    expect(legacyMigration).toContain("CHECK (product_line IN ('management','academy','shop'))");
    expect(genericMigration).toContain('DROP CONSTRAINT IF EXISTS campaign_plans_product_line_check');
    expect(genericMigration).toContain("ADD COLUMN IF NOT EXISTS product_lines JSONB NOT NULL DEFAULT '[]'::jsonb");
    expect(genericMigration).toContain('USING GIN (product_lines)');
    for (const table of [
      'campaign_plans',
      'campaigns',
      'campaign_asset_runs',
      'application_conversion_events',
      'marketing_performance_events',
    ]) {
      expect(genericMigration).toContain(`ALTER TABLE ${table}`);
      expect(genericMigration).toContain(`UPDATE ${table}`);
    }
  });

  it('normalizes arbitrary connected-app scope keys without hard-coding EquiProfile products', () => {
    expect(normalizeProductScopeKey('CRM-Pro')).toBe('crm-pro');
    expect(normalizeProductScopes(['crm-pro', 'Consulting', 'crm-pro'])).toEqual(['crm-pro', 'consulting']);
    expect(legacyProductLine(['crm-pro'])).toBe('crm-pro');
    expect(legacyProductLine(['crm-pro', 'consulting'])).toBeNull();
    expect(() => normalizeProductScopes(['not valid!'])).toThrow();
  });

  it('stores generic connector scope in immutable conversions and derived attribution', () => {
    expect(connector).toContain('normalizeProductScopes');
    expect(connector).toContain('product_lines');
    expect(connector).toContain('application_conversion_events');
    expect(connector).toContain('marketing_performance_events');
    expect(connector).toContain("'conversion_signal'");
    expect(connector).not.toContain("['management', 'academy', 'shop'].includes");
  });

  it('carries canonical multi-scope context through campaign planning and versioning', () => {
    expect(planner).toContain('product_lines?: string[]');
    expect(planner).toContain('const productLines = normalizeProductScopes');
    expect(planner).toContain('product_scopes: productLines.length > 0 ? productLines');
    expect(planner).toContain('planning_idempotency_key,product_line,product_lines');
    expect(planner).toContain('product_lines');
  });

  it('validates and persists generic scope arrays in campaign CRUD', () => {
    expect(validation).toContain('product_lines');
    expect(campaignRoute).toContain('product_lines');
    expect(campaignAiRoute).toContain('product_lines');
    expect(campaignAiRoute).toContain('normalizeProductScopes');
    expect(campaignAiRoute).not.toContain("product_line must be management, academy, or shop");
  });

  it('propagates multi-scope context into durable asset runs and generated content', () => {
    expect(production).toContain('product_lines');
    expect(production).toContain('normalizeProductScopes');
    expect(worker).toContain('product_lines');
    expect(worker).toContain('product_line');
  });

  it('exposes reusable multi-product scope in the Campaign Planner UI', () => {
    expect(plannerUi).toContain('Product/service scopes');
    expect(plannerUi).toContain('product_lines');
    expect(plannerUi).not.toContain('<option value="management">Management</option>');
    expect(plannerUi).not.toContain('<option value="academy">Academy</option>');
    expect(plannerUi).not.toContain('<option value="shop">Shop</option>');
  });

  it('keeps Growth Director plan reuse, attribution and learning multi-scope aware', () => {
    expect(growthDirector).toContain('plan.product_lines ?| $3::text[]');
    expect(growthDirector).toContain('run.product_lines ? event.product_line');
    expect(growthDirector).toContain('product_lines: opportunityScopes');
    expect(growthDirector).toContain('product_lines: winnerScopes');
    expect(growthDirector).not.toContain("['management', 'academy', 'shop'].includes");
  });
});
