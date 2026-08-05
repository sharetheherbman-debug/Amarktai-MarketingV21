-- Milestone 5: Revenue Engine (CRM + Sales + Customer Success)
-- Migration: 006_revenue_engine.sql

-- CRM Companies
CREATE TABLE IF NOT EXISTS crm_companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    industry VARCHAR(100),
    size VARCHAR(50), -- 'startup', 'small', 'medium', 'enterprise'
    revenue_range VARCHAR(100),
    description TEXT,
    website VARCHAR(2000),
    phone VARCHAR(50),
    email VARCHAR(255),
    address JSONB DEFAULT '{}',
    social_links JSONB DEFAULT '{}',
    tags JSONB DEFAULT '[]',
    custom_fields JSONB DEFAULT '{}',
    ai_summary TEXT,
    ai_insights JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- CRM Contacts
CREATE TABLE IF NOT EXISTS crm_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    title VARCHAR(255),
    department VARCHAR(100),
    avatar TEXT,
    linkedin VARCHAR(500),
    address JSONB DEFAULT '{}',
    tags JSONB DEFAULT '[]',
    custom_fields JSONB DEFAULT '{}',
    lead_score INTEGER DEFAULT 0,
    lead_status VARCHAR(50) DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'
    lead_source VARCHAR(100),
    owner_id UUID REFERENCES users(id),
    ai_summary TEXT,
    ai_insights JSONB DEFAULT '{}',
    ai_next_action TEXT,
    last_contacted_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- CRM Contact Relationships
CREATE TABLE IF NOT EXISTS crm_contact_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
    related_contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL, -- 'colleague', 'manager', 'reports_to', 'spouse', 'referral'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(contact_id, related_contact_id, relationship_type)
);

-- CRM Notes
CREATE TABLE IF NOT EXISTS crm_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL, -- 'contact', 'company', 'deal', 'lead'
    entity_id UUID NOT NULL,
    content TEXT NOT NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Activities
CREATE TABLE IF NOT EXISTS crm_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'call', 'email', 'meeting', 'note', 'task', 'demo', 'proposal'
    subject VARCHAR(500),
    description TEXT,
    duration_minutes INTEGER,
    outcome VARCHAR(100),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'planned', -- 'planned', 'completed', 'cancelled', 'no_show'
    assigned_to UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Deals / Opportunities
CREATE TABLE IF NOT EXISTS crm_deals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
    company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    stage VARCHAR(100) NOT NULL DEFAULT 'qualification',
    value_cents BIGINT DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'USD',
    probability INTEGER DEFAULT 0,
    expected_close_date DATE,
    actual_close_date DATE,
    pipeline VARCHAR(100) DEFAULT 'default',
    win_reason TEXT,
    loss_reason TEXT,
    loss_competitor VARCHAR(255),
    products JSONB DEFAULT '[]',
    tags JSONB DEFAULT '[]',
    custom_fields JSONB DEFAULT '{}',
    owner_id UUID REFERENCES users(id),
    ai_health_score INTEGER DEFAULT 0,
    ai_forecast JSONB DEFAULT '{}',
    ai_summary TEXT,
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'won', 'lost', 'archived'
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- CRM Customers
CREATE TABLE IF NOT EXISTS crm_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
    company_id UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
    deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
    customer_type VARCHAR(50) DEFAULT 'standard', -- 'standard', 'premium', 'enterprise'
    health_score INTEGER DEFAULT 50,
    nps_score INTEGER,
    satisfaction_score INTEGER,
    churn_risk INTEGER DEFAULT 0,
    onboarding_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
    onboarding_progress INTEGER DEFAULT 0,
    renewal_date DATE,
    renewal_value_cents BIGINT DEFAULT 0,
    lifetime_value_cents BIGINT DEFAULT 0,
    expansion_opportunities JSONB DEFAULT '[]',
    success_plan JSONB DEFAULT '{}',
    ai_health_summary TEXT,
    ai_retention_recommendations JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'churned', 'expansion', 'at_risk'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Email Templates
