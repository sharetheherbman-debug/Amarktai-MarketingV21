-- Complete the organic social connector lifecycle without rewriting prior history.
-- Provider submission IDs are retained separately from final provider post IDs so
-- asynchronous networks such as TikTok can be polled safely after moderation.

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS provider_submission_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_metrics_sync_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS metrics_sync_error TEXT;

CREATE INDEX IF NOT EXISTS idx_social_posts_metrics_due
ON social_posts (status,last_metrics_sync_at,published_at)
WHERE status='published' AND external_id IS NOT NULL;

ALTER TABLE social_connections
  ADD COLUMN IF NOT EXISTS provider_capability_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_capability_check_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS social_performance_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  social_post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  external_id VARCHAR(255),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL CHECK (status IN ('synced','unsupported','pending','failed')),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_performance_sync_events_post
ON social_performance_sync_events (social_post_id,created_at DESC);
