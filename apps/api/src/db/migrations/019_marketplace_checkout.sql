ALTER TABLE marketplace_items
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checkout_session_id VARCHAR(255) UNIQUE,
  payment_intent_id VARCHAR(255),
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_purchase_status_check
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_org_item
  ON marketplace_purchases(organization_id, item_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_purchases_user
  ON marketplace_purchases(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_paid_purchase_once
  ON marketplace_purchases(organization_id, item_id)
  WHERE status = 'paid';