CREATE TABLE IF NOT EXISTS crm_email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    body TEXT NOT NULL,
    category VARCHAR(100), -- 'outreach', 'follow_up', 'proposal', 'onboarding', 'renewal'
    variables JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    usage_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Email Sequences
CREATE TABLE IF NOT EXISTS crm_email_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSONB DEFAULT '[]', -- [{day:1,template_id:uuid,delay_hours:24}]
    status VARCHAR(50) DEFAULT 'active',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Sequence Enrollments
CREATE TABLE IF NOT EXISTS crm_sequence_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sequence_id UUID NOT NULL REFERENCES crm_email_sequences(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
    current_step INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'completed', 'replied', 'bounced'
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    next_send_at TIMESTAMP WITH TIME ZONE
);

-- CRM Pipeline Stages
CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    pipeline VARCHAR(100) DEFAULT 'default',
    name VARCHAR(100) NOT NULL,
    position INTEGER NOT NULL,
    probability INTEGER DEFAULT 0,
    color VARCHAR(20) DEFAULT '#6366f1',
    is_won BOOLEAN DEFAULT FALSE,
    is_lost BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Tasks
CREATE TABLE IF NOT EXISTS crm_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    entity_type VARCHAR(50),
    entity_id UUID,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'general', -- 'call', 'email', 'meeting', 'follow_up', 'general'
    priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'cancelled'
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    assigned_to UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Campaign Attribution
CREATE TABLE IF NOT EXISTS crm_campaign_attribution (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES crm_contacts(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    touchpoint_type VARCHAR(100), -- 'first_touch', 'last_touch', 'multi_touch'
    attribution_weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_companies_org ON crm_companies(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_companies_domain ON crm_companies(domain);
CREATE INDEX IF NOT EXISTS idx_crm_companies_name ON crm_companies(name);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_org ON crm_contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON crm_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner ON crm_contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts(lead_status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_score ON crm_contacts(lead_score);
CREATE INDEX IF NOT EXISTS idx_crm_contact_rel_contact ON crm_contact_relationships(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_entity ON crm_notes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_entity ON crm_activities(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(type);
CREATE INDEX IF NOT EXISTS idx_crm_activities_status ON crm_activities(status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_org ON crm_deals(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_contact ON crm_deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_company ON crm_deals(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_status ON crm_deals(status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_owner ON crm_deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_customers_org ON crm_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_customers_contact ON crm_customers(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_customers_health ON crm_customers(health_score);
CREATE INDEX IF NOT EXISTS idx_crm_customers_churn ON crm_customers(churn_risk);
CREATE INDEX IF NOT EXISTS idx_crm_email_templates_org ON crm_email_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_seq_org ON crm_email_sequences(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_seq_enroll_seq ON crm_sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_crm_seq_enroll_contact ON crm_sequence_enrollments(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_org ON crm_pipeline_stages(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_org ON crm_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned ON crm_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_attr_contact ON crm_campaign_attribution(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_attr_deal ON crm_campaign_attribution(deal_id);

-- Default pipeline stages
INSERT INTO crm_pipeline_stages (organization_id, pipeline, name, position, probability) VALUES
('00000000-0000-0000-0000-000000000000', 'default', 'Qualification', 1, 10),
('00000000-0000-0000-0000-000000000000', 'default', 'Discovery', 2, 25),
('00000000-0000-0000-0000-000000000000', 'default', 'Proposal', 3, 50),
('00000000-0000-0000-0000-000000000000', 'default', 'Negotiation', 4, 75),
('00000000-0000-0000-0000-000000000000', 'default', 'Closed Won', 5, 100),
('00000000-0000-0000-0000-000000000000', 'default', 'Closed Lost', 6, 0)
ON CONFLICT DO NOTHING;
