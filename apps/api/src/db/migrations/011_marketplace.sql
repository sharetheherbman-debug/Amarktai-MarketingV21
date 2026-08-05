-- Milestone 9: Marketplace, Developer Platform & Extensibility
-- Migration: 011_marketplace.sql

-- Marketplace Publishers
CREATE TABLE IF NOT EXISTS marketplace_publishers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    website VARCHAR(2000),
    email VARCHAR(255),
    logo TEXT,
    verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    total_downloads INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Marketplace Items (agents, prompts, workflows, plugins, skill packs)
CREATE TABLE IF NOT EXISTS marketplace_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publisher_id UUID NOT NULL REFERENCES marketplace_publishers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    long_description TEXT,
    category VARCHAR(100) NOT NULL, -- 'agent', 'prompt_pack', 'workflow', 'plugin', 'skill_pack'
    subcategory VARCHAR(100),
    icon TEXT,
    screenshots JSONB DEFAULT '[]',
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    version_history JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',
    compatibility JSONB DEFAULT '{}',
    config_schema JSONB DEFAULT '{}',
    license VARCHAR(100) DEFAULT 'MIT',
    price_cents INTEGER DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    is_free BOOLEAN DEFAULT TRUE,
    download_count INTEGER DEFAULT 0,
    install_count INTEGER DEFAULT 0,
    rating_average FLOAT DEFAULT 0,
    rating_count INTEGER DEFAULT 0,
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'pending_review', 'approved', 'published', 'rejected', 'suspended'
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(publisher_id, slug)
);

-- Marketplace Item Versions
CREATE TABLE IF NOT EXISTS marketplace_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    changelog TEXT,
    file_url TEXT,
    file_hash VARCHAR(255),
    file_size INTEGER,
    config_schema JSONB DEFAULT '{}',
    dependencies JSONB DEFAULT '[]',
    is_latest BOOLEAN DEFAULT TRUE,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(item_id, version)
);

-- Marketplace Installations
CREATE TABLE IF NOT EXISTS marketplace_installations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
    version_id UUID REFERENCES marketplace_versions(id) ON DELETE SET NULL,
    installed_version VARCHAR(50) NOT NULL,
    config JSONB DEFAULT '{}',
    permissions JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'disabled', 'updating', 'error'
    health_status VARCHAR(50) DEFAULT 'unknown',
    last_health_check TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    installed_by UUID REFERENCES users(id),
    installed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(organization_id, item_id)
);

-- Marketplace Reviews
CREATE TABLE IF NOT EXISTS marketplace_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    helpful_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'published', -- 'published', 'hidden', 'flagged'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(item_id, user_id)
);

-- Marketplace Categories
CREATE TABLE IF NOT EXISTS marketplace_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    parent_id UUID REFERENCES marketplace_categories(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    item_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Skill Packs (AI capability bundles)
CREATE TABLE IF NOT EXISTS skill_packs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    marketplace_item_id UUID REFERENCES marketplace_items(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    industry VARCHAR(100),
    capabilities JSONB DEFAULT '[]',
    agents JSONB DEFAULT '[]', -- agent definitions included
    prompts JSONB DEFAULT '[]', -- prompt templates included
    workflows JSONB DEFAULT '[]', -- workflow templates included
    tools JSONB DEFAULT '[]', -- tools required
    config JSONB DEFAULT '{}',
    compatibility JSONB DEFAULT '{}',
    version VARCHAR(50) DEFAULT '1.0.0',
    install_count INTEGER DEFAULT 0,
    rating_average FLOAT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth Applications (for developer portal)
CREATE TABLE IF NOT EXISTS oauth_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    client_id VARCHAR(255) UNIQUE NOT NULL,
    client_secret_hash VARCHAR(255) NOT NULL,
    redirect_uris JSONB DEFAULT '[]',
    scopes JSONB DEFAULT '[]',
    is_confidential BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth Access Tokens
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES oauth_applications(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    access_token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    scopes JSONB DEFAULT '[]',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Marketplace Submissions (approval workflow)
CREATE TABLE IF NOT EXISTS marketplace_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
    publisher_id UUID NOT NULL REFERENCES marketplace_publishers(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    submission_data JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_review', 'approved', 'rejected', 'changes_requested'
    reviewer_id UUID REFERENCES users(id),
    review_notes TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_publishers_user ON marketplace_publishers(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_publishers_slug ON marketplace_publishers(slug);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_publisher ON marketplace_items(publisher_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_category ON marketplace_items(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_status ON marketplace_items(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_slug ON marketplace_items(slug);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_rating ON marketplace_items(rating_average);
CREATE INDEX IF NOT EXISTS idx_marketplace_items_downloads ON marketplace_items(download_count);
CREATE INDEX IF NOT EXISTS idx_marketplace_versions_item ON marketplace_versions(item_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_installations_org ON marketplace_installations(organization_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_installations_item ON marketplace_installations(item_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_item ON marketplace_reviews(item_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_reviews_user ON marketplace_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_categories_slug ON marketplace_categories(slug);
CREATE INDEX IF NOT EXISTS idx_skill_packs_slug ON skill_packs(slug);
CREATE INDEX IF NOT EXISTS idx_skill_packs_marketplace ON skill_packs(marketplace_item_id);
CREATE INDEX IF NOT EXISTS idx_oauth_applications_client ON oauth_applications(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth_applications_org ON oauth_applications(organization_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_application ON oauth_tokens(application_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_submissions_item ON marketplace_submissions(item_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_submissions_status ON marketplace_submissions(status);

-- Seed default categories
INSERT INTO marketplace_categories (name, slug, description, sort_order) VALUES
('AI Agents', 'agents', 'Pre-built AI agents for marketing tasks', 1),
('Prompt Packs', 'prompt-packs', 'Curated prompt templates for various use cases', 2),
('Workflow Templates', 'workflows', 'Reusable marketing automation workflows', 3),
('Plugins', 'plugins', 'Third-party integrations and extensions', 4),
('Skill Packs', 'skill-packs', 'Industry-specific AI capability bundles', 5)
ON CONFLICT (slug) DO NOTHING;
