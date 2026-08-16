-- System placeholder organization required by migration 006 default CRM stages.
-- It is soft-deleted and marked as a system record so it does not behave as a customer tenant.
INSERT INTO organizations (
    id,
    name,
    slug,
    settings,
    plan,
    status,
    deleted_at
)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'AmarktAI System Defaults',
    'amarktai-system-defaults',
    '{"system":true,"purpose":"global CRM defaults"}'::jsonb,
    'system',
    'system',
    NOW()
)
ON CONFLICT (id) DO NOTHING;
