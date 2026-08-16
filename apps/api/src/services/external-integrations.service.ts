import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import {
  openSecrets,
  sealSecrets,
  syncAdvertising,
  syncExternalAnalytics,
  testExternalConnection,
} from './external-platform.service';

interface ConnectionRow extends Record<string, unknown> {
  id: string;
  organization_id: string;
  provider_id: string;
  provider_slug: string;
  provider_name: string;
  provider_category: string;
  name: string;
  auth_data: Record<string, unknown> | string;
  config: Record<string, unknown> | string;
  health_status: string;
  last_health_check: string | null;
  last_sync_at: string | null;
  error_message: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function normalizedConfig(providerSlug: string, value: unknown): Record<string, unknown> {
  const config = { ...objectValue(value) };
  if (providerSlug === 'google-ads' && !config.api_version) config.api_version = 'v25';
  if (providerSlug === 'meta-ads' && !config.api_version) {
    throw new AppError(400, 'Meta Ads api_version is required because Meta versions are time-limited', 'INTEGRATION_CONFIG_ERROR');
  }
  return config;
}

function mapConnection(row: ConnectionRow): Record<string, unknown> {
  return {
    id: row.id,
    organization_id: row.organization_id,
    provider_id: row.provider_id,
    provider_slug: row.provider_slug,
    provider_name: row.provider_name,
    provider_category: row.provider_category,
    name: row.name,
    config: objectValue(row.config),
    health_status: row.health_status,
    last_health_check: row.last_health_check,
    last_sync_at: row.last_sync_at,
    error_message: row.error_message,
    status: row.status,
    has_credentials: Object.keys(openSecrets(objectValue(row.auth_data))).length > 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getProvider(slug: string): Promise<Record<string, unknown>> {
  const result = await query('SELECT * FROM integration_providers WHERE slug = $1 AND is_active = TRUE', [slug]);
  if (result.rows.length === 0) throw new NotFoundError('Integration provider');
  return result.rows[0];
}

async function getConnectionRow(id: string, orgId: string): Promise<ConnectionRow> {
  const result = await query(
    `SELECT ic.*, ip.slug AS provider_slug, ip.name AS provider_name, ip.category AS provider_category
     FROM integration_connections ic
     JOIN integration_providers ip ON ip.id = ic.provider_id
     WHERE ic.id = $1 AND ic.organization_id = $2`,
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Integration connection');
  return result.rows[0] as ConnectionRow;
}

export async function listProviders(category?: string): Promise<Record<string, unknown>[]> {
  const params: unknown[] = [];
  let sql = 'SELECT * FROM integration_providers WHERE is_active = TRUE';
  if (category) { sql += ' AND category = $1'; params.push(category); }
  sql += ' ORDER BY category, name';
  const result = await query(sql, params);
  return result.rows;
}

export async function listConnections(orgId: string, category?: string): Promise<Record<string, unknown>[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT ic.*, ip.slug AS provider_slug, ip.name AS provider_name, ip.category AS provider_category
             FROM integration_connections ic
             JOIN integration_providers ip ON ip.id = ic.provider_id
             WHERE ic.organization_id = $1`;
  if (category) { sql += ' AND ip.category = $2'; params.push(category); }
  sql += ' ORDER BY ic.created_at DESC';
  const result = await query(sql, params);
  return result.rows.map((row) => mapConnection(row as ConnectionRow));
}

export async function getConnection(id: string, orgId: string): Promise<Record<string, unknown>> {
  return mapConnection(await getConnectionRow(id, orgId));
}

export async function createConnection(
  orgId: string,
  data: { provider_slug: string; name: string; credentials?: Record<string, unknown>; config?: Record<string, unknown>; permissions?: string[] },
  userId: string
): Promise<Record<string, unknown>> {
  const provider = await getProvider(data.provider_slug);
  const credentials = data.credentials || {};
  if (Object.keys(credentials).length === 0) {
    throw new AppError(400, 'Provider credentials are required', 'INTEGRATION_CREDENTIALS_REQUIRED');
  }
  const config = normalizedConfig(data.provider_slug, data.config || {});
  const result = await query(
    `INSERT INTO integration_connections
       (organization_id, provider_id, name, auth_data, config, permissions, health_status, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'unknown', 'active', $7)
     RETURNING id`,
    [
      orgId,
      provider.id,
      data.name,
      JSON.stringify(sealSecrets(credentials)),
      JSON.stringify(config),
      JSON.stringify(data.permissions || []),
      userId,
    ]
  );
  return getConnection(String(result.rows[0].id), orgId);
}

export async function updateConnection(
  id: string,
  orgId: string,
  data: { name?: string; credentials?: Record<string, unknown>; config?: Record<string, unknown>; status?: string }
): Promise<Record<string, unknown>> {
  const existing = await getConnectionRow(id, orgId);
  const currentConfig = objectValue(existing.config);
  const nextConfig = normalizedConfig(existing.provider_slug, { ...currentConfig, ...(data.config || {}) });
  const currentSecrets = openSecrets(objectValue(existing.auth_data));
  const nextSecrets = data.credentials && Object.keys(data.credentials).length > 0
    ? { ...currentSecrets, ...data.credentials }
    : currentSecrets;
  await query(
    `UPDATE integration_connections
     SET name = COALESCE($1, name), auth_data = $2, config = $3,
         status = COALESCE($4, status), health_status = 'unknown', error_message = NULL, updated_at = NOW()
     WHERE id = $5 AND organization_id = $6`,
    [
      data.name || null,
      JSON.stringify(sealSecrets(nextSecrets)),
      JSON.stringify(nextConfig),
      data.status || null,
      id,
      orgId,
    ]
  );
  return getConnection(id, orgId);
}

export async function deleteConnection(id: string, orgId: string): Promise<void> {
  const result = await query('DELETE FROM integration_connections WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Integration connection');
}

export async function testConnection(id: string, orgId: string): Promise<{ healthy: boolean; latency_ms: number; response: Record<string, unknown> }> {
  const connection = await getConnectionRow(id, orgId);
  const credentials = openSecrets(objectValue(connection.auth_data));
  const config = normalizedConfig(connection.provider_slug, connection.config);
  const started = Date.now();
  try {
    const response = await testExternalConnection(connection.provider_slug, credentials, config);
    const latency = Date.now() - started;
    await query(
      `UPDATE integration_connections
       SET health_status = 'healthy', last_health_check = NOW(), error_message = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
    return { healthy: true, latency_ms: latency, response };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection test failed';
    await query(
      `UPDATE integration_connections
       SET health_status = 'unhealthy', last_health_check = NOW(), error_message = $1, updated_at = NOW()
       WHERE id = $2`,
      [message, id]
    );
    throw error;
  }
}

export async function syncAnalyticsConnection(
  id: string,
  orgId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, unknown>> {
  const connection = await getConnectionRow(id, orgId);
  if (connection.provider_category !== 'analytics') {
    throw new AppError(400, 'Connection is not an analytics provider', 'INVALID_PROVIDER_CATEGORY');
  }
  const sync = await syncExternalAnalytics(
    connection.provider_slug,
    openSecrets(objectValue(connection.auth_data)),
    normalizedConfig(connection.provider_slug, connection.config),
    startDate,
    endDate
  );
  const result = await query(
    `INSERT INTO external_metric_snapshots
       (organization_id, connection_id, provider_slug, metric_scope, period_start, period_end, metrics, dimensions, raw_response)
     VALUES ($1, $2, $3, 'analytics', $4, $5, $6, $7, $8)
     RETURNING *`,
    [orgId, id, connection.provider_slug, startDate, endDate, JSON.stringify(sync.metrics), JSON.stringify(sync.dimensions), JSON.stringify(sync.raw)]
  );
  await query("UPDATE integration_connections SET health_status = 'healthy', last_sync_at = NOW(), error_message = NULL, updated_at = NOW() WHERE id = $1", [id]);
  return result.rows[0];
}

export async function listAnalyticsSummary(orgId: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT DISTINCT ON (connection_id)
       ems.*, ic.name AS connection_name, ip.name AS provider_name
     FROM external_metric_snapshots ems
     JOIN integration_connections ic ON ic.id = ems.connection_id
     JOIN integration_providers ip ON ip.id = ic.provider_id
     WHERE ems.organization_id = $1 AND ems.metric_scope = 'analytics'
     ORDER BY connection_id, collected_at DESC`,
    [orgId]
  );
  const totals: Record<string, number> = {};
  for (const row of result.rows) {
    const metrics = objectValue(row.metrics);
    for (const [key, value] of Object.entries(metrics)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) totals[key] = (totals[key] || 0) + numeric;
    }
  }
  return { totals, sources: result.rows };
}

export async function syncAdvertisingConnection(
  id: string,
  orgId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, unknown>> {
  const connection = await getConnectionRow(id, orgId);
  if (connection.provider_category !== 'advertising') {
    throw new AppError(400, 'Connection is not an advertising provider', 'INVALID_PROVIDER_CATEGORY');
  }
  const sync = await syncAdvertising(
    connection.provider_slug,
    openSecrets(objectValue(connection.auth_data)),
    normalizedConfig(connection.provider_slug, connection.config),
    startDate,
    endDate
  );

  for (const campaign of sync.campaigns) {
    await query(
      `INSERT INTO advertising_campaigns
         (organization_id, connection_id, external_id, provider_slug, name, status, objective,
          daily_budget_cents, lifetime_budget_cents, currency, metrics, raw_data, last_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (organization_id, connection_id, external_id)
       DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, objective = EXCLUDED.objective,
         daily_budget_cents = EXCLUDED.daily_budget_cents,
         lifetime_budget_cents = EXCLUDED.lifetime_budget_cents,
         currency = EXCLUDED.currency, metrics = EXCLUDED.metrics, raw_data = EXCLUDED.raw_data,
         last_synced_at = NOW(), updated_at = NOW()`,
      [
        orgId, id, campaign.externalId, connection.provider_slug, campaign.name, campaign.status,
        campaign.objective || null, campaign.dailyBudgetCents || 0, campaign.lifetimeBudgetCents || 0,
        campaign.currency || 'USD', JSON.stringify(campaign.metrics), JSON.stringify(campaign.raw),
      ]
    );
  }

  await query(
    `INSERT INTO external_metric_snapshots
       (organization_id, connection_id, provider_slug, metric_scope, period_start, period_end, metrics, raw_response)
     VALUES ($1, $2, $3, 'advertising', $4, $5, $6, $7)`,
    [orgId, id, connection.provider_slug, startDate, endDate, JSON.stringify(sync.accountMetrics), JSON.stringify(sync.raw)]
  );
  await query("UPDATE integration_connections SET health_status = 'healthy', last_sync_at = NOW(), error_message = NULL, updated_at = NOW() WHERE id = $1", [id]);
  return { campaigns_synced: sync.campaigns.length, metrics: sync.accountMetrics };
}

export async function listAdvertisingCampaigns(orgId: string): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT ac.*, ic.name AS connection_name, ip.name AS provider_name
     FROM advertising_campaigns ac
     JOIN integration_connections ic ON ic.id = ac.connection_id
     JOIN integration_providers ip ON ip.id = ic.provider_id
     WHERE ac.organization_id = $1
     ORDER BY ac.last_synced_at DESC, ac.name ASC`,
    [orgId]
  );
  return result.rows;
}
