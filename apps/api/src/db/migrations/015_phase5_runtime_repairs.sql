-- Phase 5 Runtime Repairs
-- Migration: 015_phase5_runtime_repairs.sql

-- Ensure pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Fix video_renders table - add missing columns
ALTER TABLE video_renders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE video_renders ADD COLUMN IF NOT EXISTS queue_job_id VARCHAR(255);
ALTER TABLE video_renders ADD COLUMN IF NOT EXISTS worker_id VARCHAR(255);
ALTER TABLE video_renders ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE video_renders ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;
ALTER TABLE video_renders ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE video_renders ADD COLUMN IF NOT EXISTS output_asset_id UUID;
ALTER TABLE video_renders ADD COLUMN IF NOT EXISTS thumbnail_asset_id UUID;

-- Fix video_scenes table - add missing columns for durable generation
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS queue_job_id VARCHAR(255);
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS worker_id VARCHAR(255);
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS provider_continuation_token VARCHAR(255);
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS provider_result_url TEXT;
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS final_frame_asset_id UUID;
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS genx_file_id VARCHAR(255);
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS generation_id UUID;
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE video_scenes ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMP WITH TIME ZONE;

-- Add index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_scenes_idempotency ON video_scenes(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Add index for queue lookups
CREATE INDEX IF NOT EXISTS idx_video_scenes_queue_job ON video_scenes(queue_job_id) WHERE queue_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_video_renders_queue_job ON video_renders(queue_job_id) WHERE queue_job_id IS NOT NULL;

-- Studio assets table for secure asset delivery
CREATE TABLE IF NOT EXISTS studio_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    filename VARCHAR(500) NOT NULL,
    original_name VARCHAR(500),
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    genx_file_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_studio_assets_org ON studio_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_studio_assets_user ON studio_assets(user_id);

-- Webhook events table for idempotent processing
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id VARCHAR(255) UNIQUE NOT NULL,
    source VARCHAR(100) NOT NULL,
    event_type VARCHAR(200) NOT NULL,
    payload JSONB DEFAULT '{}',
    processed BOOLEAN DEFAULT FALSE,
    processing_result JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(source);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
