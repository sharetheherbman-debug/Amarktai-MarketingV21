-- Phase 1: GenX-only prepaid Generation Credits priced and settled in GBP.
--
-- Customer-facing convention:
--   100 credits = GBP 1.00 of retail generation value.
--
-- Balances are integer credits. Monetary audit fields are stored in pence and
-- high-precision GBP values so provider pricing, agent-tier discounts, Stripe
-- reconciliation and gross margin can be audited without floating-point loss.

CREATE TABLE IF NOT EXISTS generation_credit_wallets (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  wallet_type VARCHAR(20) NOT NULL DEFAULT 'customer'
    CHECK (wallet_type IN ('customer', 'internal')),
  currency CHAR(3) NOT NULL DEFAULT 'GBP'
    CHECK (currency = 'GBP'),
  available_credits BIGINT NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
  reserved_credits BIGINT NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  lifetime_purchased_credits BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_purchased_credits >= 0),
  lifetime_granted_credits BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_granted_credits >= 0),
  lifetime_spent_credits BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent_credits >= 0),
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS genx_price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  operation VARCHAR(100) NOT NULL,
  billable_unit VARCHAR(50) NOT NULL,
  source_currency CHAR(3) NOT NULL,
  source_unit_cost NUMERIC(24, 10) NOT NULL CHECK (source_unit_cost >= 0),
  fx_rate_to_gbp NUMERIC(24, 10) NOT NULL CHECK (fx_rate_to_gbp > 0),
  wholesale_unit_cost_gbp NUMERIC(24, 10) NOT NULL CHECK (wholesale_unit_cost_gbp >= 0),
  target_margin_bps INTEGER NOT NULL DEFAULT 4000
    CHECK (target_margin_bps >= 0 AND target_margin_bps < 10000),
  retail_unit_cost_gbp NUMERIC(24, 10) NOT NULL CHECK (retail_unit_cost_gbp >= 0),
  credits_per_unit BIGINT NOT NULL CHECK (credits_per_unit >= 0),
  pricing_source VARCHAR(40) NOT NULL DEFAULT 'genx_api'
    CHECK (pricing_source IN ('genx_api', 'admin_override')),
  agent_tier_applied BOOLEAN NOT NULL DEFAULT FALSE,
  raw_metadata JSONB NOT NULL DEFAULT '{}',
  effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_genx_price_active_model_operation
ON genx_price_snapshots (model_id, operation)
WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_genx_price_model_history
ON genx_price_snapshots (model_id, operation, effective_from DESC);

