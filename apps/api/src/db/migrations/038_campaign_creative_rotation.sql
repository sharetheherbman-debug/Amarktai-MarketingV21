-- Durable campaign creative rotation records. Social delivery remains owned by
-- controlled-social-publishing; this table only plans variant rotation, fatigue
-- spacing and the linkage between final material, scheduled post and results.

CREATE TABLE IF NOT EXISTS campaign_creative_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_plan_id UUID NOT NULL REFERENCES campaign_plans(id) ON DELETE CASCADE,
  campaign_asset_run_id UUID NOT NULL REFERENCES campaign_asset_runs(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL REFERENCES social_connections(id) ON DELETE RESTRICT,
  platform VARCHAR(60) NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  fatigue_window_hours INTEGER NOT NULL DEFAULT 168 CHECK (fatigue_window_hours BETWEEN 24 AND 720),
  status VARCHAR(40) NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','scheduling','awaiting_control','scheduled','published','failed','retired')),
  social_post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  rationale JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (campaign_plan_id,campaign_asset_run_id,connection_id,scheduled_at)
);

CREATE INDEX IF NOT EXISTS idx_campaign_creative_rotations_campaign
  ON campaign_creative_rotations (organization_id,campaign_plan_id,status,scheduled_at);
CREATE INDEX IF NOT EXISTS idx_campaign_creative_rotations_fatigue
  ON campaign_creative_rotations (organization_id,content_id,platform,scheduled_at DESC);
