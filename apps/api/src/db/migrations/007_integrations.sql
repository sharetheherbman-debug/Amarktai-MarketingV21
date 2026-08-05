-- Milestone 6: Integrations & Omnichannel Automation
-- Migration: 007_integrations.sql

-- Integration Providers (available integrations)
CREATE TABLE IF NOT EXISTS integration_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'cms', 'social', 'analytics', 'email', 'calendar', 'storage'
    description TEXT,
    icon VARCHAR(100),
    auth_type VARCHAR(50) NOT NULL, -- 'oauth2', 'api_key', 'basic', 'none'
    auth_config JSONB DEFAULT '{}', -- {client_id, scopes, auth_url, token_url}
    config_schema JSONB DEFAULT '{}', -- configuration fields
    capabilities JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Integration Connections (user-configured connections)
CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    auth_data JSONB DEFAULT '{}', -- encrypted tokens, api keys
    config JSONB DEFAULT '{}',
    permissions JSONB DEFAULT '[]',
    health_status VARCHAR(50) DEFAULT 'unknown',
    last_health_check TIMESTAMP WITH TIME ZONE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    rate_limit_remaining INTEGER DEFAULT 100,
    rate_limit_reset_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'active',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Integration Sync Logs
CREATE TABLE IF NOT EXISTS integration_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL, -- 'publish', 'sync', 'import', 'export'
    entity_type VARCHAR(100), -- 'content', 'post', 'analytics', 'contact'
    entity_id UUID,
    direction VARCHAR(20) DEFAULT 'outbound', -- 'inbound', 'outbound'
    status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'pending'
    request_data JSONB DEFAULT '{}',
    response_data JSONB DEFAULT '{}',
    error TEXT,
    latency_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhooks (incoming)
