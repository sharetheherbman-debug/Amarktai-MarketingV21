-- Milestone 7: SaaS & Billing
-- Migration: 008_saas_billing.sql

-- Subscription Plans
CREATE TABLE IF NOT EXISTS billing_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    tier VARCHAR(50) NOT NULL, -- 'free', 'starter', 'professional', 'enterprise'
    price_monthly_cents INTEGER NOT NULL DEFAULT 0,
    price_yearly_cents INTEGER NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    features JSONB DEFAULT '[]',
    limits JSONB DEFAULT '{}', -- {contacts:1000, emails:5000, storage_gb:10, agents:3, api_calls:10000}
    stripe_price_monthly_id VARCHAR(255),
    stripe_price_yearly_id VARCHAR(255),
    stripe_product_id VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_public BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    trial_days INTEGER DEFAULT 14,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization Subscriptions
CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES billing_plans(id),
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'trialing', -- 'trialing', 'active', 'past_due', 'canceled', 'paused', 'incomplete'
    billing_cycle VARCHAR(20) DEFAULT 'monthly', -- 'monthly', 'yearly'
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    trial_start TIMESTAMP WITH TIME ZONE,
    trial_end TIMESTAMP WITH TIME ZONE,
    canceled_at TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    default_payment_method JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage Metering
CREATE TABLE IF NOT EXISTS billing_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
    metric VARCHAR(100) NOT NULL, -- 'contacts', 'emails_sent', 'api_calls', 'storage_bytes', 'agents', 'content_generated'
    quantity BIGINT NOT NULL DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    stripe_usage_record_id VARCHAR(255),
    reported_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invoices
CREATE TABLE IF NOT EXISTS billing_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
    stripe_invoice_id VARCHAR(255),
    invoice_number VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'open', 'paid', 'void', 'uncollectible'
    amount_cents BIGINT NOT NULL DEFAULT 0,
    tax_cents BIGINT DEFAULT 0,
    total_cents BIGINT NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    description TEXT,
    line_items JSONB DEFAULT '[]',
    due_date DATE,
    paid_at TIMESTAMP WITH TIME ZONE,
    pdf_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment Methods
CREATE TABLE IF NOT EXISTS billing_payment_methods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_payment_method_id VARCHAR(255),
    type VARCHAR(50) NOT NULL, -- 'card', 'bank_account'
    card_brand VARCHAR(50),
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    is_default BOOLEAN DEFAULT FALSE,
    billing_details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing Events (audit trail)
CREATE TABLE IF NOT EXISTS billing_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL, -- 'subscription.created', 'invoice.paid', 'usage.reported', etc.
    data JSONB DEFAULT '{}',
    stripe_event_id VARCHAR(255),
    processed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Coupons / Discounts
CREATE TABLE IF NOT EXISTS billing_coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255),
    discount_type VARCHAR(20) NOT NULL, -- 'percentage', 'fixed'
    discount_value INTEGER NOT NULL, -- percentage (0-100) or cents
    currency VARCHAR(3) DEFAULT 'USD',
    max_redemptions INTEGER,
    redemption_count INTEGER DEFAULT 0,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    valid_until TIMESTAMP WITH TIME ZONE,
    applies_to_plans JSONB DEFAULT '[]', -- plan IDs, empty = all
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Coupon Redemptions
CREATE TABLE IF NOT EXISTS billing_redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES billing_coupons(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
    redeemed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, coupon_id)
);

-- Tenant Settings
CREATE TABLE IF NOT EXISTS tenant_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    custom_domain VARCHAR(255),
    ssl_enabled BOOLEAN DEFAULT FALSE,
    branding JSONB DEFAULT '{}', -- {logo, colors, favicon}
    sso_enabled BOOLEAN DEFAULT FALSE,
    sso_config JSONB DEFAULT '{}',
    api_rate_limit INTEGER DEFAULT 100,
    api_quota_monthly INTEGER DEFAULT 10000,
    storage_quota_bytes BIGINT DEFAULT 10737418240, -- 10GB
    features JSONB DEFAULT '{}', -- feature flags
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_billing_plans_slug ON billing_plans(slug);
CREATE INDEX IF NOT EXISTS idx_billing_plans_tier ON billing_plans(tier);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_org ON billing_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_status ON billing_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe ON billing_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_billing_usage_org ON billing_usage(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_usage_metric ON billing_usage(metric);
CREATE INDEX IF NOT EXISTS idx_billing_usage_period ON billing_usage(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_org ON billing_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_billing_payment_methods_org ON billing_payment_methods(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_org ON billing_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_coupons_code ON billing_coupons(code);
CREATE INDEX IF NOT EXISTS idx_billing_redemptions_org ON billing_redemptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_org ON tenant_settings(organization_id);

-- Seed default plans
INSERT INTO billing_plans (slug, name, description, tier, price_monthly_cents, price_yearly_cents, features, limits, trial_days, sort_order) VALUES
('free', 'Free', 'Get started with basic marketing tools', 'free', 0, 0,
 '["5 AI generations/month", "100 contacts", "Basic analytics", "1 agent", "Community support"]',
 '{"contacts":100,"emails":500,"storage_gb":1,"agents":1,"api_calls":1000,"content_generated":5}',
 0, 1),
('starter', 'Starter', 'For growing businesses', 'starter', 4900, 47000,
 '["100 AI generations/month", "1,000 contacts", "Email campaigns", "3 agents", "Knowledge base", "Priority support"]',
 '{"contacts":1000,"emails":5000,"storage_gb":10,"agents":3,"api_calls":10000,"content_generated":100}',
 14, 2),
('professional', 'Professional', 'For scaling teams', 'professional', 14900, 143000,
 '["Unlimited AI generations", "10,000 contacts", "Full CRM", "10 agents", "SEO tools", "Social publishing", "Workflows", "API access"]',
 '{"contacts":10000,"emails":50000,"storage_gb":100,"agents":10,"api_calls":100000,"content_generated":-1}',
 14, 3),
('enterprise', 'Enterprise', 'Custom solutions for large organizations', 'enterprise', 49900, 479000,
 '["Everything in Professional", "Unlimited contacts", "Unlimited agents", "Custom integrations", "Dedicated support", "SLA", "SSO", "White label"]',
 '{"contacts":-1,"emails":-1,"storage_gb":1000,"agents":-1,"api_calls":-1,"content_generated":-1}',
 30, 4)
ON CONFLICT (slug) DO NOTHING;
