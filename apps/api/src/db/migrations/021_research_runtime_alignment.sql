DO $$
BEGIN
  IF to_regclass('public.trend_monitors') IS NULL
     AND to_regclass('public.trend_monitoring') IS NOT NULL THEN
    ALTER TABLE trend_monitoring RENAME TO trend_monitors;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trend_monitors_org_active
ON trend_monitors (organization_id, is_active, last_checked_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trend_items_monitor_url
ON trend_items (monitor_id, url)
WHERE url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_competitors_active_check
ON competitors (status, last_checked_at)
WHERE deleted_at IS NULL;