CREATE TABLE IF NOT EXISTS generation_credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  campaign_id UUID,
  generation_job_id UUID,
  provider_job_id VARCHAR(255),
  model_id TEXT NOT NULL,
  operation VARCHAR(100) NOT NULL,
  price_snapshot_id UUID REFERENCES genx_price_snapshots(id) ON DELETE RESTRICT,
  estimated_wholesale_cost_gbp NUMERIC(24, 10) NOT NULL DEFAULT 0,
  estimated_retail_charge_gbp NUMERIC(24, 10) NOT NULL DEFAULT 0,
  reserved_credits BIGINT NOT NULL CHECK (reserved_credits > 0),
  settled_credits BIGINT NOT NULL DEFAULT 0 CHECK (settled_credits >= 0),
  released_credits BIGINT NOT NULL DEFAULT 0 CHECK (released_credits >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'submitted', 'settled', 'released', 'partially_settled', 'expired')),
  idempotency_key VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE,
  settled_at TIMESTAMP WITH TIME ZONE,
  released_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key),
  CHECK (settled_credits + released_credits <= reserved_credits)
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_org_status
ON generation_credit_reservations (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_expiry
ON generation_credit_reservations (status, expires_at)
WHERE status IN ('reserved', 'submitted');

CREATE TABLE IF NOT EXISTS generation_credit_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  purchased_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_checkout_session_id VARCHAR(255) UNIQUE,
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  pack_code VARCHAR(100),
  amount_pence BIGINT NOT NULL CHECK (amount_pence >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'GBP' CHECK (currency = 'GBP'),
  credits BIGINT NOT NULL CHECK (credits > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled')),
  purchase_kind VARCHAR(30) NOT NULL DEFAULT 'stripe'
    CHECK (purchase_kind IN ('stripe', 'admin_free', 'admin_at_cost', 'internal_funding', 'promotion')),
  wholesale_cost_basis_pence BIGINT CHECK (wholesale_cost_basis_pence IS NULL OR wholesale_cost_basis_pence >= 0),
  metadata JSONB NOT NULL DEFAULT '{}',
  paid_at TIMESTAMP WITH TIME ZONE,
  refunded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_purchases_org_created
ON generation_credit_purchases (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generation_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reservation_id UUID REFERENCES generation_credit_reservations(id) ON DELETE RESTRICT,
  purchase_id UUID REFERENCES generation_credit_purchases(id) ON DELETE RESTRICT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entry_type VARCHAR(40) NOT NULL
    CHECK (entry_type IN (
      'purchase', 'admin_free_grant', 'admin_at_cost_grant', 'internal_funding',
      'promotion', 'reservation', 'settlement', 'release', 'refund',
      'chargeback', 'manual_adjustment', 'expiry_correction'
    )),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit')),
  credits BIGINT NOT NULL CHECK (credits > 0),
  available_balance_after BIGINT NOT NULL CHECK (available_balance_after >= 0),
  reserved_balance_after BIGINT NOT NULL CHECK (reserved_balance_after >= 0),
  monetary_value_pence BIGINT CHECK (monetary_value_pence IS NULL OR monetary_value_pence >= 0),
  wholesale_cost_gbp NUMERIC(24, 10) CHECK (wholesale_cost_gbp IS NULL OR wholesale_cost_gbp >= 0),
  retail_charge_gbp NUMERIC(24, 10) CHECK (retail_charge_gbp IS NULL OR retail_charge_gbp >= 0),
  gross_profit_gbp NUMERIC(24, 10),
  model_id TEXT,
  operation VARCHAR(100),
  provider_job_id VARCHAR(255),
  idempotency_key VARCHAR(255) NOT NULL,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_org_created
ON generation_credit_ledger (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_provider_job
ON generation_credit_ledger (provider_job_id)
WHERE provider_job_id IS NOT NULL;

-- Ledger entries are immutable. Corrections are represented by compensating
-- entries so the complete customer and platform audit trail remains intact.
CREATE OR REPLACE FUNCTION prevent_generation_credit_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'generation_credit_ledger is immutable; create a compensating entry';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS generation_credit_ledger_no_update ON generation_credit_ledger;
CREATE TRIGGER generation_credit_ledger_no_update
BEFORE UPDATE OR DELETE ON generation_credit_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_generation_credit_ledger_mutation();

-- Seed the four launch packs in GBP. Stripe Price IDs are configured through
-- environment-backed platform administration and are intentionally not stored
-- in frontend settings.
CREATE TABLE IF NOT EXISTS generation_credit_packs (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  credits BIGINT NOT NULL CHECK (credits > 0),
  price_pence BIGINT NOT NULL CHECK (price_pence > 0),
  currency CHAR(3) NOT NULL DEFAULT 'GBP' CHECK (currency = 'GBP'),
  stripe_price_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO generation_credit_packs
  (code, name, description, credits, price_pence, currency, sort_order)
VALUES
  ('starter-1000', 'Starter', '1,000 Generation Credits', 1000, 1000, 'GBP', 10),
  ('growth-2500', 'Growth', '2,500 Generation Credits', 2500, 2500, 'GBP', 20),
  ('campaign-5000', 'Campaign', '5,000 Generation Credits', 5000, 5000, 'GBP', 30),
  ('scale-10000', 'Scale', '10,000 Generation Credits', 10000, 10000, 'GBP', 40)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  credits=EXCLUDED.credits,
  price_pence=EXCLUDED.price_pence,
  currency='GBP',
  sort_order=EXCLUDED.sort_order,
  updated_at=NOW();
