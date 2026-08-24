-- Forward-only long-form production plan and project cost governor.
-- The duplicated 033/034 migration names are production history and remain untouched.

ALTER TABLE video_projects
  ADD COLUMN IF NOT EXISTS production_strategy VARCHAR(20) NOT NULL DEFAULT 'smart',
  ADD COLUMN IF NOT EXISTS max_project_credits BIGINT,
  ADD COLUMN IF NOT EXISTS cost_quote JSONB,
  ADD COLUMN IF NOT EXISTS cost_quote_created_at TIMESTAMP WITH TIME ZONE;

DO $$ BEGIN
  ALTER TABLE video_projects ADD CONSTRAINT video_projects_production_strategy_check
    CHECK (production_strategy IN ('economy', 'smart', 'cinematic', 'premium'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE video_projects ADD CONSTRAINT video_projects_max_project_credits_check
    CHECK (max_project_credits IS NULL OR max_project_credits > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE video_scenes
  ADD COLUMN IF NOT EXISTS production_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS planned_operation VARCHAR(50),
  ADD COLUMN IF NOT EXISTS estimated_credits BIGINT,
  ADD COLUMN IF NOT EXISTS production_plan_locked_at TIMESTAMP WITH TIME ZONE;

DO $$ BEGIN
  ALTER TABLE video_scenes ADD CONSTRAINT video_scenes_production_mode_check
    CHECK (production_mode IS NULL OR production_mode IN ('ai_video', 'still_motion'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE video_scenes ADD CONSTRAINT video_scenes_estimated_credits_check
    CHECK (estimated_credits IS NULL OR estimated_credits >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_video_scenes_project_production_mode
  ON video_scenes(project_id, production_mode);

CREATE OR REPLACE FUNCTION invalidate_longform_project_quote()
RETURNS TRIGGER AS $$
DECLARE affected_project_id UUID;
BEGIN
  affected_project_id := COALESCE(NEW.project_id, OLD.project_id);
  UPDATE video_projects
     SET cost_quote=NULL,cost_quote_created_at=NULL,updated_at=NOW()
   WHERE id=affected_project_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS video_scenes_invalidate_project_quote ON video_scenes;
CREATE TRIGGER video_scenes_invalidate_project_quote
AFTER INSERT OR DELETE OR UPDATE OF visual_prompt,model_id,duration_seconds,source_image_url,
  source_video_url,start_frame_url,continuation_source_id,production_mode
ON video_scenes FOR EACH ROW EXECUTE FUNCTION invalidate_longform_project_quote();
