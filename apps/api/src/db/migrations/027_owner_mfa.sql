-- Additive owner MFA evidence. Existing team-capable and historical data is preserved.
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_recovery_codes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_last_counter BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enrolled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_updated_at TIMESTAMPTZ;

