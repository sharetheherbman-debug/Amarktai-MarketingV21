-- Short-lived, tenant-bound OAuth handshakes for owner-managed social accounts.
-- Provider tokens and PKCE verifiers are stored only in the existing encrypted
-- envelope format. Public account choices never contain credentials.
CREATE TABLE IF NOT EXISTS social_oauth_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  state_hash VARCHAR(64) NOT NULL UNIQUE,
  secret_envelope JSONB NOT NULL DEFAULT '{}'::jsonb,
  accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'authorizing',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_oauth_sessions_tenant
  ON social_oauth_sessions (organization_id, user_id, status, expires_at);
