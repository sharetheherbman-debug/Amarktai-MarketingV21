import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { KnowledgeSource, KnowledgeItem, CreateKnowledgeSourceData, UpdateKnowledgeSourceData } from '../types';

export async function list(orgId: string, type?: string): Promise<KnowledgeSource[]> {
  let sql = 'SELECT * FROM knowledge_sources WHERE organization_id = $1';
  const params: unknown[] = [orgId];

  if (type) {
    sql += ' AND type = $2';
    params.push(type);
  }

  sql += ' ORDER BY created_at DESC';

  const result = await query(sql, params);
  return result.rows.map(mapSourceRow);
}

export async function getById(id: string, orgId: string): Promise<KnowledgeSource> {
  const result = await query(
    'SELECT * FROM knowledge_sources WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Knowledge source');
  }

  return mapSourceRow(result.rows[0]);
}

export async function create(orgId: string, data: CreateKnowledgeSourceData, userId: string): Promise<KnowledgeSource> {
  const result = await query(
    `INSERT INTO knowledge_sources (organization_id, name, type, url, config, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      orgId,
      data.name,
      data.type,
      data.url || null,
      JSON.stringify(data.config || {}),
      userId,
    ]
  );

  logger.info(`Knowledge source created: ${data.name} for org: ${orgId}`);
  return mapSourceRow(result.rows[0]);
}

export async function update(id: string, orgId: string, data: UpdateKnowledgeSourceData): Promise<KnowledgeSource> {
  const existing = await getById(id, orgId);

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(data.name);
  }
  if (data.url !== undefined) {
    updates.push(`url = $${paramCount++}`);
    values.push(data.url);
  }
  if (data.config !== undefined) {
    updates.push(`config = $${paramCount++}`);
    values.push(JSON.stringify(data.config));
  }
  if (data.status !== undefined) {
    updates.push(`status = $${paramCount++}`);
    values.push(data.status);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = NOW()');
  values.push(id, orgId);

  const result = await query(
    `UPDATE knowledge_sources SET ${updates.join(', ')} WHERE id = $${paramCount} AND organization_id = $${paramCount + 1} RETURNING *`,
    values
  );

  logger.info(`Knowledge source updated: ${id}`);
  return mapSourceRow(result.rows[0]);
}

export async function remove(id: string, orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM knowledge_sources WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Knowledge source');
  }

  logger.info(`Knowledge source deleted: ${id}`);
}

export async function getStats(orgId: string): Promise<{ totalSources: number; totalItems: number; byType: Record<string, number> }> {
  const sourcesResult = await query(
    'SELECT COUNT(*) as total, type FROM knowledge_sources WHERE organization_id = $1 GROUP BY type',
    [orgId]
  );

  const itemsResult = await query(
    'SELECT COUNT(*) as total FROM knowledge_items WHERE organization_id = $1',
    [orgId]
  );

  const byType: Record<string, number> = {};
  for (const row of sourcesResult.rows) {
    byType[row.type] = parseInt(row.total);
  }

  return {
    totalSources: sourcesResult.rows.reduce((sum, row) => sum + parseInt(row.total), 0),
    totalItems: parseInt(itemsResult.rows[0]?.total || '0'),
    byType,
  };
}

export async function search(orgId: string, q: string, limit: number = 10): Promise<KnowledgeItem[]> {
  const result = await query(
    `SELECT * FROM knowledge_items
     WHERE organization_id = $1
       AND (title ILIKE $2 OR content ILIKE $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [orgId, `%${q}%`, limit]
  );

  return result.rows.map(mapItemRow);
}

export async function listItems(sourceId: string, orgId: string, limit: number = 50, offset: number = 0): Promise<{ items: KnowledgeItem[]; total: number }> {
  const countResult = await query(
    'SELECT COUNT(*) FROM knowledge_items WHERE source_id = $1 AND organization_id = $2',
    [sourceId, orgId]
  );
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    'SELECT * FROM knowledge_items WHERE source_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT $3 OFFSET $4',
    [sourceId, orgId, limit, offset]
  );

  return { items: result.rows.map(mapItemRow), total };
}

export async function deleteItem(itemId: string, orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM knowledge_items WHERE id = $1 AND organization_id = $2 RETURNING id',
    [itemId, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Knowledge item');
  }

  logger.info(`Knowledge item deleted: ${itemId}`);
}

export async function syncSource(id: string, orgId: string): Promise<void> {
  const source = await getById(id, orgId);

  await query(
    "UPDATE knowledge_sources SET status = 'syncing', updated_at = NOW() WHERE id = $1",
    [id]
  );

  logger.info(`Knowledge source sync started: ${id} (type: ${source.type})`);

  try {
    if (source.type === 'website' || source.type === 'rss') {
      logger.info(`Syncing ${source.type} source: ${source.url}`);
    }

    await query(
      "UPDATE knowledge_sources SET status = 'active', last_synced_at = NOW(), updated_at = NOW() WHERE id = $1",
      [id]
    );

    logger.info(`Knowledge source sync completed: ${id}`);
  } catch (error) {
    await query(
      "UPDATE knowledge_sources SET status = 'error', updated_at = NOW() WHERE id = $1",
      [id]
    );
    logger.error(`Knowledge source sync failed: ${id}`, error);
    throw error;
  }
}

export async function updateSourceStatus(id: string, status: string, errorMessage?: string): Promise<void> {
  if (errorMessage) {
    await query(
      'UPDATE knowledge_sources SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3',
      [status, errorMessage, id]
    );
  } else {
    await query(
      'UPDATE knowledge_sources SET status = $1, error_message = NULL, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
  }
}

export async function deleteItemsBySource(sourceId: string): Promise<void> {
  await query(
    'DELETE FROM knowledge_items WHERE source_id = $1',
    [sourceId]
  );
}

export async function createItem(
  orgId: string,
  sourceId: string,
  data: {
    title: string;
    content: string;
    content_type?: string;
    url?: string;
    metadata?: Record<string, unknown>;
    tokens?: number;
    chunk_index?: number;
  }
): Promise<KnowledgeItem> {
  const result = await query(
    `INSERT INTO knowledge_items (organization_id, source_id, title, content, content_type, url, metadata, tokens, chunk_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      orgId,
      sourceId,
      data.title,
      data.content,
      data.content_type || null,
      data.url || null,
      JSON.stringify(data.metadata || {}),
      data.tokens || 0,
      data.chunk_index || 0,
    ]
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
    item_count: parseInt(row.item_count as string) || 0,
    total_tokens: parseInt(row.total_tokens as string) || 0,
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
    tokens: parseInt(row.tokens as string) || 0,
    chunk_index: parseInt(row.chunk_index as string) || 0,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}
