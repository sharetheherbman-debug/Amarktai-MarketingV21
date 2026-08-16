-- Autonomous organic-growth engine, immutable outbound approval binding, living
-- business knowledge, content lineage, experimentation and sales attribution.
-- This migration is additive and preserves all historical rows.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS system_role_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_system_role
ON agents (organization_id, system_role_key)
WHERE system_role_key IS NOT NULL AND deleted_at IS NULL;

-- The launch-visible agent runtime uses the authoritative agents table. The
-- recovered conversation schema still pointed at the superseded
-- agent_definitions table, which made every real agent conversation fail.
ALTER TABLE agent_conversations DROP CONSTRAINT IF EXISTS agent_conversations_agent_id_fkey;
ALTER TABLE agent_conversations
  ADD CONSTRAINT agent_conversations_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;

ALTER TABLE campaign_plans
  ADD COLUMN IF NOT EXISTS strategy_validation_status VARCHAR(40) NOT NULL DEFAULT 'pending'
    CHECK (strategy_validation_status IN ('pending','valid','needs_revision','owner_clarification')),
  ADD COLUMN IF NOT EXISTS owner_clarification JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE content_items
  ADD COLUMN IF NOT EXISTS root_content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transformation_type VARCHAR(80),
  ADD COLUMN IF NOT EXISTS reuse_score NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS performance_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_content_lineage_source
ON content_items (organization_id, source_content_id)
WHERE source_content_id IS NOT NULL;

ALTER TABLE content_approvals
  ADD COLUMN IF NOT EXISTS approved_content_hash CHAR(64);

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS approved_content_version INTEGER,
  ADD COLUMN IF NOT EXISTS approved_content_hash CHAR(64);

CREATE TABLE IF NOT EXISTS email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email_hash CHAR(64) NOT NULL,
  reason VARCHAR(80) NOT NULL DEFAULT 'unsubscribe',
  source VARCHAR(120),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id,email_hash)
);

CREATE TABLE IF NOT EXISTS email_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE RESTRICT,
  content_version INTEGER NOT NULL,
  approved_content_hash CHAR(64) NOT NULL,
  recipient_hash CHAR(64) NOT NULL,
  idempotency_key CHAR(64) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_message_id VARCHAR(255),
  status VARCHAR(30) NOT NULL,
  status_code INTEGER NOT NULL,
  consent_basis VARCHAR(40) NOT NULL DEFAULT 'consent'
    CHECK (consent_basis IN ('consent','contract','legitimate_interest')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  error_message TEXT,
  last_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id,idempotency_key)
);

ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS marketing_consent_status VARCHAR(30) NOT NULL DEFAULT 'unknown'
    CHECK (marketing_consent_status IN ('unknown','granted','withdrawn')),
  ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS marketing_consent_source VARCHAR(120);

ALTER TABLE knowledge_sources
  ADD COLUMN IF NOT EXISTS refresh_interval_minutes INTEGER NOT NULL DEFAULT 1440
    CHECK (refresh_interval_minutes BETWEEN 15 AND 43200),
  ADD COLUMN IF NOT EXISTS next_refresh_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS content_fingerprint CHAR(64),
  ADD COLUMN IF NOT EXISTS knowledge_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stale_after TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_knowledge_sources_refresh_due
ON knowledge_sources (next_refresh_at)
WHERE type IN ('website','api','rss') AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS knowledge_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','completed','failed','unchanged')),
  trigger_type VARCHAR(30) NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual','scheduled','connector','director')),
  previous_version INTEGER NOT NULL DEFAULT 0,
  resulting_version INTEGER NOT NULL DEFAULT 0,
  pages_seen INTEGER NOT NULL DEFAULT 0,
  pages_added INTEGER NOT NULL DEFAULT 0,
  pages_changed INTEGER NOT NULL DEFAULT 0,
  pages_deleted INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_sync_runs_source
