-- Generic multi-product scope for reusable Marketing application connectors.
--
-- Migration 033 introduced a legacy scalar product_line constrained to the
-- first EquiProfile product family. Keep that scalar as a compatibility field
-- for existing data, but remove the EquiProfile-only database restriction and
-- add normalized JSON arrays for campaigns/plans/assets/performance events.

ALTER TABLE campaign_plans
  DROP CONSTRAINT IF EXISTS campaign_plans_product_line_check;
ALTER TABLE campaign_plans
  ALTER COLUMN product_line TYPE VARCHAR(64);
ALTER TABLE campaign_plans
  ADD COLUMN IF NOT EXISTS product_lines JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE campaign_plans
  ADD CONSTRAINT campaign_plans_product_lines_array_check
  CHECK (jsonb_typeof(product_lines) = 'array');

ALTER TABLE campaigns
  DROP CONSTRAINT IF EXISTS campaigns_product_line_check;
ALTER TABLE campaigns
  ALTER COLUMN product_line TYPE VARCHAR(64);
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS product_lines JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE campaigns
  ADD CONSTRAINT campaigns_product_lines_array_check
  CHECK (jsonb_typeof(product_lines) = 'array');

ALTER TABLE campaign_asset_runs
  DROP CONSTRAINT IF EXISTS campaign_asset_runs_product_line_check;
ALTER TABLE campaign_asset_runs
  ALTER COLUMN product_line TYPE VARCHAR(64);
ALTER TABLE campaign_asset_runs
  ADD COLUMN IF NOT EXISTS product_lines JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE campaign_asset_runs
  ADD CONSTRAINT campaign_asset_runs_product_lines_array_check
  CHECK (jsonb_typeof(product_lines) = 'array');

ALTER TABLE application_conversion_events
  DROP CONSTRAINT IF EXISTS application_conversion_events_product_line_check;
ALTER TABLE application_conversion_events
  ALTER COLUMN product_line TYPE VARCHAR(64);
ALTER TABLE application_conversion_events
  ADD COLUMN IF NOT EXISTS product_lines JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE application_conversion_events
  ADD CONSTRAINT application_conversion_events_product_lines_array_check
  CHECK (jsonb_typeof(product_lines) = 'array');

ALTER TABLE marketing_performance_events
  DROP CONSTRAINT IF EXISTS marketing_performance_events_product_line_check;
ALTER TABLE marketing_performance_events
  ALTER COLUMN product_line TYPE VARCHAR(64);
ALTER TABLE marketing_performance_events
  ADD COLUMN IF NOT EXISTS product_lines JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE marketing_performance_events
  ADD CONSTRAINT marketing_performance_events_product_lines_array_check
  CHECK (jsonb_typeof(product_lines) = 'array');

-- Existing single-product rows become an equivalent one-item scope. Historical
-- NULL rows stay unclassified instead of receiving invented product context.
UPDATE campaign_plans
SET product_lines = jsonb_build_array(product_line)
WHERE product_line IS NOT NULL AND product_lines = '[]'::jsonb;
UPDATE campaigns
SET product_lines = jsonb_build_array(product_line)
WHERE product_line IS NOT NULL AND product_lines = '[]'::jsonb;
UPDATE campaign_asset_runs
SET product_lines = jsonb_build_array(product_line)
WHERE product_line IS NOT NULL AND product_lines = '[]'::jsonb;
UPDATE application_conversion_events
SET product_lines = jsonb_build_array(product_line)
WHERE product_line IS NOT NULL AND product_lines = '[]'::jsonb;
UPDATE marketing_performance_events
SET product_lines = jsonb_build_array(product_line)
WHERE product_line IS NOT NULL AND product_lines = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_campaign_plans_product_lines_gin
  ON campaign_plans USING GIN (product_lines);
CREATE INDEX IF NOT EXISTS idx_campaigns_product_lines_gin
  ON campaigns USING GIN (product_lines);
CREATE INDEX IF NOT EXISTS idx_campaign_asset_runs_product_lines_gin
  ON campaign_asset_runs USING GIN (product_lines);
CREATE INDEX IF NOT EXISTS idx_application_conversion_product_lines_gin
  ON application_conversion_events USING GIN (product_lines);
CREATE INDEX IF NOT EXISTS idx_marketing_performance_product_lines_gin
  ON marketing_performance_events USING GIN (product_lines);
