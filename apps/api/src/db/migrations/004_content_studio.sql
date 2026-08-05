-- Milestone 3: Content Studio
-- Migration: 004_content_studio.sql

-- Content items (main content table extending existing content)
CREATE TABLE IF NOT EXISTS content_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    excerpt TEXT,
    type VARCHAR(50) NOT NULL, -- 'blog', 'article', 'landing_page', 'sales_page', 'product_desc', 'service_page', 'case_study', 'faq', 'newsletter', 'email', 'press_release', 'social', 'asset'
    format VARCHAR(50) DEFAULT 'markdown', -- 'markdown', 'html', 'plain', 'rich_text'
    platform VARCHAR(50), -- 'facebook', 'instagram', 'linkedin', 'x', 'threads', 'pinterest', 'reddit', 'youtube', 'tiktok', 'email', 'web'
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'review', 'approved', 'rejected', 'published', 'archived', 'scheduled'
    workflow_state VARCHAR(50) DEFAULT 'draft',
    language VARCHAR(10) DEFAULT 'en',
    word_count INTEGER DEFAULT 0,
    reading_time_seconds INTEGER DEFAULT 0,
    seo_score FLOAT DEFAULT 0,
    readability_score FLOAT DEFAULT 0,
    brand_voice_score FLOAT DEFAULT 0,
    quality_score FLOAT DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_model VARCHAR(100),
    ai_prompt TEXT,
    ai_context JSONB DEFAULT '{}', -- brand_dna, knowledge, memory used
    template_id UUID,
    parent_id UUID REFERENCES content_items(id) ON DELETE SET NULL, -- for versioning
    version INTEGER DEFAULT 1,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Content versions (version history)
CREATE TABLE IF NOT EXISTS content_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    metadata JSONB DEFAULT '{}',
    change_summary TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content templates
CREATE TABLE IF NOT EXISTS content_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL, -- 'blog', 'social', 'email', 'landing_page', 'asset'
    type VARCHAR(50) NOT NULL, -- matches content types
    platform VARCHAR(50),
    template_body TEXT NOT NULL,
    variables JSONB DEFAULT '[]', -- [{name, type, description, required, default}]
    conditional_sections JSONB DEFAULT '[]',
    prompt_template TEXT, -- AI prompt template
    system_prompt TEXT,
    brand_voice_override JSONB DEFAULT '{}',
    default_metadata JSONB DEFAULT '{}',
    is_system BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Content calendar events
CREATE TABLE IF NOT EXISTS content_calendar (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    platform VARCHAR(50),
    content_type VARCHAR(50),
    scheduled_date DATE NOT NULL,
    scheduled_time TIME,
    status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'published', 'missed', 'cancelled'
    publish_config JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content approvals (workflow)
CREATE TABLE IF NOT EXISTS content_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'changes_requested'
    assigned_to UUID REFERENCES users(id),
    comments TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content generation jobs
CREATE TABLE IF NOT EXISTS content_generation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
    template_id UUID REFERENCES content_templates(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    platform VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'planning', 'generating', 'reviewing', 'completed', 'failed'
    input JSONB NOT NULL, -- prompt, variables, context
    output JSONB DEFAULT '{}', -- generated content
    quality_results JSONB DEFAULT '{}', -- quality check results
    error TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    cost_cents INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    provider_used VARCHAR(100),
    model_used VARCHAR(100),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content quality checks
CREATE TABLE IF NOT EXISTS content_quality_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    check_type VARCHAR(50) NOT NULL, -- 'grammar', 'readability', 'seo', 'brand_voice', 'duplicate', 'compliance', 'cta'
    score FLOAT DEFAULT 0,
    issues JSONB DEFAULT '[]',
    suggestions JSONB DEFAULT '[]',
    passed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_items_org ON content_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(type);
CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status);
CREATE INDEX IF NOT EXISTS idx_content_items_platform ON content_items(platform);
CREATE INDEX IF NOT EXISTS idx_content_items_campaign ON content_items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_items_template ON content_items(template_id);
CREATE INDEX IF NOT EXISTS idx_content_items_parent ON content_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_content_items_scheduled ON content_items(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_content_items_published ON content_items(published_at);
CREATE INDEX IF NOT EXISTS idx_content_versions_content ON content_versions(content_id);
CREATE INDEX IF NOT EXISTS idx_content_templates_org ON content_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_templates_category ON content_templates(category);
CREATE INDEX IF NOT EXISTS idx_content_calendar_org ON content_calendar(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_calendar_date ON content_calendar(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_content_calendar_campaign ON content_calendar(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_approvals_content ON content_approvals(content_id);
CREATE INDEX IF NOT EXISTS idx_content_approvals_status ON content_approvals(status);
CREATE INDEX IF NOT EXISTS idx_content_gen_jobs_org ON content_generation_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_gen_jobs_status ON content_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_content_quality_content ON content_quality_checks(content_id);
