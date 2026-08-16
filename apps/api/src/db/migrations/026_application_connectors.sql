-- Phase 1: secure host-application connectors, one-use SSO and consent-safe events.
--
-- Connector plaintext keys never enter PostgreSQL. Each key is peppered and
-- SHA-256 hashed by the API before storage. Requests additionally carry a
-- timestamp, nonce and HMAC signature to prevent tampering and replay.

CREATE TABLE IF NOT EXISTS application_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  base_url TEXT NOT NULL,
  key_hash CHAR(64) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  default_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_connector_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id VARCHAR(100) NOT NULL REFERENCES application_connectors(application_id) ON DELETE CASCADE,
  nonce VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_application_connector_nonces_expiry
ON application_connector_nonces (expires_at);

CREATE TABLE IF NOT EXISTS application_identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id VARCHAR(100) NOT NULL REFERENCES application_connectors(application_id) ON DELETE CASCADE,
  external_user_id VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_email TEXT NOT NULL,
  external_role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, external_user_id),
  UNIQUE (application_id, user_id)
);

CREATE TABLE IF NOT EXISTS application_sso_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id VARCHAR(100) NOT NULL REFERENCES application_connectors(application_id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL UNIQUE,
  external_user_id VARCHAR(255) NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  external_role VARCHAR(50) NOT NULL,
  target_path TEXT NOT NULL DEFAULT '/dashboard',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_sso_codes_expiry
ON application_sso_codes (expires_at)
WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS application_conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id VARCHAR(100) NOT NULL REFERENCES application_connectors(application_id) ON DELETE CASCADE,
  event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
  external_user_id VARCHAR(255),
  external_organization_id VARCHAR(255),
  value_pence BIGINT CHECK (value_pence IS NULL OR value_pence >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'GBP' CHECK (currency = 'GBP'),
  consent_basis VARCHAR(50) NOT NULL
    CHECK (consent_basis IN ('contract', 'consent', 'legitimate_interest', 'anonymous_aggregate')),
  properties JSONB NOT NULL DEFAULT '{}',
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (application_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_application_conversion_events_type_time
ON application_conversion_events (application_id, event_type, occurred_at DESC);
