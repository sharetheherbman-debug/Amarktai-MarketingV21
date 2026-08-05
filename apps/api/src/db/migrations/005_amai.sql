-- Milestone 4: Autonomous Marketing Intelligence Engine
-- Migration: 005_amai.sql

-- SEO Keywords
CREATE TABLE IF NOT EXISTS seo_keywords (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    keyword VARCHAR(500) NOT NULL,
    search_volume INTEGER DEFAULT 0,
    difficulty FLOAT DEFAULT 0,
    cpc_cents INTEGER DEFAULT 0,
    intent VARCHAR(50), -- 'informational', 'navigational', 'commercial', 'transactional'
    cluster_id UUID,
    status VARCHAR(50) DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SEO Keyword Clusters
CREATE TABLE IF NOT EXISTS seo_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    pillar_page VARCHAR(500),
    description TEXT,
    keyword_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SEO Audits
CREATE TABLE IF NOT EXISTS seo_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    url VARCHAR(2000) NOT NULL,
    score FLOAT DEFAULT 0,
    issues JSONB DEFAULT '[]',
    suggestions JSONB DEFAULT '[]',
    technical JSONB DEFAULT '{}',
    performance JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaign Plans
CREATE TABLE IF NOT EXISTS campaign_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    goal TEXT,
    target_audience JSONB DEFAULT '{}',
    budget_cents INTEGER DEFAULT 0,
    strategy JSONB DEFAULT '{}',
    channels JSONB DEFAULT '{}',
    kpis JSONB DEFAULT '{}',
    content_calendar JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'draft',
    ai_generated BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Agent Hierarchy
CREATE TABLE IF NOT EXISTS ai_agent_hierarchy (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agent_definitions(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES ai_agent_hierarchy(id) ON DELETE SET NULL,
    role VARCHAR(100) NOT NULL, -- 'ceo', 'director', 'manager', 'worker'
    level INTEGER DEFAULT 0,
    capabilities JSONB DEFAULT '[]',
    delegation_rules JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflows
CREATE TABLE IF NOT EXISTS workflows_v2 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_type VARCHAR(100), -- 'manual', 'scheduled', 'event', 'webhook'
    trigger_config JSONB DEFAULT '{}',
    steps JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'draft',
    is_template BOOLEAN DEFAULT FALSE,
    template_category VARCHAR(100),
    run_count INTEGER DEFAULT 0,
    last_run_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Workflow Executions
CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES workflows_v2(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'running',
    current_step INTEGER DEFAULT 0,
    input JSONB DEFAULT '{}',
    output JSONB DEFAULT '{}',
    error TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id)
);

-- Social Connections
CREATE TABLE IF NOT EXISTS social_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    account_name VARCHAR(255),
    account_id VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    config JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Social Posts
CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES social_connections(id) ON DELETE SET NULL,
    content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    body TEXT,
    media_urls JSONB DEFAULT '[]',
    hashtags JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'draft',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    external_id VARCHAR(255),
    external_url VARCHAR(2000),
    engagement JSONB DEFAULT '{}',
    error TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaign Optimizations
CREATE TABLE IF NOT EXISTS campaign_optimizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL, -- 'content_rewrite', 'timing', 'keyword', 'audience'
    recommendation TEXT,
    data JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'suggested',
    impact_score FLOAT DEFAULT 0,
    applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tool Integrations (expanded)
CREATE TABLE IF NOT EXISTS tool_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    tool_id UUID REFERENCES tool_registry(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    auth_type VARCHAR(50), -- 'api_key', 'oauth2', 'basic', 'none'
    auth_config JSONB DEFAULT '{}',
    config JSONB DEFAULT '{}',
    permissions JSONB DEFAULT '[]',
    rate_limit INTEGER DEFAULT 100,
    rate_window_seconds INTEGER DEFAULT 60,
    health_status VARCHAR(50) DEFAULT 'unknown',
    last_health_check TIMESTAMP WITH TIME ZONE,
    retry_config JSONB DEFAULT '{"max_retries": 3, "backoff_ms": 1000}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_seo_keywords_org ON seo_keywords(organization_id);
CREATE INDEX IF NOT EXISTS idx_seo_keywords_cluster ON seo_keywords(cluster_id);
CREATE INDEX IF NOT EXISTS idx_seo_clusters_org ON seo_clusters(organization_id);
CREATE INDEX IF NOT EXISTS idx_seo_audits_org ON seo_audits(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_plans_org ON campaign_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaign_plans_status ON campaign_plans(status);
CREATE INDEX IF NOT EXISTS idx_agent_hierarchy_org ON ai_agent_hierarchy(organization_id);
CREATE INDEX IF NOT EXISTS idx_agent_hierarchy_parent ON ai_agent_hierarchy(parent_id);
CREATE INDEX IF NOT EXISTS idx_workflows_v2_org ON workflows_v2(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_org ON social_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_org ON social_posts(organization_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_platform ON social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_campaign_optimizations_campaign ON campaign_optimizations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_tool_integrations_org ON tool_integrations(organization_id);
