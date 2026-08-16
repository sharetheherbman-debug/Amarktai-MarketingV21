-- Phase 1: customer-visible GenX models require verified retail pricing.

ALTER TABLE genx_models
  ADD COLUMN IF NOT EXISTS retail_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE genx_models
  ADD COLUMN IF NOT EXISTS pricing_status VARCHAR(30) NOT NULL DEFAULT 'unpriced';

ALTER TABLE genx_models
  ADD COLUMN IF NOT EXISTS pricing_last_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE genx_models
  ADD COLUMN IF NOT EXISTS pricing_error TEXT;

CREATE INDEX IF NOT EXISTS idx_genx_models_retail_enabled
ON genx_models (retail_enabled, available, deprecated);

CREATE INDEX IF NOT EXISTS idx_genx_models_pricing_status
ON genx_models (pricing_status, pricing_last_synced_at);

-- Existing models remain disabled for customer generation until the authenticated
-- GenX catalogue has supplied a parseable price and the platform has calculated
-- a GBP retail snapshot. Runtime verification alone is not a pricing approval.
UPDATE genx_models
SET retail_enabled = FALSE,
    pricing_status = 'unpriced',
    pricing_error = NULL
WHERE pricing_last_synced_at IS NULL;
