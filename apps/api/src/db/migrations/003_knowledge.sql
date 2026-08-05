-- Milestone 2: Research & Knowledge
-- Migration: 003_knowledge.sql

-- Knowledge sources (websites, PDFs, documents)
CREATE TABLE knowledge_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'website', 'pdf', 'document', 'api', 'manual', 'faq'
    url TEXT,
    config JSONB DEFAULT '{}', -- crawl_depth, max_pages, include_patterns, exclude_patterns
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'crawling', 'processing', 'completed', 'failed'
    error_message TEXT,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    item_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Knowledge items (chunks of content)
CREATE TABLE knowledge_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_id UUID REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    title VARCHAR(500),
    content TEXT NOT NULL,
    content_type VARCHAR(50), -- 'page', 'section', 'paragraph', 'faq', 'product', 'policy'
    url TEXT,
    metadata JSONB DEFAULT '{}', -- headings, parent_url, language, etc.
    embedding VECTOR(1536), -- pgvector for similarity search
    tokens INTEGER DEFAULT 0,
    chunk_index INTEGER DEFAULT 0,
    parent_id UUID REFERENCES knowledge_items(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Competitors
CREATE TABLE competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT,
    description TEXT,
    industry VARCHAR(100),
    monitoring_config JSONB DEFAULT '{}', -- what to monitor
    last_checked_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'archived'
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Competitor snapshots (point-in-time data)
CREATE TABLE competitor_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'pricing', 'content', 'social', 'seo', 'general'
    title VARCHAR(500),
    data JSONB NOT NULL,
    summary TEXT,
    snapshot_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trend monitoring topics
CREATE TABLE trend_monitoring (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    topic VARCHAR(255) NOT NULL,
    description TEXT,
    keywords JSONB DEFAULT '[]',
    sources JSONB DEFAULT '[]', -- RSS feeds, API endpoints
    config JSONB DEFAULT '{}',
    last_checked_at TIMESTAMP WITH TIME ZONE,
    alert_threshold FLOAT DEFAULT 0.5,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trend items (individual trend entries)
CREATE TABLE trend_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    monitor_id UUID NOT NULL REFERENCES trend_monitoring(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(500),
    url TEXT,
    source VARCHAR(255),
    summary TEXT,
    relevance_score FLOAT DEFAULT 0,
    sentiment VARCHAR(50), -- 'positive', 'negative', 'neutral', 'mixed'
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT FALSE,
    is_saved BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_knowledge_sources_org ON knowledge_sources(organization_id);
CREATE INDEX idx_knowledge_sources_type ON knowledge_sources(type);
CREATE INDEX idx_knowledge_sources_status ON knowledge_sources(status);
CREATE INDEX idx_knowledge_items_org ON knowledge_items(organization_id);
CREATE INDEX idx_knowledge_items_source ON knowledge_items(source_id);
CREATE INDEX idx_knowledge_items_type ON knowledge_items(content_type);
CREATE INDEX idx_knowledge_items_tokens ON knowledge_items(tokens);
CREATE INDEX idx_competitors_org ON competitors(organization_id);
CREATE INDEX idx_competitors_status ON competitors(status);
CREATE INDEX idx_competitor_snapshots_competitor ON competitor_snapshots(competitor_id);
CREATE INDEX idx_competitor_snapshots_type ON competitor_snapshots(type);
CREATE INDEX idx_competitor_snapshots_date ON competitor_snapshots(snapshot_date);
CREATE INDEX idx_trend_monitoring_org ON trend_monitoring(organization_id);
CREATE INDEX idx_trend_monitoring_active ON trend_monitoring(is_active);
CREATE INDEX idx_trend_items_monitor ON trend_items(monitor_id);
CREATE INDEX idx_trend_items_org ON trend_items(organization_id);
CREATE INDEX idx_trend_items_relevance ON trend_items(relevance_score);
CREATE INDEX idx_trend_items_created ON trend_items(created_at);
