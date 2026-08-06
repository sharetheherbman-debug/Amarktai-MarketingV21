-- Provider credentials are platform-admin configuration and the runtime loads one
-- provider of each name/type globally. Keep the highest-priority, most recently
-- updated row when legacy/onboarding flows created duplicates.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(name)
           ORDER BY priority DESC, updated_at DESC, created_at DESC, id
         ) AS row_number
  FROM ai_providers
)
DELETE FROM ai_providers provider
USING ranked
WHERE provider.id = ranked.id
  AND ranked.row_number > 1;

UPDATE ai_providers SET name = LOWER(TRIM(name)), type = LOWER(TRIM(type));

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_providers_unique_name
ON ai_providers (name);

CREATE INDEX IF NOT EXISTS idx_ai_providers_enabled_priority
ON ai_providers (enabled, priority DESC);
