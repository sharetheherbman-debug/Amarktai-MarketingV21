import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import { Competitor, CompetitorSnapshot, CreateCompetitorData, CreateSnapshotData, UpdateCompetitorData } from '../types';

export async function list(orgId: string, status?: string): Promise<Competitor[]> {
  let sql = 'SELECT * FROM competitors WHERE organization_id = $1';
  const params: unknown[] = [orgId];

  if (status) {
    sql += ' AND status = $2';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';

  const result = await query(sql, params);
  return result.rows.map(mapRow);
}

export async function getById(id: string, orgId: string): Promise<Competitor> {
  const result = await query(
    'SELECT * FROM competitors WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Competitor');
  }

  return mapRow(result.rows[0]);
}

export async function create(orgId: string, data: CreateCompetitorData, userId: string): Promise<Competitor> {
  const result = await query(
    `INSERT INTO competitors (organization_id, name, url, description, industry, monitoring_config)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      orgId,
      data.name,
      data.url || null,
      data.description || null,
      data.industry || null,
      JSON.stringify(data.monitoring_config || {}),
    ]
  );

  logger.info(`Competitor created: ${data.name} for org: ${orgId}`);
  return mapRow(result.rows[0]);
}

export async function update(id: string, orgId: string, data: UpdateCompetitorData): Promise<Competitor> {
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
  if (data.description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(data.description);
  }
  if (data.industry !== undefined) {
    updates.push(`industry = $${paramCount++}`);
    values.push(data.industry);
  }
  if (data.monitoring_config !== undefined) {
    updates.push(`monitoring_config = $${paramCount++}`);
    values.push(JSON.stringify(data.monitoring_config));
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
    `UPDATE competitors SET ${updates.join(', ')} WHERE id = $${paramCount} AND organization_id = $${paramCount + 1} RETURNING *`,
    values
  );

  logger.info(`Competitor updated: ${id}`);
  return mapRow(result.rows[0]);
}

export async function remove(id: string, orgId: string): Promise<void> {
  const result = await query(
    'DELETE FROM competitors WHERE id = $1 AND organization_id = $2 RETURNING id',
    [id, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Competitor');
  }

  logger.info(`Competitor deleted: ${id}`);
}

export async function getSnapshots(competitorId: string, orgId: string, type?: string, limit: number = 50): Promise<CompetitorSnapshot[]> {
  await getById(competitorId, orgId);

  let sql = 'SELECT * FROM competitor_snapshots WHERE competitor_id = $1';
  const params: unknown[] = [competitorId];

  if (type) {
    sql += ' AND type = $2';
    params.push(type);
  }

  sql += ' ORDER BY snapshot_date DESC, created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit);

  const result = await query(sql, params);
  return result.rows.map(mapSnapshotRow);
}

export async function createSnapshot(competitorId: string, orgId: string, data: CreateSnapshotData): Promise<CompetitorSnapshot> {
  await getById(competitorId, orgId);

  const result = await query(
    `INSERT INTO competitor_snapshots (competitor_id, type, title, data, summary, snapshot_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      competitorId,
      data.type,
      data.title || null,
      JSON.stringify(data.data || {}),
      data.summary || null,
      data.snapshot_date || new Date().toISOString().split('T')[0],
    ]
  );

  logger.info(`Snapshot created for competitor: ${competitorId}, type: ${data.type}`);
  return mapSnapshotRow(result.rows[0]);
}