ON knowledge_sync_runs (source_id, started_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_page_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_version INTEGER NOT NULL,
  source_version INTEGER NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  title TEXT,
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_type VARCHAR(20) NOT NULL
    CHECK (change_type IN ('added','changed','unchanged','deleted')),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, url, page_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_page_current
ON knowledge_page_versions (source_id, url)
WHERE is_current=TRUE;

CREATE TABLE IF NOT EXISTS business_knowledge_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id VARCHAR(255) NOT NULL,
  source_type VARCHAR(30) NOT NULL CHECK (source_type IN ('connector','website','owner')),
  version INTEGER NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  authoritative_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, application_id, source_type, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_knowledge_current
ON business_knowledge_snapshots (organization_id, application_id, source_type)
WHERE is_current=TRUE;

CREATE TABLE IF NOT EXISTS marketing_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_type VARCHAR(30) NOT NULL,
  source_id UUID,
  event_type VARCHAR(80) NOT NULL,
  materiality VARCHAR(20) NOT NULL DEFAULT 'material'
    CHECK (materiality IN ('minor','material','critical')),
  summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','consumed','dismissed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_marketing_change_events_pending
ON marketing_change_events (organization_id, created_at)
WHERE status='pending';

CREATE TABLE IF NOT EXISTS autonomous_growth_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'observing'
    CHECK (status IN ('observing','planning','producing','quality_review','awaiting_owner_approval','distributing','measuring','optimizing','completed','failed','paused')),
  trigger_type VARCHAR(30) NOT NULL DEFAULT 'scheduled'
    CHECK (trigger_type IN ('scheduled','manual','knowledge_change','conversion','performance')),
  trigger_ref UUID,
  objective TEXT,
  opportunity JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  campaign_plan_id UUID REFERENCES campaign_plans(id) ON DELETE SET NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  iteration INTEGER NOT NULL DEFAULT 1 CHECK (iteration > 0),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_run_at TIMESTAMP WITH TIME ZONE,
  claimed_at TIMESTAMP WITH TIME ZONE,
  claim_token UUID,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_autonomous_growth_cycles_due
ON autonomous_growth_cycles (status, next_run_at)
WHERE status NOT IN ('completed','failed','paused');

CREATE TABLE IF NOT EXISTS autonomous_growth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES autonomous_growth_cycles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phase VARCHAR(40) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_autonomous_growth_events_cycle
ON autonomous_growth_events (cycle_id, created_at);

CREATE TABLE IF NOT EXISTS marketing_performance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_plan_id UUID REFERENCES campaign_plans(id) ON DELETE SET NULL,
  content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES studio_assets(id) ON DELETE SET NULL,
  platform VARCHAR(50),
  source VARCHAR(120),
  medium VARCHAR(120),
  variation_id VARCHAR(255),
  pseudonymous_subject VARCHAR(255),
  value_pence BIGINT NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_marketing_performance_attribution
ON marketing_performance_events (organization_id, campaign_id, content_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS marketing_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  variable_type VARCHAR(50) NOT NULL,
  hypothesis TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  success_metric VARCHAR(100) NOT NULL,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  stop_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  minimum_sample_size INTEGER NOT NULL DEFAULT 50 CHECK (minimum_sample_size > 0),
  max_duration_days INTEGER NOT NULL DEFAULT 30 CHECK (max_duration_days BETWEEN 1 AND 365),
  winner_variant VARCHAR(255),
  conclusion JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS owner_marketing_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  preference_type VARCHAR(80) NOT NULL,
  preference_key VARCHAR(255) NOT NULL,
  weight NUMERIC(8,4) NOT NULL DEFAULT 1,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, preference_type, preference_key)
);

CREATE TABLE IF NOT EXISTS approved_social_proof (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proof_type VARCHAR(40) NOT NULL,
  quote TEXT NOT NULL,
  source_label TEXT,
  consent_status VARCHAR(30) NOT NULL DEFAULT 'unverified'
    CHECK (consent_status IN ('unverified','approved','revoked')),
  allowed_use JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION prevent_autonomous_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'autonomous growth history is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS autonomous_growth_events_no_mutation ON autonomous_growth_events;
CREATE TRIGGER autonomous_growth_events_no_mutation
BEFORE UPDATE OR DELETE ON autonomous_growth_events
FOR EACH ROW EXECUTE FUNCTION prevent_autonomous_history_mutation();

DROP TRIGGER IF EXISTS marketing_performance_events_no_mutation ON marketing_performance_events;
CREATE TRIGGER marketing_performance_events_no_mutation
BEFORE UPDATE OR DELETE ON marketing_performance_events
FOR EACH ROW EXECUTE FUNCTION prevent_autonomous_history_mutation();
