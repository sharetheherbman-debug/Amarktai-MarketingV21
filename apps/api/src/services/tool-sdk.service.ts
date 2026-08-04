import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToolIntegration {
  id: string;
  organization_id: string;
  tool_id: string;
  name: string;
  auth_type: string;
  auth_config: Record<string, unknown>;
  config: Record<string, unknown>;
  permissions: string[];
  rate_limit: number;
  rate_window_seconds: number;
  health_status: string;
  last_health_check: string | null;
  retry_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ToolExecutionContext {
  organizationId: string;
  userId?: string;
  requestId?: string;
}

// ─── Integration Management ──────────────────────────────────────────────────

export async function listIntegrations(orgId: string): Promise<ToolIntegration[]> {
  const result = await query(
    'SELECT * FROM tool_integrations WHERE organization_id = $1 ORDER BY name ASC',
    [orgId]
  );
  return result.rows.map(mapRow);
}

export async function addIntegration(orgId: string, data: {
  tool_id: string;
  name: string;
  auth_type: string;
  auth_config?: Record<string, unknown>;
  config?: Record<string, unknown>;
  permissions?: string[];
  rate_limit?: number;
}): Promise<ToolIntegration> {
  const result = await query(
    `INSERT INTO tool_integrations (organization_id, tool_id, name, auth_type, auth_config, config, permissions, rate_limit)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      orgId, data.tool_id, data.name, data.auth_type,
      JSON.stringify(data.auth_config || {}), JSON.stringify(data.config || {}),
      JSON.stringify(data.permissions || []), data.rate_limit || 100,
    ]
  );
  logger.info(`Tool integration added: ${data.name}`);
  return mapRow(result.rows[0]);
}

export async function removeIntegration(id: string, orgId: string): Promise<void> {
  await query('DELETE FROM tool_integrations WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

// ─── Health Checks ───────────────────────────────────────────────────────────

export async function checkHealth(integrationId: string, orgId: string): Promise<{ healthy: boolean; latency_ms: number; error?: string }> {
  const start = Date.now();

  const result = await query(
    'SELECT * FROM tool_integrations WHERE id = $1 AND organization_id = $2',
    [integrationId, orgId]
  );

  if (result.rows.length === 0) {
    return { healthy: false, latency_ms: 0, error: 'Integration not found' };
  }

  const integration = result.rows[0];

  // In production, this would make an actual health check call
  // For now, simulate
  const healthy = true;
  const latency = Date.now() - start;

  await query(
    'UPDATE tool_integrations SET health_status = $1, last_health_check = NOW() WHERE id = $2',
    [healthy ? 'healthy' : 'unhealthy', integrationId]
  );

  return { healthy, latency_ms: latency };
}

export async function checkAllHealth(orgId: string): Promise<Array<{ id: string; name: string; healthy: boolean; latency_ms: number }>> {
  const integrations = await listIntegrations(orgId);
  const results = [];

  for (const integration of integrations) {
    const health = await checkHealth(integration.id, orgId);
    results.push({ id: integration.id, name: integration.name, ...health });
  }

  return results;
}

// ─── Execution with Retry ────────────────────────────────────────────────────

export async function executeWithRetry<T>(
  integrationId: string,
  orgId: string,
  fn: () => Promise<T>,
  context?: ToolExecutionContext
): Promise<T> {
  const result = await query(
    'SELECT retry_config FROM tool_integrations WHERE id = $1 AND organization_id = $2',
    [integrationId, orgId]
  );

  if (result.rows.length === 0) throw new AppError(404, 'Integration not found', 'NOT_FOUND');

  const retryConfig = typeof result.rows[0].retry_config === 'string'
    ? JSON.parse(result.rows[0].retry_config)
    : result.rows[0].retry_config || { max_retries: 3, backoff_ms: 1000 };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= (retryConfig.max_retries || 3); attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retryConfig.max_retries) {
        const delay = (retryConfig.backoff_ms || 1000) * Math.pow(2, attempt);
        logger.warn(`Tool execution attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError.message}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new AppError(500, 'Tool execution failed after retries', 'TOOL_ERROR');
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(integrationId: string, orgId: string): Promise<{ allowed: boolean; remaining: number; reset_at: number }> {
  const result = await query(
    'SELECT rate_limit, rate_window_seconds FROM tool_integrations WHERE id = $1 AND organization_id = $2',
    [integrationId, orgId]
  );

  if (result.rows.length === 0) return { allowed: true, remaining: 100, reset_at: 0 };

  const { rate_limit, rate_window_seconds } = result.rows[0];
  const key = `${orgId}:${integrationId}`;
  const now = Date.now();

  let entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + (rate_window_seconds || 60) * 1000 };
    rateLimitStore.set(key, entry);
  }

  entry.count++;
  const remaining = Math.max(0, (rate_limit || 100) - entry.count);

  return {
    allowed: entry.count <= (rate_limit || 100),
    remaining,
    reset_at: entry.resetAt,
  };
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): ToolIntegration {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    tool_id: row.tool_id as string,
    name: row.name as string,
    auth_type: row.auth_type as string,
    auth_config: typeof row.auth_config === 'string' ? JSON.parse(row.auth_config) : (row.auth_config as Record<string, unknown>) || {},
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
    permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : (row.permissions as string[]) || [],
    rate_limit: parseInt(row.rate_limit as string) || 100,
    rate_window_seconds: parseInt(row.rate_window_seconds as string) || 60,
    health_status: row.health_status as string,
    last_health_check: row.last_health_check as string | null,
    retry_config: typeof row.retry_config === 'string' ? JSON.parse(row.retry_config) : (row.retry_config as Record<string, unknown>) || {},
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
