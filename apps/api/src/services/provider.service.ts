import { query } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { AIProvider, ProviderConfig, ProviderHealth, ProviderType } from '../types';
import { logger } from '../utils/logger';
import { providerRouter } from '../providers/provider-router';

function normalizeProviderType(value: string): Extract<ProviderType, 'genx' | 'together' | 'deepinfra'> {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.includes('genx')) return 'genx';
  if (normalized.includes('together')) return 'together';
  if (normalized.includes('deepinfra')) return 'deepinfra';
  throw new AppError(400, `Unsupported AI provider: ${value}`, 'PROVIDER_TYPE_UNSUPPORTED');
}

function modelsUrl(type: string, baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, '');
  return type === 'genx'
    ? `${normalized.replace(/\/(?:api\/v1|v1)$/, '')}/v1/models`
    : `${normalized}/models`;
}

function sanitize(row: Record<string, unknown>): AIProvider {
  return { ...row, api_key_encrypted: '***' } as unknown as AIProvider;
}

export async function list(orgId?: string): Promise<AIProvider[]> {
  let sql = 'SELECT * FROM ai_providers';
  const params: unknown[] = [];
  if (orgId) {
    sql += ' WHERE organization_id = $1 OR organization_id IS NULL';
    params.push(orgId);
  }
  sql += ' ORDER BY priority DESC, created_at ASC';
  const result = await query(sql, params);
  return result.rows.map(sanitize);
}

export async function create(orgId: string | null, data: ProviderConfig): Promise<AIProvider> {
  const type = normalizeProviderType(data.name);
  try {
    const result = await query(
      `INSERT INTO ai_providers
         (organization_id,name,type,api_key_encrypted,base_url,models,enabled,priority,health_status)
       VALUES ($1,$2,$2,$3,$4,$5,$6,$7,'unknown') RETURNING *`,
      [
        orgId, type, JSON.stringify(encrypt(data.apiKey)), data.baseUrl.replace(/\/$/, ''),
        JSON.stringify(data.models || []), data.enabled, data.priority,
      ]
    );
    await providerRouter.loadProviders();
    logger.info(`AI provider created and loaded: ${type}`);
    return sanitize(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(409, `${type} provider already exists`, 'PROVIDER_EXISTS');
    }
    throw error;
  }
}

export async function update(providerId: string, data: Partial<ProviderConfig>): Promise<AIProvider> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let parameter = 1;
  if (data.name) {
    const type = normalizeProviderType(data.name);
    updates.push(`name=$${parameter++}`, `type=$${parameter++}`);
    values.push(type, type);
  }
  if (data.apiKey) {
    updates.push(`api_key_encrypted=$${parameter++}`, "health_status='unknown'");
    values.push(JSON.stringify(encrypt(data.apiKey)));
  }
  if (data.baseUrl) {
    updates.push(`base_url=$${parameter++}`, "health_status='unknown'");
    values.push(data.baseUrl.replace(/\/$/, ''));
  }
  if (data.models) {
    updates.push(`models=$${parameter++}`);
    values.push(JSON.stringify(data.models));
  }
  if (data.enabled !== undefined) {
    updates.push(`enabled=$${parameter++}`);
    values.push(data.enabled);
  }
  if (data.priority !== undefined) {
    updates.push(`priority=$${parameter++}`);
    values.push(data.priority);
  }
  if (updates.length === 0) {
    const existing = await query('SELECT * FROM ai_providers WHERE id=$1', [providerId]);
    if (existing.rows.length === 0) throw new NotFoundError('Provider');
    return sanitize(existing.rows[0]);
  }
  updates.push('updated_at=NOW()');
  values.push(providerId);
  const result = await query(
    `UPDATE ai_providers SET ${updates.join(',')} WHERE id=$${parameter} RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new NotFoundError('Provider');
  await providerRouter.loadProviders();
  logger.info(`AI provider updated and reloaded: ${providerId}`);
  return sanitize(result.rows[0]);
}

export async function remove(providerId: string): Promise<void> {
  const result = await query('DELETE FROM ai_providers WHERE id=$1 RETURNING id', [providerId]);
  if (result.rows.length === 0) throw new NotFoundError('Provider');
  await providerRouter.loadProviders();
  logger.info(`AI provider deleted and runtime reloaded: ${providerId}`);
}

export async function testConnection(providerId: string): Promise<ProviderHealth> {
  const result = await query('SELECT * FROM ai_providers WHERE id=$1', [providerId]);
  if (result.rows.length === 0) throw new NotFoundError('Provider');
  const provider = result.rows[0];
  const started = Date.now();
  try {
    const response = await fetch(modelsUrl(String(provider.type), String(provider.base_url)), {
      headers: { Authorization: `Bearer ${decrypt(JSON.parse(provider.api_key_encrypted))}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    const latency = Date.now() - started;
    const status = response.ok ? 'healthy' : 'degraded';
    await query('UPDATE ai_providers SET health_status=$1,last_health_check=NOW() WHERE id=$2', [status, providerId]);
    await providerRouter.loadProviders();
    return {
      name: String(provider.name), status, latency, lastCheck: new Date(),
      error: response.ok ? undefined : `HTTP ${response.status}: ${body.slice(0, 300)}`,
    };
  } catch (error) {
    const latency = Date.now() - started;
    await query("UPDATE ai_providers SET health_status='unhealthy',last_health_check=NOW() WHERE id=$1", [providerId]);
    await providerRouter.loadProviders();
    return {
      name: String(provider.name), status: 'unhealthy', latency, lastCheck: new Date(),
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

export async function toggle(providerId: string, enabled: boolean): Promise<AIProvider> {
  const result = await query(
    `UPDATE ai_providers SET enabled=$1,health_status=CASE WHEN $1 THEN 'unknown' ELSE health_status END,updated_at=NOW()
     WHERE id=$2 RETURNING *`,
    [enabled, providerId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Provider');
  await providerRouter.loadProviders();
  logger.info(`AI provider ${enabled ? 'enabled' : 'disabled'} and runtime reloaded: ${providerId}`);
  return sanitize(result.rows[0]);
}

export async function getModels(providerId: string): Promise<string[]> {
  const result = await query('SELECT models FROM ai_providers WHERE id=$1', [providerId]);
  if (result.rows.length === 0) throw new NotFoundError('Provider');
  const models = result.rows[0].models;
  if (typeof models === 'string') {
    try { return JSON.parse(models) as string[]; } catch { return []; }
  }
  return Array.isArray(models) ? models.map(String) : [];
}

export async function healthCheck(): Promise<ProviderHealth[]> {
  return providerRouter.getHealthStatus();
}