export async function checkCompetitor(id: string, orgId: string): Promise<void> {
  const competitor = await getById(id, orgId);

  logger.info(`Running competitor check: ${id} (${competitor.name})`);

  try {
    const snapshotData: Record<string, unknown> = {};

    if (competitor.url) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(competitor.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'AmarktAI-Bot/1.0' },
        });
        clearTimeout(timeout);

        if (response.ok) {
          const html = await response.text();

          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          snapshotData.title = titleMatch ? titleMatch[1].trim() : null;

          const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
          snapshotData.meta_description = metaDescMatch ? metaDescMatch[1].trim() : null;

          const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
          snapshotData.og_title = ogTitleMatch ? ogTitleMatch[1].trim() : null;

          const priceMatches = html.match(/\$[\d,]+\.?\d*/g);
          snapshotData.detected_prices = priceMatches ? [...new Set(priceMatches)].slice(0, 10) : [];

          snapshotData.status = response.status;
          snapshotData.content_length = html.length;
        } else {
          snapshotData.status = response.status;
          snapshotData.error = `HTTP ${response.status}`;
        }
      } catch (fetchError) {
        snapshotData.error = fetchError instanceof Error ? fetchError.message : 'Fetch failed';
      }
    }

    const lastSnapshot = await query(
      `SELECT * FROM competitor_snapshots
       WHERE competitor_id = $1 AND type = 'website'
       ORDER BY snapshot_date DESC, created_at DESC
       LIMIT 1`,
      [id]
    );

    let hasChanges = false;
    let summary = 'No changes detected';

    if (lastSnapshot.rows.length > 0) {
      const prevData = typeof lastSnapshot.rows[0].data === 'string'
        ? JSON.parse(lastSnapshot.rows[0].data)
        : lastSnapshot.rows[0].data;

      const changes: string[] = [];

      if (prevData.title !== snapshotData.title) {
        changes.push(`Title changed: "${prevData.title}" -> "${snapshotData.title}"`);
      }
      if (prevData.meta_description !== snapshotData.meta_description) {
        changes.push('Meta description changed');
      }
      if (JSON.stringify(prevData.detected_prices) !== JSON.stringify(snapshotData.detected_prices)) {
        changes.push('Pricing changes detected');
      }

      hasChanges = changes.length > 0;
      summary = hasChanges ? changes.join('; ') : 'No changes detected';
    } else {
      hasChanges = true;
      summary = 'Initial snapshot captured';
    }

    if (hasChanges) {
      await createSnapshot(id, orgId, {
        type: 'website',
        title: `Website check - ${new Date().toISOString().split('T')[0]}`,
        data: snapshotData,
        summary,
      });
    }

    await query(
      'UPDATE competitors SET last_checked_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );

    logger.info(`Competitor check completed: ${id} - ${hasChanges ? 'changes detected' : 'no changes'}`);
  } catch (error) {
    logger.error(`Competitor check failed: ${id}`, error);
    throw error;
  }
}

export async function getRecentChanges(orgId: string, days: number = 7): Promise<{ competitor: Competitor; snapshot: CompetitorSnapshot }[]> {
  const result = await query(
    `SELECT cs.*, c.id as comp_id, c.organization_id, c.name, c.url, c.description, c.industry,
            c.monitoring_config, c.last_checked_at, c.status as comp_status, c.created_at as comp_created_at, c.updated_at as comp_updated_at
     FROM competitor_snapshots cs
     JOIN competitors c ON cs.competitor_id = c.id
     WHERE c.organization_id = $1
       AND cs.created_at >= NOW() - INTERVAL '${days} days'
       AND cs.summary != 'No changes detected'
     ORDER BY cs.created_at DESC
     LIMIT 50`,
    [orgId]
  );

  return result.rows.map((row) => ({
    competitor: {
      id: row.comp_id,
      organization_id: row.organization_id,
      name: row.name,
      url: row.url,
      description: row.description,
      industry: row.industry,
      monitoring_config: typeof row.monitoring_config === 'string' ? JSON.parse(row.monitoring_config) : row.monitoring_config || {},
      last_checked_at: row.last_checked_at,
      status: row.comp_status,
      created_by: row.created_by || null,
      created_at: row.comp_created_at,
      updated_at: row.comp_updated_at,
    },
    snapshot: mapSnapshotRow(row),
  }));
}

function mapRow(row: Record<string, unknown>): Competitor {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    name: row.name as string,
    url: row.url as string | null,
    description: row.description as string | null,
    industry: row.industry as string | null,
    monitoring_config: typeof row.monitoring_config === 'string' ? JSON.parse(row.monitoring_config) : (row.monitoring_config as Record<string, unknown>) || {},
    last_checked_at: row.last_checked_at as Date | null,
    status: row.status as string,
    created_by: row.created_by as string | null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

function mapSnapshotRow(row: Record<string, unknown>): CompetitorSnapshot {
  return {
    id: row.id as string,
    competitor_id: row.competitor_id as string,
    organization_id: row.organization_id as string,
    type: row.type as string,
    title: row.title as string | null,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as Record<string, unknown>) || {},
    summary: row.summary as string | null,
    snapshot_date: row.snapshot_date as string,
    created_at: row.created_at as Date,
  };
}
