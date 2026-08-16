-- Close the autonomous first-campaign and owner-feedback loops without
-- rewriting prior migration history.

ALTER TABLE campaign_plans
  ADD COLUMN IF NOT EXISTS planning_idempotency_key VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_plans_planning_idempotency
ON campaign_plans (organization_id, planning_idempotency_key)
WHERE planning_idempotency_key IS NOT NULL;

ALTER TABLE campaign_asset_runs
  ADD COLUMN IF NOT EXISTS resolution_status VARCHAR(50) NOT NULL DEFAULT 'pending_generation'
    CHECK (resolution_status IN (
      'pending_generation','pending_review','revision_requested','rejection_received','revision_generated',
      'approved','approved_and_scheduled','retired_by_owner','replaced',
      'failed_after_bounded_retries','owner_clarification_required'
    )),
  ADD COLUMN IF NOT EXISTS resolved_content_version INTEGER,
  ADD COLUMN IF NOT EXISTS owner_feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS feedback_attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (feedback_attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS resolution_reason TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_campaign_asset_runs_resolution
ON campaign_asset_runs (organization_id,campaign_plan_id,resolution_status);

CREATE TABLE IF NOT EXISTS campaign_asset_resolution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_plan_id UUID NOT NULL REFERENCES campaign_plans(id) ON DELETE CASCADE,
  campaign_asset_run_id UUID NOT NULL REFERENCES campaign_asset_runs(id) ON DELETE CASCADE,
  content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  content_version INTEGER,
  resolution_status VARCHAR(50) NOT NULL
    CHECK (resolution_status IN (
      'approved','approved_and_scheduled','retired_by_owner','replaced',
      'failed_after_bounded_retries','owner_clarification_required'
    )),
  reason TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_asset_resolution_events_run
ON campaign_asset_resolution_events (campaign_asset_run_id,created_at DESC);
