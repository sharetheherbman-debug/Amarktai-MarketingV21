-- Phase 1 finalisation: campaign intelligence and execution integrity.

ALTER TABLE relaunch_action_decisions
  ADD COLUMN IF NOT EXISTS payload_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS approval_expires_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_relaunch_action_expires
ON relaunch_action_decisions (organization_id, approval_expires_at)
WHERE status = 'approved';

ALTER TABLE campaign_plans
  ADD COLUMN IF NOT EXISTS brief JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS creative_concept JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS messaging_plan JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS asset_requirements JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS optimization_plan JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS constraints JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS generation_credit_limit BIGINT NOT NULL DEFAULT 0
    CHECK (generation_credit_limit >= 0),
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS campaign_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_plan_id UUID NOT NULL REFERENCES campaign_plans(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_plan_id, version)
);

CREATE INDEX IF NOT EXISTS idx_campaign_plan_versions_plan
ON campaign_plan_versions (campaign_plan_id, version DESC);

CREATE OR REPLACE FUNCTION prevent_campaign_plan_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'campaign plan history is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS campaign_plan_versions_no_mutation ON campaign_plan_versions;
CREATE TRIGGER campaign_plan_versions_no_mutation
BEFORE UPDATE OR DELETE ON campaign_plan_versions
FOR EACH ROW EXECUTE FUNCTION prevent_campaign_plan_version_mutation();

CREATE TABLE IF NOT EXISTS campaign_asset_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_plan_id UUID NOT NULL REFERENCES campaign_plans(id) ON DELETE CASCADE,
  brief_id VARCHAR(255) NOT NULL,
  variant_number INTEGER NOT NULL DEFAULT 1 CHECK (variant_number > 0),
  generation_kind VARCHAR(30) NOT NULL CHECK (generation_kind IN ('text','media')),
  content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  studio_generation_id UUID REFERENCES studio_generations(id) ON DELETE SET NULL,
  queue_job_id VARCHAR(255),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'planned',
  error_message TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (campaign_plan_id, brief_id, variant_number)
);

CREATE INDEX IF NOT EXISTS idx_campaign_asset_runs_plan
ON campaign_asset_runs (organization_id,campaign_plan_id,status);

ALTER TABLE content_versions
  ADD COLUMN IF NOT EXISTS restored_from_version INTEGER;

ALTER TABLE content_approvals
  ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE content_generation_jobs
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

-- Upgrade-safe cleanup: older builds allowed more than one pending review for
-- the same content item. Keep the newest request active and preserve the older
-- rows as review history before enforcing the invariant.
WITH ranked_pending_approvals AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY content_id
           ORDER BY created_at DESC, id DESC
         ) AS pending_rank
  FROM content_approvals
  WHERE status = 'pending'
)
UPDATE content_approvals approval
SET status = 'changes_requested',
    comments = CONCAT_WS(
      E'\n',
      NULLIF(approval.comments, ''),
      'Superseded automatically by a newer pending approval during the Phase 1 upgrade.'
    )
FROM ranked_pending_approvals ranked
WHERE approval.id = ranked.id
  AND ranked.pending_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_generation_jobs_idempotency
ON content_generation_jobs (organization_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_approval_one_pending
ON content_approvals (content_id)
WHERE status = 'pending';

ALTER TABLE relaunch_control_audit
  ADD COLUMN IF NOT EXISTS decision_id UUID
    REFERENCES relaunch_action_decisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_relaunch_control_audit_decision
ON relaunch_control_audit (decision_id, created_at DESC)
WHERE decision_id IS NOT NULL;

CREATE OR REPLACE FUNCTION audit_relaunch_action_decision()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO relaunch_control_audit
    (organization_id,actor_user_id,event_type,decision_id,previous_state,next_state,reason)
  VALUES (
    NEW.organization_id,
    NEW.requested_by_user_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'action_decision_created' ELSE 'action_decision_transition' END,
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    NEW.decision_reason
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS relaunch_action_decision_audit ON relaunch_action_decisions;
CREATE TRIGGER relaunch_action_decision_audit
AFTER INSERT OR UPDATE ON relaunch_action_decisions
FOR EACH ROW EXECUTE FUNCTION audit_relaunch_action_decision();
