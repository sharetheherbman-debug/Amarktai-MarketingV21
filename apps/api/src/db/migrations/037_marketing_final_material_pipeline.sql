-- Persist the distinction between a generated ingredient and a finished,
-- tenant-branded Marketing material. Existing campaign_asset_runs remain the
-- canonical lifecycle record; no parallel campaign production store is added.

ALTER TABLE campaign_asset_runs
  ADD COLUMN IF NOT EXISTS ingredient_asset_id UUID REFERENCES studio_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_material_asset_id UUID REFERENCES studio_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_status VARCHAR(50) NOT NULL DEFAULT 'pending_ingredient'
    CHECK (material_status IN (
      'pending_ingredient','ingredient_validating','ingredient_rejected','composing',
      'final_validating','ready_for_review','approved','failed_after_bounded_retries'
    )),
  ADD COLUMN IF NOT EXISTS material_attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (material_attempt_count >= 0 AND material_attempt_count <= 2),
  ADD COLUMN IF NOT EXISTS material_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS material_qa JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_campaign_asset_runs_material_status
  ON campaign_asset_runs (organization_id,campaign_plan_id,material_status);

CREATE TABLE IF NOT EXISTS campaign_material_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_plan_id UUID NOT NULL REFERENCES campaign_plans(id) ON DELETE CASCADE,
  campaign_asset_run_id UUID NOT NULL REFERENCES campaign_asset_runs(id) ON DELETE CASCADE,
  stage VARCHAR(40) NOT NULL CHECK (stage IN ('ingredient_technical','marketing_visual','final_material')),
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('passed','failed')),
  score NUMERIC(5,2),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_material_quality_checks_run
  ON campaign_material_quality_checks (campaign_asset_run_id,created_at DESC);
