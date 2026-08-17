-- Forward-only repair for the runtime tool registry used by agents and marketplace installs.
-- The table was referenced by production code before it was introduced by a migration.

CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  handler_type VARCHAR(40) NOT NULL DEFAULT 'internal',
  handler_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE tools
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS handler_type VARCHAR(40) NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS handler_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_tools_global_name
ON tools (name)
WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_tools_organization_name
ON tools (organization_id, name)
WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tools_active_catalogue
ON tools (organization_id, category, name)
WHERE is_active = TRUE;