CREATE TABLE IF NOT EXISTS webhooks_incoming (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    endpoint_slug VARCHAR(100) UNIQUE NOT NULL,
    secret VARCHAR(255),
    events JSONB DEFAULT '[]', -- event types to listen for
    target_url VARCHAR(2000), -- forward to this URL
    config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhooks (outgoing)
CREATE TABLE IF NOT EXISTS webhooks_outgoing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(2000) NOT NULL,
    events JSONB DEFAULT '[]', -- event types to send
    secret VARCHAR(255),
    headers JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    retry_count INTEGER DEFAULT 3,
    last_sent_at TIMESTAMP WITH TIME ZONE,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Webhook Delivery Log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL,
    webhook_type VARCHAR(20) NOT NULL, -- 'incoming', 'outgoing'
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'delivered', 'failed', 'retrying'
    http_status INTEGER,
    response_body TEXT,
    error TEXT,
    attempt INTEGER DEFAULT 1,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Google Analytics Data Cache
CREATE TABLE IF NOT EXISTS analytics_google (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES integration_connections(id) ON DELETE SET NULL,
    metric_type VARCHAR(100) NOT NULL, -- 'traffic', 'conversions', 'keywords'
    dimension VARCHAR(100),
    dimension_value VARCHAR(500),
    metric_value FLOAT DEFAULT 0,
    date DATE NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Google Search Console Data Cache
CREATE TABLE IF NOT EXISTS analytics_search_console (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES integration_connections(id) ON DELETE SET NULL,
    query VARCHAR(500),
    page VARCHAR(2000),
    country VARCHAR(10),
    device VARCHAR(50),
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr FLOAT DEFAULT 0,
    position FLOAT DEFAULT 0,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email Provider Configurations
CREATE TABLE IF NOT EXISTS email_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- 'smtp', 'gmail', 'microsoft365', 'mailgun', 'sendgrid', 'ses'
    config JSONB DEFAULT '{}', -- encrypted credentials
    from_email VARCHAR(255),
    from_name VARCHAR(255),
    daily_limit INTEGER DEFAULT 500,
    sent_today INTEGER DEFAULT 0,
    health_status VARCHAR(50) DEFAULT 'unknown',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Import/Export Jobs
CREATE TABLE IF NOT EXISTS import_export_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL, -- 'import', 'export'
    entity_type VARCHAR(100) NOT NULL, -- 'contacts', 'companies', 'deals', 'content', 'campaigns'
    format VARCHAR(20) NOT NULL, -- 'csv', 'excel', 'json'
    file_url TEXT,
    file_name VARCHAR(500),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    success_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    errors JSONB DEFAULT '[]',
    mapping JSONB DEFAULT '{}', -- column mapping
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integration_providers_slug ON integration_providers(slug);
CREATE INDEX IF NOT EXISTS idx_integration_providers_category ON integration_providers(category);
CREATE INDEX IF NOT EXISTS idx_integration_connections_org ON integration_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_provider ON integration_connections(provider_id);
CREATE INDEX IF NOT EXISTS idx_integration_connections_status ON integration_connections(status);
CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_connection ON integration_sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_org ON integration_sync_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_status ON integration_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_integration_sync_logs_created ON integration_sync_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_webhooks_incoming_org ON webhooks_incoming(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_incoming_slug ON webhooks_incoming(endpoint_slug);
CREATE INDEX IF NOT EXISTS idx_webhooks_outgoing_org ON webhooks_outgoing(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_analytics_google_org ON analytics_google(organization_id);
CREATE INDEX IF NOT EXISTS idx_analytics_google_date ON analytics_google(date);
CREATE INDEX IF NOT EXISTS idx_analytics_sc_org ON analytics_search_console(organization_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sc_date ON analytics_search_console(date);
CREATE INDEX IF NOT EXISTS idx_email_providers_org ON email_providers(organization_id);
CREATE INDEX IF NOT EXISTS idx_import_export_jobs_org ON import_export_jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_import_export_jobs_status ON import_export_jobs(status);

-- Seed default integration providers
INSERT INTO integration_providers (slug, name, category, description, auth_type, capabilities) VALUES
('wordpress', 'WordPress', 'cms', 'Publish content to WordPress sites', 'api_key', '["publish","draft","update","media","categories","tags","seo"]'),
('webflow', 'Webflow', 'cms', 'Publish to Webflow sites', 'api_key', '["publish","draft","update"]'),
('ghost', 'Ghost', 'cms', 'Publish to Ghost blogs', 'api_key', '["publish","draft","update","tags"]'),
('facebook', 'Facebook Pages', 'social', 'Publish to Facebook Pages', 'oauth2', '["publish","schedule","analytics","media"]'),
('instagram', 'Instagram Business', 'social', 'Publish to Instagram', 'oauth2', '["publish","schedule","analytics","media"]'),
('linkedin', 'LinkedIn Pages', 'social', 'Publish to LinkedIn Pages', 'oauth2', '["publish","schedule","analytics"]'),
('x', 'X (Twitter)', 'social', 'Publish to X', 'oauth2', '["publish","schedule","analytics"]'),
('youtube', 'YouTube', 'social', 'Upload and manage YouTube videos', 'oauth2', '["upload","schedule","analytics"]'),
('pinterest', 'Pinterest', 'social', 'Publish pins to Pinterest', 'oauth2', '["publish","schedule","analytics"]'),
('google_analytics', 'Google Analytics 4', 'analytics', 'Collect traffic and conversion data', 'oauth2', '["traffic","conversions","events"]'),
('google_search_console', 'Google Search Console', 'analytics', 'Collect search performance data', 'oauth2', '["keywords","impressions","clicks","ctr"]'),
('google_business', 'Google Business Profile', 'analytics', 'Manage Google Business Profile', 'oauth2', '["profile","reviews","posts"]'),
('google_calendar', 'Google Calendar', 'calendar', 'Sync calendar events', 'oauth2', '["events","reminders"]'),
('google_drive', 'Google Drive', 'storage', 'Export documents to Google Drive', 'oauth2', '["upload","folders"]'),
('microsoft365', 'Microsoft 365', 'email', 'Send email via Microsoft 365', 'oauth2', '["email","calendar"]'),
('gmail', 'Gmail', 'email', 'Send email via Gmail', 'oauth2', '["email"]'),
('smtp', 'SMTP', 'email', 'Send email via custom SMTP server', 'basic', '["email"]'),
('mailgun', 'Mailgun', 'email', 'Send email via Mailgun', 'api_key', '["email","tracking","bounces"]'),
('sendgrid', 'SendGrid', 'email', 'Send email via SendGrid', 'api_key', '["email","tracking","templates"]'),
('ses', 'Amazon SES', 'email', 'Send email via Amazon SES', 'api_key', '["email"]'),
('outlook', 'Outlook Calendar', 'calendar', 'Sync with Outlook Calendar', 'oauth2', '["events","reminders"]')
ON CONFLICT (slug) DO NOTHING;
