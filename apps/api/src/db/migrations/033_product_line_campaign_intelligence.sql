-- Persist product-line context as an optional, generic campaign dimension.
-- Existing records remain unclassified rather than being incorrectly assigned to
-- a specific product line. New values are limited to the connected host's
-- canonical Management, Academy and Shop product lines.

ALTER TABLE campaign_plans
  ADD COLUMN IF NOT EXISTS product_line VARCHAR(32)
    CHECK (product_line IN ('management','academy','shop'));

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS product_line VARCHAR(32)
    CHECK (product_line IN ('management','academy','shop'));

ALTER TABLE campaign_asset_runs
  ADD COLUMN IF NOT EXISTS product_line VARCHAR(32)
    CHECK (product_line IN ('management','academy','shop'));

ALTER TABLE application_conversion_events
  ADD COLUMN IF NOT EXISTS product_line VARCHAR(32)
    CHECK (product_line IN ('management','academy','shop'));

ALTER TABLE marketing_performance_events
  ADD COLUMN IF NOT EXISTS product_line VARCHAR(32)
    CHECK (product_line IN ('management','academy','shop'));

CREATE INDEX IF NOT EXISTS idx_campaign_plans_product_line
  ON campaign_plans (organization_id,product_line,updated_at DESC)
  WHERE product_line IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_product_line
  ON campaigns (organization_id,product_line,updated_at DESC)
  WHERE product_line IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_asset_runs_product_line
  ON campaign_asset_runs (organization_id,product_line,campaign_plan_id)
  WHERE product_line IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_application_conversion_events_product_line
  ON application_conversion_events (application_id,product_line,occurred_at DESC)
  WHERE product_line IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_performance_product_line
  ON marketing_performance_events (organization_id,product_line,occurred_at DESC)
  WHERE product_line IS NOT NULL;
