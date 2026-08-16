import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { KnowledgeSource, KnowledgeItem, CreateKnowledgeSourceData, UpdateKnowledgeSourceData } from '../types';
import { hybridSearch, ingestSource } from './knowledge-ingestion.service';

export async function list(orgId: string, type?: string): Promise<KnowledgeSource[]> {
  let sql = 'SELECT * FROM knowledge_sources WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  if (type) { sql += ' AND type = $2'; params.push(type); }
  sql += ' ORDER BY created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapSourceRow);
}

export async function getById(id: string, orgId: string): Promise<KnowledgeSource> {
  const result = await query('SELECT * FROM knowledge_sources WHERE id = $1 AND organization_id = $2', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Knowledge source');
  return mapSourceRow(result.rows[0]);
}

export async function create(orgId: string, data: CreateKnowledgeSourceData, userId: string): Promise<KnowledgeSource> {
  const config = data.config || {};
  const refreshInterval = Math.max(15, Math.min(Number((config as Record<string, unknown>).refresh_interval_minutes || 1440), 43200));
  const result = await query(
    `INSERT INTO knowledge_sources
       (organization_id,name,type,url,config,created_by,refresh_interval_minutes,next_refresh_at,stale_after)
     VALUES ($1,$2,$3,$4,$5,$6,$7,
       CASE WHEN $3 IN ('website','api','rss') THEN NOW() ELSE NULL END,
       CASE WHEN $3 IN ('website','api','rss') THEN NOW() + ($7 || ' minutes')::interval ELSE NULL END)
     RETURNING *`,
    [orgId, data.name, data.type, data.url || null, JSON.stringify(config), userId, refreshInterval]
  );
  logger.info(`Knowledge source created: ${data.name} for org: ${orgId}`);
  return mapSourceRow(result.rows[0]);
}

export async function update(id: string, orgId: string, data: UpdateKnowledgeSourceData): Promise<KnowledgeSource> {
  await getById(id, orgId);
  const updates: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  if (data.name !== undefined) { updates.push(`name = $${index++}`); values.push(data.name); }
  if (data.url !== undefined) { updates.push(`url = $${index++}`); values.push(data.url); }
  if (data.config !== undefined) { updates.push(`config = $${index++}`); values.push(JSON.stringify(data.config)); }
  if (data.status !== undefined) { updates.push(`status = $${index++}`); values.push(data.status); }
  if (updates.length === 0) return getById(id, orgId);
  updates.push('updated_at = NOW()');
  values.push(id, orgId);
  const result = await query(
    `UPDATE knowledge_sources SET ${updates.join(', ')} WHERE id = $${index} AND organization_id = $${index + 1} RETURNING *`,
    values
  );
  return mapSourceRow(result.rows[0]);
}

export async function remove(id: string, orgId: string): Promise<void> {
  const result = await query('DELETE FROM knowledge_sources WHERE id = $1 AND organization_id = $2 RETURNING id', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Knowledge source');
}

export async function getStats(orgId: string): Promise<{ totalSources: number; totalItems: number; totalTokens: number; byType: Record<string, number> }> {
  const sources = await query(
    'SELECT COUNT(*) AS total, type, COALESCE(SUM(total_tokens), 0) AS tokens FROM knowledge_sources WHERE organization_id = $1 GROUP BY type',
    [orgId]
  );
  const items = await query('SELECT COUNT(*) AS total, COALESCE(SUM(tokens), 0) AS tokens FROM knowledge_items WHERE organization_id = $1', [orgId]);
  const byType: Record<string, number> = {};
  for (const row of sources.rows) byType[String(row.type)] = Number(row.total);
  return {
    totalSources: sources.rows.reduce((sum, row) => sum + Number(row.total), 0),
    totalItems: Number(items.rows[0]?.total || 0),
    totalTokens: Number(items.rows[0]?.tokens || 0),
    byType,
  };
}

export async function search(orgId: string, searchText: string, limit = 10): Promise<Array<Record<string, unknown>>> {
  return hybridSearch(orgId, searchText, limit);
}

export async function listItems(sourceId: string, orgId: string, limit = 50, offset = 0): Promise<{ items: KnowledgeItem[]; total: number }> {
  const count = await query('SELECT COUNT(*) FROM knowledge_items WHERE source_id = $1 AND organization_id = $2', [sourceId, orgId]);
  const result = await query(
    'SELECT * FROM knowledge_items WHERE source_id = $1 AND organization_id = $2 ORDER BY chunk_index ASC, created_at DESC LIMIT $3 OFFSET $4',
    [sourceId, orgId, Math.max(1, Math.min(limit, 200)), Math.max(0, offset)]
  );
  return { items: result.rows.map(mapItemRow), total: Number(count.rows[0].count) };
}

export async function deleteItem(itemId: string, orgId: string): Promise<void> {
  const result = await query('DELETE FROM knowledge_items WHERE id = $1 AND organization_id = $2 RETURNING source_id, tokens', [itemId, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Knowledge item');
  const row = result.rows[0];
  if (row.source_id) {
    await query(
      `UPDATE knowledge_sources
       SET item_count = GREATEST(item_count - 1, 0), total_tokens = GREATEST(total_tokens - $1, 0), updated_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [Number(row.tokens || 0), row.source_id, orgId]
    );
  }
}

export async function syncSource(id: string, orgId: string, trigger: 'manual' | 'scheduled' | 'connector' | 'director' = 'manual') {
  return ingestSource(id, orgId, trigger);
}

export async function refreshDueSources(limit = 10): Promise<number> {
  const due = await query(
    `SELECT id,organization_id FROM knowledge_sources
     WHERE type IN ('website','api','rss') AND deleted_at IS NULL
       AND status NOT IN ('syncing','crawling')
       AND COALESCE(next_refresh_at,NOW()) <= NOW()
     ORDER BY next_refresh_at NULLS FIRST LIMIT $1`,
    [Math.max(1, Math.min(limit, 50))]
  );
  let refreshed = 0;
  for (const source of due.rows) {
    try {
      await ingestSource(String(source.id), String(source.organization_id), 'scheduled');
      refreshed++;
    } catch (error) {
      logger.warn(`Scheduled knowledge refresh failed for ${source.id}: ${error}`);
    }
  }
  return refreshed;
}

export async function updateSourceStatus(id: string, status: string, errorMessage?: string): Promise<void> {
  await query(
    `UPDATE knowledge_sources SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`,
    [status, errorMessage || null, id]
  );
}

export async function deleteItemsBySource(sourceId: string): Promise<void> {
  await query('DELETE FROM knowledge_items WHERE source_id = $1', [sourceId]);
}

export async function createItem(
  orgId: string,
  sourceId: string,
  data: { title: string; content: string; content_type?: string; url?: string; metadata?: Record<string, unknown>; tokens?: number; chunk_index?: number }
): Promise<KnowledgeItem> {
  const tokens = data.tokens || Math.ceil(data.content.length / 4);
  const result = await query(
    `INSERT INTO knowledge_items (organization_id, source_id, title, content, content_type, url, metadata, tokens, chunk_index)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [orgId, sourceId, data.title, data.content, data.content_type || 'text', data.url || null, JSON.stringify(data.metadata || {}), tokens, data.chunk_index || 0]
  );
  await query(
    'UPDATE knowledge_sources SET item_count = item_count + 1, total_tokens = total_tokens + $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3',
    [tokens, sourceId, orgId]
  );
  return mapItemRow(result.rows[0]);
}

function mapSourceRow(row: Record<string, unknown>): KnowledgeSource {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    name: row.name as string,
    type: row.type as string,
    url: row.url as string | null,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
    status: row.status as string,
    error_message: row.error_message as string | null,
    last_synced_at: row.last_synced_at as Date | null,
    item_count: Number(row.item_count || 0),
    total_tokens: Number(row.total_tokens || 0),
    created_by: row.created_by as string | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

function mapItemRow(row: Record<string, unknown>): KnowledgeItem {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    source_id: row.source_id as string | null,
    title: row.title as string | null,
    content: row.content as string,
    content_type: row.content_type as string | null,
    url: row.url as string | null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    tokens: Number(row.tokens || 0),
    chunk_index: Number(row.chunk_index || 0),
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}
