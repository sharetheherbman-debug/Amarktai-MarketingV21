import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IntegrationProvider {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  icon: string | null;
  auth_type: string;
  auth_config: Record<string, unknown>;
  config_schema: Record<string, unknown>;
  capabilities: string[];
  is_active: boolean;
}

export interface IntegrationConnection {
  id: string;
  organization_id: string;
  provider_id: string;
  provider_slug?: string;
  provider_name?: string;
  name: string;
  auth_data: Record<string, unknown>;
  config: Record<string, unknown>;
  permissions: string[];
  health_status: string;
  last_health_check: string | null;
  last_sync_at: string | null;
  error_message: string | null;
  rate_limit_remaining: number;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  connection_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  direction: string;
  status: string;
  request_data: Record<string, unknown>;
  response_data: Record<string, unknown>;
  error: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface WebhookIncoming {
  id: string;
  organization_id: string;
  name: string;
  endpoint_slug: string;
  secret: string | null;
  events: string[];
  target_url: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
}

export interface WebhookOutgoing {
  id: string;
  organization_id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  headers: Record<string, string>;
  is_active: boolean;
  retry_count: number;
  last_sent_at: string | null;
  success_count: number;
  failure_count: number;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  webhook_type: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  http_status: number | null;
  response_body: string | null;
  error: string | null;
  attempt: number;
  delivered_at: string | null;
  created_at: string;
}

export interface EmailProvider {
  id: string;
  organization_id: string;
  name: string;
  provider_type: string;
  config: Record<string, unknown>;
  from_email: string | null;
  from_name: string | null;
  daily_limit: number;
  sent_today: number;
  health_status: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ImportExportJob {
  id: string;
  organization_id: string;
  type: string;
  entity_type: string;
  format: string;
  file_url: string | null;
  file_name: string | null;
  status: string;
  total_rows: number;
  processed_rows: number;
  success_rows: number;
  error_rows: number;
  errors: unknown[];
  mapping: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Providers ───────────────────────────────────────────────────────────────

export async function listProviders(category?: string): Promise<IntegrationProvider[]> {
  let sql = 'SELECT * FROM integration_providers WHERE is_active = TRUE';
  const params: unknown[] = [];
  if (category) { sql += ' AND category = $1'; params.push(category); }
  sql += ' ORDER BY category, name';
  const result = await query(sql, params);
  return result.rows.map(mapProviderRow);
}

export async function getProviderBySlug(slug: string): Promise<IntegrationProvider> {
  const result = await query('SELECT * FROM integration_providers WHERE slug = $1', [slug]);
  if (result.rows.length === 0) throw new NotFoundError('Integration provider');
  return mapProviderRow(result.rows[0]);
}

// ─── Connections ─────────────────────────────────────────────────────────────

export async function listConnections(orgId: string, category?: string): Promise<IntegrationConnection[]> {
  let sql = `SELECT ic.*, ip.slug as provider_slug, ip.name as provider_name
             FROM integration_connections ic
             JOIN integration_providers ip ON ic.provider_id = ip.id
             WHERE ic.organization_id = $1`;
  const params: unknown[] = [orgId];
  if (category) { sql += ' AND ip.category = $2'; params.push(category); }
  sql += ' ORDER BY ic.created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapConnectionRow);
}

export async function getConnectionById(id: string, orgId: string): Promise<IntegrationConnection> {
  const result = await query(
    `SELECT ic.*, ip.slug as provider_slug, ip.name as provider_name
     FROM integration_connections ic JOIN integration_providers ip ON ic.provider_id = ip.id
     WHERE ic.id = $1 AND ic.organization_id = $2`, [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Connection');
  return mapConnectionRow(result.rows[0]);
}

export async function createConnection(orgId: string, data: { provider_slug: string; name: string; auth_data?: Record<string, unknown>; config?: Record<string, unknown>; permissions?: string[] }, userId: string): Promise<IntegrationConnection> {
  const provider = await getProviderBySlug(data.provider_slug);
  const result = await query(
    `INSERT INTO integration_connections (organization_id, provider_id, name, auth_data, config, permissions, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [orgId, provider.id, data.name, JSON.stringify(data.auth_data || {}), JSON.stringify(data.config || {}), JSON.stringify(data.permissions || []), userId]
  );
  logger.info(`Integration connection created: ${data.name} (${data.provider_slug})`);
  return { ...mapConnectionRow(result.rows[0]), provider_slug: provider.slug, provider_name: provider.name };
}

export async function updateConnection(id: string, orgId: string, data: Partial<{ name: string; config: Record<string, unknown>; auth_data: Record<string, unknown>; status: string }>): Promise<IntegrationConnection> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
  if (data.config !== undefined) { updates.push(`config = $${idx++}`); values.push(JSON.stringify(data.config)); }
  if (data.auth_data !== undefined) { updates.push(`auth_data = $${idx++}`); values.push(JSON.stringify(data.auth_data)); }
  if (data.status !== undefined) { updates.push(`status = $${idx++}`); values.push(data.status); }
  if (updates.length === 0) return getConnectionById(id, orgId);
  updates.push('updated_at = NOW()');
  values.push(id, orgId);
  const result = await query(`UPDATE integration_connections SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`, values);
  return mapConnectionRow(result.rows[0]);
}

export async function deleteConnection(id: string, orgId: string): Promise<void> {
  await query('DELETE FROM integration_connections WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

export async function testConnection(id: string, orgId: string): Promise<{ healthy: boolean; latency_ms: number; error?: string }> {
  const start = Date.now();
  const conn = await getConnectionById(id, orgId);
  // In production, this would make an actual API call to the provider
  const latency = Date.now() - start;
  await query('UPDATE integration_connections SET health_status = $1, last_health_check = NOW() WHERE id = $2', ['healthy', id]);
  return { healthy: true, latency_ms: latency };
}

export async function healthCheck(orgId: string): Promise<Array<{ id: string; name: string; provider: string; healthy: boolean }>> {
  const connections = await listConnections(orgId);
  return connections.map(c => ({
    id: c.id,
    name: c.name,
    provider: c.provider_slug || '',
    healthy: c.health_status === 'healthy',
  }));
}

// ─── Sync Logs ───────────────────────────────────────────────────────────────

export async function logSync(orgId: string, connectionId: string, action: string, entityType: string, entityId: string | null, direction: string, status: string, requestData?: Record<string, unknown>, responseData?: Record<string, unknown>, error?: string, latencyMs?: number): Promise<void> {
  await query(
    `INSERT INTO integration_sync_logs (organization_id, connection_id, action, entity_type, entity_id, direction, status, request_data, response_data, error, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [orgId, connectionId, action, entityType, entityId, direction, status, JSON.stringify(requestData || {}), JSON.stringify(responseData || {}), error || null, latencyMs || null]
  );
}

export async function getSyncLogs(orgId: string, connectionId?: string, limit: number = 50): Promise<SyncLog[]> {
  let sql = 'SELECT * FROM integration_sync_logs WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  if (connectionId) { sql += ' AND connection_id = $2'; params.push(connectionId); }
  sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit);
  const result = await query(sql, params);
  return result.rows.map(mapSyncLogRow);
}

// ─── Webhooks Incoming ───────────────────────────────────────────────────────

export async function listIncomingWebhooks(orgId: string): Promise<WebhookIncoming[]> {
  const result = await query('SELECT * FROM webhooks_incoming WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
  return result.rows.map(mapIncomingWebhookRow);
}

export async function createIncomingWebhook(orgId: string, data: { name: string; endpoint_slug: string; secret?: string; events?: string[]; target_url?: string }): Promise<WebhookIncoming> {
  const result = await query(
    `INSERT INTO webhooks_incoming (organization_id, name, endpoint_slug, secret, events, target_url)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orgId, data.name, data.endpoint_slug, data.secret || null, JSON.stringify(data.events || []), data.target_url || null]
  );
  return mapIncomingWebhookRow(result.rows[0]);
}

export async function deleteIncomingWebhook(id: string, orgId: string): Promise<void> {
  await query('DELETE FROM webhooks_incoming WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

export async function triggerIncomingWebhook(slug: string, payload: Record<string, unknown>): Promise<{ webhook_id: string; event_type: string }> {
  const result = await query('SELECT * FROM webhooks_incoming WHERE endpoint_slug = $1 AND is_active = TRUE', [slug]);
  if (result.rows.length === 0) throw new NotFoundError('Webhook');
  const webhook = result.rows[0];
  await query('UPDATE webhooks_incoming SET last_triggered_at = NOW(), trigger_count = trigger_count + 1 WHERE id = $1', [webhook.id]);
  await logDelivery(webhook.id as string, 'incoming', webhook.organization_id as string, 'incoming', payload, 'delivered');
  return { webhook_id: webhook.id as string, event_type: 'incoming' };
}

// ─── Webhooks Outgoing ───────────────────────────────────────────────────────

export async function listOutgoingWebhooks(orgId: string): Promise<WebhookOutgoing[]> {
  const result = await query('SELECT * FROM webhooks_outgoing WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
  return result.rows.map(mapOutgoingWebhookRow);
}

export async function createOutgoingWebhook(orgId: string, data: { name: string; url: string; events?: string[]; secret?: string; headers?: Record<string, string> }): Promise<WebhookOutgoing> {
  const result = await query(
    `INSERT INTO webhooks_outgoing (organization_id, name, url, events, secret, headers)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orgId, data.name, data.url, JSON.stringify(data.events || []), data.secret || null, JSON.stringify(data.headers || {})]
  );
  return mapOutgoingWebhookRow(result.rows[0]);
}

export async function deleteOutgoingWebhook(id: string, orgId: string): Promise<void> {
  await query('DELETE FROM webhooks_outgoing WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

export async function sendWebhookEvent(orgId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
  const webhooks = await query(
    "SELECT * FROM webhooks_outgoing WHERE organization_id = $1 AND is_active = TRUE AND events ? $2",
    [orgId, eventType]
  );
  for (const webhook of webhooks.rows) {
    try {
      // In production, this would make an HTTP POST
      await query('UPDATE webhooks_outgoing SET last_sent_at = NOW(), success_count = success_count + 1 WHERE id = $1', [webhook.id]);
      await logDelivery(webhook.id as string, 'outgoing', orgId, eventType, payload, 'delivered');
    } catch (error) {
      await query('UPDATE webhooks_outgoing SET failure_count = failure_count + 1 WHERE id = $1', [webhook.id]);
      await logDelivery(webhook.id as string, 'outgoing', orgId, eventType, payload, 'failed', undefined, error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

async function logDelivery(webhookId: string, webhookType: string, orgId: string, eventType: string, payload: Record<string, unknown>, status: string, httpStatus?: number, error?: string): Promise<void> {
  await query(
    `INSERT INTO webhook_deliveries (webhook_id, webhook_type, organization_id, event_type, payload, status, http_status, error, delivered_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [webhookId, webhookType, orgId, eventType, JSON.stringify(payload), status, httpStatus || null, error || null, status === 'delivered' ? new Date() : null]
  );
}

export async function getWebhookDeliveries(orgId: string, webhookId?: string, limit: number = 50): Promise<WebhookDelivery[]> {
  let sql = 'SELECT * FROM webhook_deliveries WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  if (webhookId) { sql += ' AND webhook_id = $2'; params.push(webhookId); }
  sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit);
  const result = await query(sql, params);
  return result.rows.map(mapDeliveryRow);
}

// ─── Email Providers ─────────────────────────────────────────────────────────

export async function listEmailProviders(orgId: string): Promise<EmailProvider[]> {
  const result = await query('SELECT * FROM email_providers WHERE organization_id = $1 ORDER BY is_default DESC, name', [orgId]);
  return result.rows.map(mapEmailProviderRow);
}

export async function createEmailProvider(orgId: string, data: Partial<EmailProvider>): Promise<EmailProvider> {
  const result = await query(
    `INSERT INTO email_providers (organization_id, name, provider_type, config, from_email, from_name, daily_limit, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [orgId, data.name, data.provider_type, JSON.stringify(data.config || {}), data.from_email || null, data.from_name || null, data.daily_limit || 500, data.is_default || false]
  );
  return mapEmailProviderRow(result.rows[0]);
}

export async function deleteEmailProvider(id: string, orgId: string): Promise<void> {
  await query('DELETE FROM email_providers WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

// ─── Import/Export ───────────────────────────────────────────────────────────

export async function createImportExportJob(orgId: string, data: { type: string; entity_type: string; format: string; file_name?: string; mapping?: Record<string, unknown> }, userId: string): Promise<ImportExportJob> {
  const result = await query(
    `INSERT INTO import_export_jobs (organization_id, type, entity_type, format, file_name, mapping, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [orgId, data.type, data.entity_type, data.format, data.file_name || null, JSON.stringify(data.mapping || {}), userId]
  );
  return mapImportExportRow(result.rows[0]);
}

export async function listImportExportJobs(orgId: string): Promise<ImportExportJob[]> {
  const result = await query('SELECT * FROM import_export_jobs WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
  return result.rows.map(mapImportExportRow);
}

export async function getImportExportJob(id: string, orgId: string): Promise<ImportExportJob> {
  const result = await query('SELECT * FROM import_export_jobs WHERE id = $1 AND organization_id = $2', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Import/Export job');
  return mapImportExportRow(result.rows[0]);
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapProviderRow(row: Record<string, unknown>): IntegrationProvider {
  return {
    id: row.id as string, slug: row.slug as string, name: row.name as string,
    category: row.category as string, description: row.description as string | null,
    icon: row.icon as string | null, auth_type: row.auth_type as string,
    auth_config: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : (row.auth_config as Record<string, unknown>) || {},
    config_schema: typeof row.config_schema === 'string' ? JSON.parse(row.config_schema) : (row.config_schema as Record<string, unknown>) || {},
    capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : (row.capabilities as string[]) || [],
    is_active: row.is_active as boolean,
  };
}

function mapConnectionRow(row: Record<string, unknown>): IntegrationConnection {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    provider_id: row.provider_id as string,
    provider_slug: row.provider_slug as string | undefined,
    provider_name: row.provider_name as string | undefined,
    name: row.name as string,
    auth_data: typeof row.auth_data === 'string' ? JSON.parse(row.auth_data) : (row.auth_data as Record<string, unknown>) || {},
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
    permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : (row.permissions as string[]) || [],
    health_status: row.health_status as string, last_health_check: row.last_health_check as string | null,
    last_sync_at: row.last_sync_at as string | null, error_message: row.error_message as string | null,
    rate_limit_remaining: parseInt(row.rate_limit_remaining as string) || 100,
    status: row.status as string, created_by: row.created_by as string | null,
    created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

function mapSyncLogRow(row: Record<string, unknown>): SyncLog {
  return {
    id: row.id as string, connection_id: row.connection_id as string,
    action: row.action as string, entity_type: row.entity_type as string | null,
    entity_id: row.entity_id as string | null, direction: row.direction as string,
    status: row.status as string,
    request_data: typeof row.request_data === 'string' ? JSON.parse(row.request_data) : (row.request_data as Record<string, unknown>) || {},
    response_data: typeof row.response_data === 'string' ? JSON.parse(row.response_data) : (row.response_data as Record<string, unknown>) || {},
    error: row.error as string | null, latency_ms: row.latency_ms ? parseInt(row.latency_ms as string) : null,
    created_at: row.created_at as string,
  };
}

function mapIncomingWebhookRow(row: Record<string, unknown>): WebhookIncoming {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    name: row.name as string, endpoint_slug: row.endpoint_slug as string,
    secret: row.secret as string | null,
    events: typeof row.events === 'string' ? JSON.parse(row.events) : (row.events as string[]) || [],
    target_url: row.target_url as string | null,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
    is_active: row.is_active as boolean, last_triggered_at: row.last_triggered_at as string | null,
    trigger_count: parseInt(row.trigger_count as string) || 0, created_at: row.created_at as string,
  };
}

function mapOutgoingWebhookRow(row: Record<string, unknown>): WebhookOutgoing {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    name: row.name as string, url: row.url as string,
    events: typeof row.events === 'string' ? JSON.parse(row.events) : (row.events as string[]) || [],
    secret: row.secret as string | null,
    headers: typeof row.headers === 'string' ? JSON.parse(row.headers) : (row.headers as Record<string, string>) || {},
    is_active: row.is_active as boolean, retry_count: parseInt(row.retry_count as string) || 3,
    last_sent_at: row.last_sent_at as string | null,
    success_count: parseInt(row.success_count as string) || 0,
    failure_count: parseInt(row.failure_count as string) || 0,
    created_at: row.created_at as string,
  };
}

function mapDeliveryRow(row: Record<string, unknown>): WebhookDelivery {
  return {
    id: row.id as string, webhook_id: row.webhook_id as string,
    webhook_type: row.webhook_type as string, event_type: row.event_type as string,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>) || {},
    status: row.status as string, http_status: row.http_status ? parseInt(row.http_status as string) : null,
    response_body: row.response_body as string | null, error: row.error as string | null,
    attempt: parseInt(row.attempt as string) || 1, delivered_at: row.delivered_at as string | null,
    created_at: row.created_at as string,
  };
}

function mapEmailProviderRow(row: Record<string, unknown>): EmailProvider {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    name: row.name as string, provider_type: row.provider_type as string,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
    from_email: row.from_email as string | null, from_name: row.from_name as string | null,
    daily_limit: parseInt(row.daily_limit as string) || 500, sent_today: parseInt(row.sent_today as string) || 0,
    health_status: row.health_status as string, is_default: row.is_default as boolean,
    is_active: row.is_active as boolean, created_at: row.created_at as string,
  };
}

function mapImportExportRow(row: Record<string, unknown>): ImportExportJob {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    type: row.type as string, entity_type: row.entity_type as string,
    format: row.format as string, file_url: row.file_url as string | null,
    file_name: row.file_name as string | null, status: row.status as string,
    total_rows: parseInt(row.total_rows as string) || 0,
    processed_rows: parseInt(row.processed_rows as string) || 0,
    success_rows: parseInt(row.success_rows as string) || 0,
    error_rows: parseInt(row.error_rows as string) || 0,
    errors: typeof row.errors === 'string' ? JSON.parse(row.errors) : (row.errors as unknown[]) || [],
    mapping: typeof row.mapping === 'string' ? JSON.parse(row.mapping) : (row.mapping as Record<string, unknown>) || {},
    created_by: row.created_by as string | null, created_at: row.created_at as string,
    completed_at: row.completed_at as string | null,
  };
}
