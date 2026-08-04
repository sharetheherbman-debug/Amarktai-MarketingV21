import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { TrendMonitor, TrendItem, CreateTrendMonitorData, UpdateTrendMonitorData } from '../types';

export async function listMonitors(orgId: string): Promise<TrendMonitor[]> {
  const result = await query(
    'SELECT * FROM trend_monitors WHERE organization_id = $1 ORDER BY created_at DESC',
    [orgId]
  );

  return result.rows.map(mapMonitorRow);
}

export async function getMonitorById(id: string, orgId: string): Promise<TrendMonitor> {
  const result = await query(
    'SELECT * FROM trend_monitors WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Trend monitor');
  }

  return mapMonitorRow(result.rows[0]);
}

export async function createMonitor(orgId: string, data: CreateTrendMonitorData, userId: string): Promise<TrendMonitor> {
  const result = await query(
    `INSERT INTO trend_monitors (organization_id, topic, description, keywords, sources, config, alert_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      orgId,
      data.topic,
      data.description || null,
      JSON.stringify(data.keywords || []),
      JSON.stringify(data.sources || []),
      JSON.stringify(data.config || {}),
      data.alert_threshold ?? 0.7,
    ]
  );

  logger.info(`Trend monitor created: ${data.topic} for org: ${orgId}`);
  return mapMonitorRow(result.rows[0]);
}

export async function updateMonitor(id: string, orgId: string, data: UpdateTrendMonitorData): Promise<TrendMonitor> {
  const existing = await getMonitorById(id, orgId);

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (data.topic !== undefined) {
    updates.push(`topic = $${paramCount++}`);
    values.push(data.topic);
  }
  if (data.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(data.description);
  }
  if (data.keywords !== undefined) {
    updates.push(`keywords = $${paramCount++}`);
    values.push(JSON.stringify(data.keywords));
  }
  if (data.sources !== undefined) {
    updates.push(`sources = $${paramCount++}`);
    values.push(JSON.stringify(data.sources));
  }
  if (data.config !== undefined) {
    updates.push(`config = $${paramCount++}`);
    values.push(JSON.stringify(data.config));
  }
  if (data.alert_threshold !== undefined) {
    updates.push(`alert_threshold = $${paramCount++}`);
    values.push(data.alert_threshold);
  }
  if (data.is_active !== undefined) {
    updates.push(`is_active = $${paramCount++}`);
    values.push(data.is_active);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = NOW()');
  values.push(id, orgId);

  const result = await query(
    `UPDATE trend_monitors SET ${updates.join(', ')} WHERE id = $${paramCount} AND organization_id = $${paramCount + 1} RETURNING *`,
    values
  );

  logger.info(`Trend monitor updated: ${id}`);
  return mapMonitorRow(result.rows[0]);
}

export async function deleteMonitor(id: string, orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM trend_monitors WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Trend monitor');
  }

  logger.info(`Trend monitor deleted: ${id}`);
}

export async function listItems(orgId: string, monitorId?: string, limit: number = 50, offset: number = 0): Promise<{ items: TrendItem[]; total: number }> {
  let whereClause = 'WHERE organization_id = $1';
  const params: unknown[] = [orgId];

  if (monitorId) {
    whereClause += ' AND monitor_id = $2';
    params.push(monitorId);
  }

  const countResult = await query(
    `SELECT COUNT(*) FROM trend_items ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT * FROM trend_items ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { items: result.rows.map(mapItemRow), total };
}

export async function markAsRead(itemId: string, orgId: string): Promise<void> {
  const result = await query(
    'UPDATE trend_items SET is_read = true WHERE id = $1 AND organization_id = $2 RETURNING id',
    [itemId, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Trend item');
  }
}

export async function toggleSaved(itemId: string, orgId: string): Promise<void> {
  const result = await query(
    'UPDATE trend_items SET is_saved = NOT is_saved WHERE id = $1 AND organization_id = $2 RETURNING id',
    [itemId, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Trend item');
  }
}

export async function getUnreadCount(orgId: string): Promise<number> {
  const result = await query(
    'SELECT COUNT(*) FROM trend_items WHERE organization_id = $1 AND is_read = false',
    [orgId]
  );

  return parseInt(result.rows[0].count);
}

export async function checkMonitor(id: string, orgId: string): Promise<void> {
  const monitor = await getMonitorById(id, orgId);

  logger.info(`Running trend check: ${id} (${monitor.topic})`);

  try {
    const keywords = Array.isArray(monitor.keywords) ? monitor.keywords : [];
    const sources = Array.isArray(monitor.sources) ? monitor.sources : [];

    const items: Array<{
      title: string;
      url: string;
      source: string;
      summary: string;
      relevance_score: number;
      sentiment: string;
      data: Record<string, unknown>;
    }> = [];

    for (const source of sources) {
      try {
        logger.info(`Checking source: ${source} for keywords: ${keywords.join(', ')}`);
      } catch (sourceError) {
        logger.warn(`Failed to check source: ${source}`, sourceError);
      }
    }

    for (const item of items) {
      const existing = await query(
        'SELECT id FROM trend_items WHERE monitor_id = $1 AND url = $2',
        [id, item.url]
      );

      if (existing.rows.length === 0) {
        await query(
          `INSERT INTO trend_items (monitor_id, organization_id, title, url, source, summary, relevance_score, sentiment, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            orgId,
            item.title,
            item.url,
            item.source,
            item.summary,
            item.relevance_score,
            item.sentiment,
            JSON.stringify(item.data),
          ]
        );
      }
    }

    await query(
      'UPDATE trend_monitors SET last_checked_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );

    logger.info(`Trend check completed: ${id} - ${items.length} items found`);
  } catch (error) {
    logger.error(`Trend check failed: ${id}`, error);
    throw error;
  }
}

export async function getAlerts(orgId: string): Promise<TrendItem[]> {
  const result = await query(
    `SELECT ti.* FROM trend_items ti
     JOIN trend_monitors tm ON ti.monitor_id = tm.id
     WHERE ti.organization_id = $1
       AND ti.relevance_score >= tm.alert_threshold
       AND ti.is_read = false
     ORDER BY ti.relevance_score DESC, ti.created_at DESC
     LIMIT 50`,
    [orgId]
  );

  return result.rows.map(mapItemRow);
}

function mapMonitorRow(row: Record<string, unknown>): TrendMonitor {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    topic: row.topic as string,
    description: row.description as string | null,
    keywords: typeof row.keywords === 'string' ? JSON.parse(row.keywords) : (row.keywords as string[]) || [],
    sources: typeof row.sources === 'string' ? JSON.parse(row.sources) : (row.sources as string[]) || [],
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
    last_checked_at: row.last_checked_at as Date | null,
    alert_threshold: parseFloat(row.alert_threshold as string) || 0.7,
    is_active: row.is_active as boolean,
    created_by: row.created_by as string | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

function mapItemRow(row: Record<string, unknown>): TrendItem {
  return {
    id: row.id as string,
    monitor_id: row.monitor_id as string,
    organization_id: row.organization_id as string,
    title: row.title as string | null,
    url: row.url as string | null,
    source: row.source as string | null,
    summary: row.summary as string | null,
    relevance_score: parseFloat(row.relevance_score as string) || 0,
    sentiment: row.sentiment as string | null,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as Record<string, unknown>) || {},
    is_read: row.is_read as boolean,
    is_saved: row.is_saved as boolean,
    published_at: row.published_at as Date | null,
    created_at: row.created_at as Date,
  };
}
