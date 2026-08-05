-- Phase 3: Long-Form Video Projects
-- Migration: 014_longform_video_projects.sql

-- Video Projects
CREATE TABLE IF NOT EXISTS video_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(500) NOT NULL,
    description TEXT,
    target_duration_seconds INTEGER DEFAULT 60,
    aspect_ratio VARCHAR(20) DEFAULT '16:9',
    resolution VARCHAR(20) DEFAULT '1920x1080',
    frame_rate INTEGER DEFAULT 24,
    brand_config JSONB DEFAULT '{}',
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    script TEXT,
    storyboard JSONB DEFAULT '[]',
    voice_settings JSONB DEFAULT '{}',
    music_settings JSONB DEFAULT '{}',
    caption_settings JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'scripting', 'generating', 'rendering', 'completed', 'failed'
    final_output_url TEXT,
    thumbnail_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video Scenes
CREATE TABLE IF NOT EXISTS video_scenes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    title VARCHAR(500),
    narration TEXT,
    dialogue TEXT,
    visual_prompt TEXT,
    negative_prompt TEXT,
    model_id VARCHAR(255),
    duration_seconds INTEGER DEFAULT 5,
    camera_instructions TEXT,
    source_image_url TEXT,
    source_video_url TEXT,
    start_frame_url TEXT,
    end_frame_url TEXT,
    continuation_source_id UUID REFERENCES video_scenes(id),
    generated_clip_url TEXT,
    audio_clip_url TEXT,
    caption_text TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'generating', 'completed', 'failed', 'approved', 'locked'
    provider_job_id VARCHAR(255),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video Scene Assets
CREATE TABLE IF NOT EXISTS video_scene_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scene_id UUID NOT NULL REFERENCES video_scenes(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    asset_type VARCHAR(50) NOT NULL, -- 'image', 'video', 'audio', 'caption'
    asset_url TEXT NOT NULL,
    genx_file_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video Renders
CREATE TABLE IF NOT EXISTS video_renders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    progress INTEGER DEFAULT 0,
    output_url TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    file_size_bytes BIGINT,
    render_config JSONB DEFAULT '{}',
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video Render Events
CREATE TABLE IF NOT EXISTS video_render_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    render_id UUID NOT NULL REFERENCES video_renders(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_video_projects_org ON video_projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_video_projects_owner ON video_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_video_projects_status ON video_projects(status);
CREATE INDEX IF NOT EXISTS idx_video_scenes_project ON video_scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_video_scenes_org ON video_scenes(organization_id);
CREATE INDEX IF NOT EXISTS idx_video_scenes_number ON video_scenes(project_id, scene_number);
CREATE INDEX IF NOT EXISTS idx_video_scenes_status ON video_scenes(status);
CREATE INDEX IF NOT EXISTS idx_video_scene_assets_scene ON video_scene_assets(scene_id);
CREATE INDEX IF NOT EXISTS idx_video_renders_project ON video_renders(project_id);
CREATE INDEX IF NOT EXISTS idx_video_renders_status ON video_renders(status);
CREATE INDEX IF NOT EXISTS idx_video_render_events_render ON video_render_events(render_id);
