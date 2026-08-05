-- P0 runtime alignment after the Phase 5 audit.

ALTER TABLE genx_models ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE genx_models ADD COLUMN IF NOT EXISTS parameters JSONB NOT NULL DEFAULT '{}';
ALTER TABLE genx_models ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE genx_models ADD COLUMN IF NOT EXISTS deprecated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE genx_models ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) NOT NULL DEFAULT 'unverified';
ALTER TABLE genx_models ADD COLUMN IF NOT EXISTS required_parameters JSONB NOT NULL DEFAULT '[]';
ALTER TABLE genx_models ADD COLUMN IF NOT EXISTS optional_parameters JSONB NOT NULL DEFAULT '[]';

UPDATE genx_models
SET available = CASE WHEN status = 'available' THEN TRUE ELSE FALSE END
WHERE available IS DISTINCT FROM CASE WHEN status = 'available' THEN TRUE ELSE FALSE END;

UPDATE genx_models SET deprecated = TRUE WHERE status = 'deprecated';

UPDATE genx_models
SET category = CASE
    WHEN operations ?| ARRAY['text_to_image','image_to_image','image_edit'] THEN 'image'
    WHEN operations ?| ARRAY['text_to_video','image_to_video','video_to_video','video_extend'] THEN 'video'
    WHEN operations ?| ARRAY['text_to_speech','speech_to_text','voice_clone'] THEN 'voice'
    WHEN operations ?| ARRAY['audio_generation','music_generation','sound_effects'] THEN 'audio'
    ELSE COALESCE(category, 'text')
END
WHERE category IS NULL;

CREATE INDEX IF NOT EXISTS idx_genx_models_category ON genx_models(category);
CREATE INDEX IF NOT EXISTS idx_genx_models_available ON genx_models(available);
CREATE INDEX IF NOT EXISTS idx_genx_models_verification ON genx_models(verification_status);

ALTER TABLE studio_generations ADD COLUMN IF NOT EXISTS queue_job_id VARCHAR(255);
ALTER TABLE studio_generations ADD COLUMN IF NOT EXISTS worker_id VARCHAR(255);
ALTER TABLE studio_generations ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE studio_generations ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE studio_generations ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE studio_generations ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_generations_idempotency
ON studio_generations(idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_studio_generations_queue_job
ON studio_generations(queue_job_id)
WHERE queue_job_id IS NOT NULL;

ALTER TABLE studio_assets ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE studio_assets ADD COLUMN IF NOT EXISTS content_disposition VARCHAR(20) DEFAULT 'inline';
ALTER TABLE studio_assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

INSERT INTO studio_assets (
    id, organization_id, user_id, filename, original_name, mime_type,
    size_bytes, storage_path, url, metadata, created_at
)
SELECT
    id, organization_id, user_id, filename, original_name,
    COALESCE(mime_type, 'application/octet-stream'),
    COALESCE(size_bytes, 0), storage_path,
    '/api/v1/studio/assets/' || id,
    COALESCE(metadata, '{}'), created_at
FROM studio_uploads
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_video_renders_output_asset') THEN
        ALTER TABLE video_renders
        ADD CONSTRAINT fk_video_renders_output_asset
        FOREIGN KEY (output_asset_id) REFERENCES studio_assets(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_video_renders_thumbnail_asset') THEN
        ALTER TABLE video_renders
        ADD CONSTRAINT fk_video_renders_thumbnail_asset
        FOREIGN KEY (thumbnail_asset_id) REFERENCES studio_assets(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_studio_assets_active
ON studio_assets(organization_id, created_at DESC)
WHERE deleted_at IS NULL;
