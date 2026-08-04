import { query } from '../config/database';
import { encrypt, decrypt } from '../utils/encryption';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { AIProvider, ProviderConfig, ProviderHealth } from '../types';
import { logger } from '../utils/logger';

export async function list(orgId?: string): Promise<AIProvider[]> {
  let sql = 'SELECT * FROM ai_providers';
  const params: any[] = [];

  if (orgId) {
    sql += ' WHERE organization_id = $1 OR organization_id IS NULL';
    params.push(orgId);
  }

  sql += ' ORDER BY priority DESC, created_at ASC';

  const result = await query(sql, params);
  return result.rows.map((row: any) => ({
    ...row,
    api_key_encrypted: '***',
  }));
}

export async function create(orgId: string | null, data: ProviderConfig): Promise<AIProvider> {
  const encryptedKey = JSON.stringify(encrypt(data.apiKey));

  const result = await query(
    `INSERT INTO ai_providers (organization_id, name, type, api_key_encrypted, base_url, models, enabled, priority)
     VALUES ($1, $2, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      orgId,
      data.name,
      encryptedKey,
      data.baseUrl,
      JSON.stringify(data.models),
      data.enabled,
      data.priority,
    ]
  );

  logger.info(`AI provider created: ${data.name}`);
  return { ...result.rows[0], api_key_encrypted: '***' };
}

export async function update(providerId: string, data: Partial<ProviderConfig>): Promise<AIProvider> {
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.name) {
    updates.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.apiKey) {
    const encryptedKey = JSON.stringify(encrypt(data.apiKey));
    updates.push(`api_key_encrypted = $${paramCount++}`);
    values.push(encryptedKey);
  }
  if (data.baseUrl) {
    updates.push(`base_url = $${paramCount++}`);
    values.push(data.baseUrl);
  }
  if (data.models) {
    updates.push(`models = $${paramCount++}`);
    values.push(JSON.stringify(data.models));
  }
  if (data.enabled !== undefined) {
    updates.push(`enabled = $${paramCount++}`);
    values.push(data.enabled);
  }
  if (data.priority !== undefined) {
    updates.push(`priority = $${paramCount++}`);
    values.push(data.priority);
  }

  updates.push(`updated_at = NOW()`);
  values.push(providerId);

  const result = await query(
    `UPDATE ai_providers SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Provider');
  }

  logger.info(`AI provider updated: ${providerId}`);
  return { ...result.rows[0], api_key_encrypted: '***' };
}

export async function remove(providerId: string): Promise<void> {
  const result = await query('DELETE FROM ai_providers WHERE id = $1 RETURNING id', [providerId]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Provider');
  }
  logger.info(`AI provider deleted: ${providerId}`);
}

export async function testConnection(providerId: string): Promise<ProviderHealth> {
  const result = await query('SELECT * FROM ai_providers WHERE id = $1', [providerId]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Provider');
  }

  const provider = result.rows[0];
  const start = Date.now();

  try {
    const response = await fetch(`${provider.base_url}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${decrypt(JSON.parse(provider.api_key_encrypted))}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    const latency = Date.now() - start;
    const status = response.ok ? 'healthy' : 'degraded';

    await query(
      `UPDATE ai_providers SET health_status = $1, last_health_check = NOW() WHERE id = $2`,
      [status, providerId]
    );

    return {
      name: provider.name,
      status: status as any,
      latency,
      lastCheck: new Date(),
    };
  } catch (error) {
    const latency = Date.now() - start;
    await query(
      `UPDATE ai_providers SET health_status = 'unhealthy', last_health_check = NOW() WHERE id = $1`,
      [providerId]
    );

    return {
      name: provider.name,
      status: 'unhealthy',
      latency,
      lastCheck: new Date(),
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

export async function toggle(providerId: string, enabled: boolean): Promise<AIProvider> {
  const result = await query(
    `UPDATE ai_providers SET enabled = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [enabled, providerId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Provider');
  }

  logger.info(`AI provider ${enabled ? 'enabled' : 'disabled'}: ${providerId}`);
  return { ...result.rows[0], api_key_encrypted: '***' };
}

export async function getModels(providerId: string): Promise<string[]> {
  const result = await query('SELECT models FROM ai_providers WHERE id = $1', [providerId]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Provider');
  }
  return result.rows[0].models || [];
}

export async function healthCheck(): Promise<ProviderHealth[]> {
  const providers = await query('SELECT * FROM ai_providers WHERE enabled = true');
  const results: ProviderHealth[] = [];

  for (const provider of providers.rows) {
    const start = Date.now();
    try {
      const response = await fetch(`${provider.base_url}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${decrypt(JSON.parse(provider.api_key_encrypted))}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      const latency = Date.now() - start;
      const status = response.ok ? 'healthy' : 'degraded';

      await query(
        `UPDATE ai_providers SET health_status = $1, last_health_check = NOW() WHERE id = $2`,
        [status, provider.id]
      );

      results.push({
        name: provider.name,
        status: status as any,
        latency,
        lastCheck: new Date(),
      });
    } catch (error) {
      const latency = Date.now() - start;
      await query(
        `UPDATE ai_providers SET health_status = 'unhealthy', last_health_check = NOW() WHERE id = $1`,
        [provider.id]
      );

      results.push({
        name: provider.name,
        status: 'unhealthy',
        latency,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Connection failed',
      });
    }
  }

  return results;
}
