UPDATE integration_providers
SET config_schema = '{"fields":["url","method","metric_map"]}'::jsonb,
    updated_at = NOW()
WHERE slug = 'generic-analytics';
