import { query } from '../config/database';
import { Memory, MemoryType } from '../types';
import { logger } from '../utils/logger';

export async function store(
  key: string,
  value: Record<string, unknown>,
  type: MemoryType,
  orgId: string,
  namespace?: string,
  expiresAt?: Date
): Promise<Memory> {
  const result = await query(
    `INSERT INTO memory (organization_id, key, value, type, namespace, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id, key, namespace)
     DO UPDATE SET value = $3, type = $4, expires_at = $6, updated_at = NOW()
     RETURNING *`,
    [orgId, key, JSON.stringify(value), type, namespace || null, expiresAt || null]
  );

  logger.info(`Memory stored: ${key} for org ${orgId}`);
  return result.rows[0];
}

export async function retrieve(key: string, orgId: string, namespace?: string): Promise<Memory | null> {
  const result = await query(
    `SELECT * FROM memory
     WHERE organization_id = $1 AND key = $2 AND (namespace = $3 OR (namespace IS NULL AND $3 IS NULL))
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [orgId, key, namespace || null]
  );

  return result.rows[0] || null;
}

export async function search(
  queryText: string,
  orgId: string,
  type?: MemoryType,
  limit: number = 20
): Promise<Memory[]> {
  let sql = `SELECT * FROM memory WHERE organization_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`;
  const params: any[] = [orgId];
  let paramCount = 2;

  if (type) {
    sql += ` AND type = $${paramCount++}`;
    params.push(type);
  }

  if (queryText) {
    sql += ` AND (key ILIKE $${paramCount} OR value::text ILIKE $${paramCount})`;
    params.push(`%${queryText}%`);
    paramCount++;
  }

  sql += ` ORDER BY updated_at DESC LIMIT $${paramCount}`;
  params.push(limit);

  const result = await query(sql, params);
  return result.rows;
}

export async function remove(key: string, orgId: string, namespace?: string): Promise<void> {
  await query(
    `DELETE FROM memory WHERE organization_id = $1 AND key = $2 AND (namespace = $3 OR (namespace IS NULL AND $3 IS NULL))`,
    [orgId, key, namespace || null]
  );

  logger.info(`Memory deleted: ${key} for org ${orgId}`);
}

export async function getBusinessMemory(orgId: string): Promise<Memory[]> {
  return search('', orgId, 'business');
}

export async function getBrandMemory(orgId: string): Promise<Memory[]> {
  return search('', orgId, 'brand');
}

export async function getConversationMemory(conversationId: string): Promise<Memory[]> {
  const result = await query(
    `SELECT * FROM memory WHERE key LIKE $1 AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at ASC`,
    [`conversation:${conversationId}:%`]
  );
  return result.rows;
}
