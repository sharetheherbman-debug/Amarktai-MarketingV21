-- Complete the launch-visible CRM AI, marketplace, orchestration,
-- knowledge, advertising and external analytics features.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS tools JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE marketplace_items
  ADD COLUMN IF NOT EXISTS package_manifest JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE marketplace_installations
  ADD COLUMN IF NOT EXISTS installed_entities JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS provider_response JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS crm_ai_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  due_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_ai_actions_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT crm_ai_actions_status_check CHECK (status IN ('open', 'completed', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_actions_org_status
  ON crm_ai_actions(organization_id, status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_ai_actions_entity
  ON crm_ai_actions(organization_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS external_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  provider_slug VARCHAR(100) NOT NULL,
  metric_scope VARCHAR(40) NOT NULL,
  period_start DATE,
  period_end DATE,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_metrics_org_scope
  ON external_metric_snapshots(organization_id, metric_scope, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_metrics_connection
  ON external_metric_snapshots(connection_id, collected_at DESC);

CREATE TABLE IF NOT EXISTS advertising_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  external_id VARCHAR(255) NOT NULL,
  provider_slug VARCHAR(100) NOT NULL,
  name VARCHAR(500) NOT NULL,
  status VARCHAR(60) NOT NULL DEFAULT 'unknown',
  objective VARCHAR(120),
  daily_budget_cents BIGINT NOT NULL DEFAULT 0,
  lifetime_budget_cents BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_advertising_campaigns_org
  ON advertising_campaigns(organization_id, provider_slug, status);

CREATE INDEX IF NOT EXISTS idx_knowledge_items_full_text
  ON knowledge_items
  USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content, '')));

INSERT INTO integration_providers
  (slug, name, category, description, auth_type, auth_config, config_schema, capabilities, is_active)
VALUES
  (
    'meta-ads',
    'Meta Ads',
    'advertising',
    'Synchronize Meta advertising campaigns and account performance using the Marketing API.',
    'bearer',
    '{"fields":["access_token"]}'::jsonb,
    '{"fields":["ad_account_id","api_version"]}'::jsonb,
    '["connection_test","campaign_sync","metrics_sync"]'::jsonb,
    TRUE
  ),
  (
    'google-ads',
    'Google Ads',
    'advertising',
    'Synchronize Google Ads campaigns and performance using the Google Ads API.',
    'oauth2',
    '{"fields":["access_token","developer_token","login_customer_id"]}'::jsonb,
    '{"fields":["customer_id","api_version"]}'::jsonb,
    '["connection_test","campaign_sync","metrics_sync"]'::jsonb,
    TRUE
  ),
  (
    'ga4',
    'Google Analytics 4',
    'analytics',
    'Import real traffic, user, conversion and engagement metrics from the GA4 Data API.',
    'oauth2',
    '{"fields":["access_token"]}'::jsonb,
    '{"fields":["property_id"]}'::jsonb,
    '["connection_test","metrics_sync"]'::jsonb,
    TRUE
  ),
  (
    'plausible',
    'Plausible Analytics',
    'analytics',
    'Import visitors, pageviews, bounce rate and visit duration from Plausible.',
    'bearer',
    '{"fields":["api_key"]}'::jsonb,
    '{"fields":["site_id","base_url"]}'::jsonb,
    '["connection_test","metrics_sync"]'::jsonb,
    TRUE
  ),
  (
    'generic-analytics',
    'Generic JSON Analytics',
    'analytics',
    'Import metrics from an authenticated JSON endpoint.',
    'custom',
    '{"fields":["headers"]}'::jsonb,
    '{"fields":["url","method"]}'::jsonb,
    '["connection_test","metrics_sync"]'::jsonb,
    TRUE
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  auth_type = EXCLUDED.auth_type,
  auth_config = EXCLUDED.auth_config,
  config_schema = EXCLUDED.config_schema,
  capabilities = EXCLUDED.capabilities,
  is_active = TRUE;
