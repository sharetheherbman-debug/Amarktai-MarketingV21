-- Phase 1: Creative Studio
-- Migration: 012_creative_studio.sql

-- Studio Generations
CREATE TABLE IF NOT EXISTS studio_generations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'text_to_image', 'image_to_image', 'text_to_video', 'image_to_video', 'lip_sync', 'cinema'
    model VARCHAR(255),
    prompt TEXT,
    negative_prompt TEXT,
    options JSONB DEFAULT '{}',
    provider VARCHAR(100) DEFAULT 'genx',
    provider_job_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'
    progress INTEGER DEFAULT 0,
    output_urls JSONB DEFAULT '[]',
    error_code VARCHAR(100),
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Studio Uploads
CREATE TABLE IF NOT EXISTS studio_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    original_name VARCHAR(500),
    mime_type VARCHAR(100),
    size_bytes INTEGER,
    storage_path TEXT NOT NULL,
    url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_studio_generations_org ON studio_generations(organization_id);
CREATE INDEX IF NOT EXISTS idx_studio_generations_user ON studio_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_generations_status ON studio_generations(status);
CREATE INDEX IF NOT EXISTS idx_studio_generations_type ON studio_generations(type);
CREATE INDEX IF NOT EXISTS idx_studio_generations_created ON studio_generations(created_at);
CREATE INDEX IF NOT EXISTS idx_studio_uploads_org ON studio_uploads(organization_id);
