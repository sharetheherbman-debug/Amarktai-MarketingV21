-- Unified tenant Marketing Library, versioned packs, stock provenance and
-- owner-reviewed website bootstrap. Additive only: legacy content_templates and
-- template_library remain available through compatibility adapters.

CREATE TABLE IF NOT EXISTS library_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  slug VARCHAR(180) NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','inactive','archived')),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug, version)
);

CREATE TABLE IF NOT EXISTS library_pack_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pack_id UUID NOT NULL REFERENCES library_packs(id) ON DELETE CASCADE,
  item_key VARCHAR(220) NOT NULL,
  kind VARCHAR(60) NOT NULL CHECK (kind IN (
    'copy_template','social_post_template','social_ad_template','image_ad_layout',
    'carousel_layout','story_layout','reel_layout','promotional_graphic_layout',
    'website_banner_layout','email_template','landing_page_template','article_template',
    'offer_template','retargeting_template','video_recipe','campaign_pack',
    'stock_photo_reference','stock_video_reference','uploaded_asset','generated_asset','brand_asset'
  )),
  category VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  channel VARCHAR(60),
  aspect_ratio VARCHAR(30),
  dimensions VARCHAR(40),
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_kind VARCHAR(40) NOT NULL DEFAULT 'pack'
    CHECK (source_kind IN ('pack','owner_upload','first_party','generated','stock_provider','legacy_template')),
  is_editable BOOLEAN NOT NULL DEFAULT TRUE,
  is_brandable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pack_id, item_key)
);

CREATE TABLE IF NOT EXISTS tenant_library_pack_installs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pack_id UUID NOT NULL REFERENCES library_packs(id) ON DELETE CASCADE,
  installed_version INTEGER NOT NULL CHECK (installed_version > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','uninstalled')),
  installed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, pack_id)
);

CREATE TABLE IF NOT EXISTS asset_provenance_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider VARCHAR(80) NOT NULL,
  provider_asset_id VARCHAR(255) NOT NULL,
  provider_page_url TEXT,
  source_file_url TEXT,
  creator_name TEXT,
  creator_url TEXT,
  license_identifier VARCHAR(120) NOT NULL,
  license_url TEXT,
  commercial_use_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  derivatives_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  attribution_required BOOLEAN NOT NULL DEFAULT TRUE,
  attribution_text TEXT,
  downloaded_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  original_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  usage_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider, provider_asset_id)
);

CREATE TABLE IF NOT EXISTS marketing_library_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES library_packs(id) ON DELETE SET NULL,
  pack_item_id UUID REFERENCES library_pack_items(id) ON DELETE SET NULL,
  provenance_id UUID REFERENCES asset_provenance_ledger(id) ON DELETE SET NULL,
  studio_asset_id UUID REFERENCES studio_assets(id) ON DELETE SET NULL,
  content_id UUID REFERENCES content_items(id) ON DELETE SET NULL,
  item_key VARCHAR(255) NOT NULL,
  kind VARCHAR(60) NOT NULL CHECK (kind IN (
    'copy_template','social_post_template','social_ad_template','image_ad_layout',
    'carousel_layout','story_layout','reel_layout','promotional_graphic_layout',
    'website_banner_layout','email_template','landing_page_template','article_template',
    'offer_template','retargeting_template','video_recipe','campaign_pack',
    'stock_photo_reference','stock_video_reference','uploaded_asset','generated_asset','brand_asset'
  )),
  category VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  channel VARCHAR(60),
  aspect_ratio VARCHAR(30),
  dimensions VARCHAR(40),
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_kind VARCHAR(40) NOT NULL,
  approval_status VARCHAR(40) NOT NULL DEFAULT 'pending_owner_review'
    CHECK (approval_status IN ('draft','pending_owner_review','approved','rejected','archived')),
  is_editable BOOLEAN NOT NULL DEFAULT TRUE,
  is_brandable BOOLEAN NOT NULL DEFAULT TRUE,
  is_favourite BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  performance_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_marketing_library_tenant_kind
  ON marketing_library_items (organization_id, kind, approval_status, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_library_tenant_pack
  ON marketing_library_items (organization_id, pack_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS library_usage_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  library_item_id UUID NOT NULL REFERENCES marketing_library_items(id) ON DELETE CASCADE,
  campaign_plan_id UUID REFERENCES campaign_plans(id) ON DELETE SET NULL,
  campaign_asset_run_id UUID REFERENCES campaign_asset_runs(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('selected','used','approved','rejected','result')),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_search_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider VARCHAR(80) NOT NULL,
  cache_key CHAR(64) NOT NULL,
  response JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, cache_key)
);

CREATE TABLE IF NOT EXISTS brand_bootstrap_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  website_url TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','pending_owner_review','accepted','rejected','failed')),
  business_brain JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_dna JSONB NOT NULL DEFAULT '{}'::jsonb,
  stock_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposed_pack_id UUID REFERENCES library_packs(id) ON DELETE SET NULL,
  starter_calendar JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS brand_bootstrap_facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bootstrap_run_id UUID NOT NULL REFERENCES brand_bootstrap_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  fact_key VARCHAR(160) NOT NULL,
  value JSONB NOT NULL,
  fact_state VARCHAR(40) NOT NULL CHECK (fact_state IN (
    'VERIFIED_FIRST_PARTY','OWNER_SUPPLIED','INFERRED','UNVERIFIED','DISALLOWED'
  )),
  source_url TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brand_bootstrap_facts_tenant
  ON brand_bootstrap_facts (organization_id, bootstrap_run_id, fact_state);
