-- Phase 1: Relaunch Control Centre safety policy.
--
-- Safe defaults keep every workspace stopped until an owner or administrator
-- deliberately enables approval or autonomous mode. All commercial values are
-- pounds sterling represented as integer pence, and AI usage is integer
-- Generation Credits.

CREATE TABLE IF NOT EXISTS relaunch_control_policies (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  operating_mode VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (operating_mode IN ('manual', 'approval', 'autonomous')),
  emergency_stop BOOLEAN NOT NULL DEFAULT TRUE,
  daily_generation_credit_limit BIGINT NOT NULL DEFAULT 0
    CHECK (daily_generation_credit_limit >= 0),
  per_action_credit_limit BIGINT NOT NULL DEFAULT 0
    CHECK (per_action_credit_limit >= 0),
  daily_ad_budget_pence BIGINT NOT NULL DEFAULT 0
    CHECK (daily_ad_budget_pence >= 0),
  per_campaign_ad_limit_pence BIGINT NOT NULL DEFAULT 0
    CHECK (per_campaign_ad_limit_pence >= 0),
  approval_credit_threshold BIGINT NOT NULL DEFAULT 0
    CHECK (approval_credit_threshold >= 0),
  approval_ad_threshold_pence BIGINT NOT NULL DEFAULT 0
    CHECK (approval_ad_threshold_pence >= 0),
  allowed_channels JSONB NOT NULL DEFAULT '[]',
  require_approval_for_new_channel BOOLEAN NOT NULL DEFAULT TRUE,
  require_approval_for_new_audience BOOLEAN NOT NULL DEFAULT TRUE,
  require_approval_for_price_claims BOOLEAN NOT NULL DEFAULT TRUE,
  timezone VARCHAR(100) NOT NULL DEFAULT 'Europe/London',
  active_from TIMESTAMP WITH TIME ZONE,
  active_until TIMESTAMP WITH TIME ZONE,
  version BIGINT NOT NULL DEFAULT 0,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CHECK (active_until IS NULL OR active_from IS NULL OR active_until > active_from)
);

CREATE TABLE IF NOT EXISTS relaunch_action_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  channel VARCHAR(50) NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'running', 'completed', 'failed', 'cancelled', 'blocked')),
  requested_credits BIGINT NOT NULL DEFAULT 0 CHECK (requested_credits >= 0),
  requested_ad_spend_pence BIGINT NOT NULL DEFAULT 0 CHECK (requested_ad_spend_pence >= 0),
  policy_version BIGINT NOT NULL DEFAULT 0,
  requested_by VARCHAR(30) NOT NULL DEFAULT 'system'
    CHECK (requested_by IN ('system', 'user', 'application')),
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  decision_reason TEXT,
  idempotency_key VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  decided_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_relaunch_action_org_status
ON relaunch_action_decisions (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS relaunch_control_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  previous_state JSONB,
  next_state JSONB,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relaunch_control_audit_org_time
ON relaunch_control_audit (organization_id, created_at DESC);

-- Audit history is immutable. Corrections are additional audit entries.
CREATE OR REPLACE FUNCTION prevent_relaunch_control_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'relaunch_control_audit is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS relaunch_control_audit_no_mutation ON relaunch_control_audit;
CREATE TRIGGER relaunch_control_audit_no_mutation
BEFORE UPDATE OR DELETE ON relaunch_control_audit
FOR EACH ROW EXECUTE FUNCTION prevent_relaunch_control_audit_mutation();
