ALTER TABLE integration_providers
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

UPDATE integration_providers
SET config_schema = '{"fields":["url","method","metric_map"]}'::jsonb,
    updated_at = NOW()
WHERE slug = 'generic-analytics';
