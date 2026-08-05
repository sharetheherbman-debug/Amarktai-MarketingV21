-- Migration: 002_ai_core.sql
-- Description: Milestone 1 - AI Core tables
-- Created: 2026-08-04

-- Agent definitions (the agent registry)
CREATE TABLE agent_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'worker',
    description TEXT,
    system_prompt TEXT NOT NULL,
    model VARCHAR(100),
    provider VARCHAR(50),
    capabilities JSONB DEFAULT '[]',
    tools JSONB DEFAULT '[]',
    memory_config JSONB DEFAULT '{"loadBrandDna": true, "loadKnowledge": true, "loadHistory": true}',
    config JSONB DEFAULT '{}',
    parent_id UUID REFERENCES agent_definitions(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(organization_id, slug)
);

-- Prompt library
CREATE TABLE prompt_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    template TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    model_preferences JSONB DEFAULT '{}',
    system_prompt TEXT,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    test_cases JSONB DEFAULT '[]',
    performance_score FLOAT DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(organization_id, slug, version)
);

-- Prompt versions (for rollback)
CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prompt_id UUID NOT NULL REFERENCES prompt_library(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    template TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    system_prompt TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(prompt_id, version)
);

-- Brand DNA
CREATE TABLE brand_dna (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    company_description TEXT,
    industry VARCHAR(100),
    products JSONB DEFAULT '[]',
    brand_voice TEXT,
    tone VARCHAR(100) DEFAULT 'professional',
    colors JSONB DEFAULT '{}',
    logo_url TEXT,
    target_audience JSONB DEFAULT '{}',
    competitors JSONB DEFAULT '[]',
    goals JSONB DEFAULT '[]',
    keywords JSONB DEFAULT '[]',
    writing_style TEXT,
    compliance_rules JSONB DEFAULT '[]',
    preferred_ctas JSONB DEFAULT '[]',
    prohibited_phrases JSONB DEFAULT '[]',
    social_handles JSONB DEFAULT '{}',
    website_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id)
);

-- Tool registry
CREATE TABLE tool_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50),
    input_schema JSONB DEFAULT '{}',
    output_schema JSONB DEFAULT '{}',
    handler_type VARCHAR(50) DEFAULT 'internal',
    handler_config JSONB DEFAULT '{}',
    permissions JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent conversations (multi-turn)
CREATE TABLE agent_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agent_definitions(id) ON DELETE SET NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    messages JSONB DEFAULT '[]',
    context JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    token_count INTEGER DEFAULT 0,
    cost_cents INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prompt test results
CREATE TABLE prompt_test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    prompt_id UUID NOT NULL REFERENCES prompt_library(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    test_case_index INTEGER NOT NULL,
    input JSONB NOT NULL,
    output TEXT,
    model VARCHAR(100),
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    score FLOAT,
    passed BOOLEAN,
    run_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_definitions_org ON agent_definitions(organization_id);
CREATE INDEX idx_agent_definitions_type ON agent_definitions(type);
CREATE INDEX idx_agent_definitions_parent ON agent_definitions(parent_id);
CREATE INDEX idx_agent_definitions_slug ON agent_definitions(organization_id, slug);
CREATE INDEX idx_prompt_library_org ON prompt_library(organization_id);
CREATE INDEX idx_prompt_library_category ON prompt_library(category);
CREATE INDEX idx_prompt_library_slug ON prompt_library(organization_id, slug);
CREATE INDEX idx_prompt_library_active ON prompt_library(organization_id, is_active);
CREATE INDEX idx_prompt_versions_prompt ON prompt_versions(prompt_id);
CREATE INDEX idx_brand_dna_org ON brand_dna(organization_id);
CREATE INDEX idx_tool_registry_category ON tool_registry(category);
CREATE INDEX idx_agent_conversations_org ON agent_conversations(organization_id);
CREATE INDEX idx_agent_conversations_agent ON agent_conversations(agent_id);
CREATE INDEX idx_agent_conversations_task ON agent_conversations(task_id);
CREATE INDEX idx_agent_conversations_status ON agent_conversations(status);
CREATE INDEX idx_prompt_test_results_prompt ON prompt_test_results(prompt_id);

-- Seed data: Default tools
INSERT INTO tool_registry (name, description, category, input_schema, output_schema, handler_type) VALUES
('web_search', 'Search the web for information', 'research', '{"query": {"type": "string", "required": true}}', '{"results": "array"}', 'internal'),
('generate_text', 'Generate text using AI', 'content', '{"prompt": {"type": "string", "required": true}, "model": {"type": "string"}}', '{"text": "string"}', 'internal'),
('analyze_seo', 'Analyze content for SEO', 'seo', '{"url": {"type": "string"}, "content": {"type": "string"}}', '{"score": "number", "issues": "array"}', 'internal'),
('create_social_post', 'Create a social media post', 'social', '{"platform": {"type": "string", "required": true}, "content": {"type": "string", "required": true}}', '{"post": "object"}', 'internal'),
('send_email', 'Send an email', 'crm', '{"to": {"type": "string", "required": true}, "subject": {"type": "string", "required": true}, "body": {"type": "string", "required": true}}', '{"sent": "boolean"}', 'internal'),
('get_analytics', 'Retrieve analytics data', 'analytics', '{"metric": {"type": "string", "required": true}, "date_range": {"type": "object"}}', '{"data": "object"}', 'internal'),
('search_knowledge', 'Search the knowledge base', 'research', '{"query": {"type": "string", "required": true}}', '{"results": "array"}', 'internal'),
('generate_image', 'Generate an image using AI', 'content', '{"prompt": {"type": "string", "required": true}, "style": {"type": "string"}}', '{"url": "string"}', 'internal'),
('schedule_post', 'Schedule a social media post', 'social', '{"platform": {"type": "string", "required": true}, "content": {"type": "string", "required": true}, "scheduled_at": {"type": "string", "required": true}}', '{"scheduled": "boolean"}', 'internal'),
('create_task', 'Create a task for an agent', 'utility', '{"title": {"type": "string", "required": true}, "agent_id": {"type": "string"}}', '{"task": "object"}', 'internal');
