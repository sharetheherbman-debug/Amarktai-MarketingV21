-- Normalize organization membership timestamps with the rest of the core schema.
--
-- organization_members originally exposed only joined_at, while multiple
-- production services consistently use created_at when selecting the earliest
-- owner/admin membership. Preserve joined_at for compatibility and add the
-- canonical created_at audit timestamp without changing membership semantics.

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE;

UPDATE organization_members
SET created_at = COALESCE(created_at, joined_at, NOW())
WHERE created_at IS NULL;

ALTER TABLE organization_members
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_members_org_created_at
  ON organization_members (organization_id, created_at);
