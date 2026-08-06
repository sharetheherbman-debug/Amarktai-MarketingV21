ALTER TABLE billing_subscriptions
  ADD COLUMN IF NOT EXISTS checkout_session_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_item_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_stripe_event_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE billing_invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS hosted_invoice_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_stripe_event_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE billing_coupons
  ADD COLUMN IF NOT EXISTS stripe_promotion_code_id VARCHAR(255);

ALTER TABLE billing_redemptions
  ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE TABLE IF NOT EXISTS stripe_customers (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(255) NOT NULL,
  livemode BOOLEAN DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'processing',
  payload JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe_id
ON billing_subscriptions (stripe_subscription_id)
WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_subscriptions_checkout_id
ON billing_subscriptions (checkout_session_id)
WHERE checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_invoices_stripe_id
ON billing_invoices (stripe_invoice_id)
WHERE stripe_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_redemptions_unique_coupon
ON billing_redemptions (organization_id,coupon_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_payment_methods_stripe_id
ON billing_payment_methods (stripe_payment_method_id)
WHERE stripe_payment_method_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_events_status_received
ON stripe_webhook_events (status,received_at DESC);
