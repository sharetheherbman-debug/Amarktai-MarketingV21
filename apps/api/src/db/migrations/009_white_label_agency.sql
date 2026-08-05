-- Milestone 8: White Label & Agency Platform
-- Migration: 009_white_label_agency.sql

-- Agency (parent organization that manages clients)
CREATE TABLE IF NOT EXISTS agencies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    logo TEXT,
    website VARCHAR(2000),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    max_clients INTEGER DEFAULT 10,
    max_team_members INTEGER DEFAULT 50,
    status VARCHAR(50) DEFAULT 'active',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Client Portals (white-labeled portals for agency clients)
CREATE TABLE IF NOT EXISTS client_portals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    client_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    portal_name VARCHAR(255) NOT NULL,
    custom_domain VARCHAR(255),
    subdomain VARCHAR(100),
    branding JSONB DEFAULT '{}', -- {logo, colors, favicon, font, css}
    features JSONB DEFAULT '{}', -- enabled features for this client
    settings JSONB DEFAULT '{}',
    ssl_status VARCHAR(50) DEFAULT 'pending',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agency_id, client_organization_id)
);

-- White Label Configurations
CREATE TABLE IF NOT EXISTS white_label_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    brand_name VARCHAR(255),
    brand_logo TEXT,
    brand_favicon TEXT,
    brand_colors JSONB DEFAULT '{}', -- {primary, secondary, accent, background, text}
    brand_font VARCHAR(100),
    custom_css TEXT,
    email_branding JSONB DEFAULT '{}', -- {logo, colors, footer}
    login_page_config JSONB DEFAULT '{}', -- {background, logo, title, subtitle}
    sidebar_config JSONB DEFAULT '{}', -- {logo, collapsed_logo}
    removed_branding BOOLEAN DEFAULT FALSE, -- remove AmarktAI branding
    custom_footer TEXT,
    support_email VARCHAR(255),
    support_url VARCHAR(2000),
    terms_url VARCHAR(2000),
    privacy_url VARCHAR(2000),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Custom Domains
CREATE TABLE IF NOT EXISTS custom_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    domain VARCHAR(255) UNIQUE NOT NULL,
    target_cname VARCHAR(255),
    ssl_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'active', 'failed'
    ssl_issuer VARCHAR(255),
    ssl_expires_at TIMESTAMP WITH TIME ZONE,
    verification_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'verified', 'failed'
    verification_token VARCHAR(255),
    dns_records JSONB DEFAULT '[]',
    is_primary BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agency Team Members
CREATE TABLE IF NOT EXISTS agency_team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'manager', 'member', 'viewer'
    permissions JSONB DEFAULT '{}',
    assigned_clients JSONB DEFAULT '[]', -- client org IDs they can access
    status VARCHAR(50) DEFAULT 'active',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agency_id, user_id)
);

-- Agency Client Assignments
CREATE TABLE IF NOT EXISTS agency_client_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    client_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL, -- agency team member
    relationship_type VARCHAR(50) DEFAULT 'managed', -- 'managed', 'consultant', 'fulfillment'
    contract_start DATE,
    contract_end DATE,
    monthly_fee_cents INTEGER DEFAULT 0,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(agency_id, client_organization_id)
);

-- Client Reports (agency generates for clients)
CREATE TABLE IF NOT EXISTS client_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    client_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    report_type VARCHAR(100) NOT NULL, -- 'monthly', 'weekly', 'campaign', 'custom'
    period_start DATE,
    period_end DATE,
    content JSONB DEFAULT '{}', -- report data
    summary TEXT,
    ai_summary TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'published', 'sent'
    sent_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Client Portal Access Logs
CREATE TABLE IF NOT EXISTS portal_access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    portal_id UUID NOT NULL REFERENCES client_portals(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- 'login', 'view_dashboard', 'view_report', 'download'
    ip_address VARCHAR(45),
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Template Library (reusable templates for agencies)
CREATE TABLE IF NOT EXISTS template_library (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL, -- 'campaign', 'workflow', 'prompt', 'brand_dna', 'seo', 'crm', 'onboarding'
    template_type VARCHAR(100) NOT NULL, -- 'campaign_template', 'workflow_template', etc.
    template_data JSONB DEFAULT '{}',
    is_system BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,
    usage_count INTEGER DEFAULT 0,
    tags JSONB DEFAULT '[]',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agencies_org ON agencies(organization_id);
CREATE INDEX IF NOT EXISTS idx_agencies_slug ON agencies(slug);
CREATE INDEX IF NOT EXISTS idx_client_portals_agency ON client_portals(agency_id);
CREATE INDEX IF NOT EXISTS idx_client_portals_client ON client_portals(client_organization_id);
CREATE INDEX IF NOT EXISTS idx_client_portals_domain ON client_portals(custom_domain);
CREATE INDEX IF NOT EXISTS idx_white_label_configs_org ON white_label_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_org ON custom_domains(organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_agency_team_agency ON agency_team_members(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_team_user ON agency_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_agency_assignments_agency ON agency_client_assignments(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_assignments_client ON agency_client_assignments(client_organization_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_agency ON client_reports(agency_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_client ON client_reports(client_organization_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_logs_portal ON portal_access_logs(portal_id);
CREATE INDEX IF NOT EXISTS idx_template_library_org ON template_library(organization_id);
CREATE INDEX IF NOT EXISTS idx_template_library_category ON template_library(category);
CREATE INDEX IF NOT EXISTS idx_template_library_type ON template_library(template_type);
