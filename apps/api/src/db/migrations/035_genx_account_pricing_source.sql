-- Forward-only schema alignment for authenticated GenX account-tier pricing.
--
-- Migration 023 introduced genx_price_snapshots with pricing_source restricted
-- to ('genx_api', 'admin_override'). The current pricing service intentionally
-- persists authenticated /account/pricing snapshots as 'genx_account_pricing'
-- so account-tier pricing remains distinguishable from generic catalogue data.

ALTER TABLE genx_price_snapshots
  DROP CONSTRAINT IF EXISTS genx_price_snapshots_pricing_source_check;

ALTER TABLE genx_price_snapshots
  ADD CONSTRAINT genx_price_snapshots_pricing_source_check
  CHECK (pricing_source IN ('genx_api', 'genx_account_pricing', 'admin_override'));
