import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { Competitor, CompetitorSnapshot, CreateCompetitorData, CreateSnapshotData, UpdateCompetitorData } from '../types';
import { safeFetch } from '../utils/safe-fetch';

export async function list(orgId: string, status?: string): Promise<Competitor[]> {
  let sql = 'SELECT * FROM competitors WHERE organization_id=$1 AND deleted_at IS NULL';
  const params: unknown[] = [orgId];
  if (status) { sql += ' AND status=$2'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(mapRow);
}

export async function getById(id: string, orgId: string): Promise<Competitor> {
  const result = await query(
    'SELECT * FROM competitors WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Competitor');
  return mapRow(result.rows[0]);
}

export async function create(orgId: string, data: CreateCompetitorData, userId: string): Promise<Competitor> {
  const result = await query(
    `INSERT INTO competitors
       (organization_id,name,url,description,industry,monitoring_config,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [orgId, data.name, data.url || null, data.description || null, data.industry || null, JSON.stringify(data.monitoring_config || {}), userId]
  );
  logger.info(`Competitor created: ${data.name} for org ${orgId}`);
  return mapRow(result.rows[0]);
}

export async function update(id: string, orgId: string, data: UpdateCompetitorData): Promise<Competitor> {
  const existing = await getById(id, orgId);
  const updates: string[] = [];
  const values: unknown[] = [];
  let parameter = 1;
  const add = (column: string, value: unknown) => { updates.push(`${column}=$${parameter++}`); values.push(value); };
  if (data.name !== undefined) add('name', data.name);
  if (data.url !== undefined) add('url', data.url || null);
  if (data.description !== undefined) add('description', data.description || null);
  if (data.industry !== undefined) add('industry', data.industry || null);
  if (data.monitoring_config !== undefined) add('monitoring_config', JSON.stringify(data.monitoring_config));
  if (data.status !== undefined) add('status', data.status);
  if (updates.length === 0) return existing;
  updates.push('updated_at=NOW()');
  values.push(id, orgId);
  const result = await query(
    `UPDATE competitors SET ${updates.join(',')} WHERE id=$${parameter} AND organization_id=$${parameter + 1} RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new NotFoundError('Competitor');
  return mapRow(result.rows[0]);
}

export async function remove(id: string, orgId: string): Promise<void> {
  const result = await query(
    'UPDATE competitors SET deleted_at=NOW(),status=\'archived\',updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL RETURNING id',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Competitor');
}

export async function getSnapshots(competitorId: string, orgId: string, type?: string, limit = 50): Promise<CompetitorSnapshot[]> {
  await getById(competitorId, orgId);
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  let sql = 'SELECT * FROM competitor_snapshots WHERE competitor_id=$1 AND organization_id=$2';
  const params: unknown[] = [competitorId, orgId];
  if (type) { sql += ' AND type=$3'; params.push(type); }
  sql += ` ORDER BY snapshot_date DESC,created_at DESC LIMIT $${params.length + 1}`;
  params.push(boundedLimit);
  const result = await query(sql, params);
  return result.rows.map(mapSnapshotRow);
}

export async function createSnapshot(competitorId: string, orgId: string, data: CreateSnapshotData): Promise<CompetitorSnapshot> {
  await getById(competitorId, orgId);
  const result = await query(
    `INSERT INTO competitor_snapshots
       (competitor_id,organization_id,type,title,data,summary,snapshot_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      competitorId, orgId, data.type, data.title || null, JSON.stringify(data.data || {}), data.summary || null,
      data.snapshot_date || new Date().toISOString().slice(0, 10),
    ]
  );
  return mapSnapshotRow(result.rows[0]);
}

function extractHtmlMetadata(html: string, status: number): Record<string, unknown> {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || null;
  const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim()
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1]?.trim()
    || null;
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() || null;
  const prices = [...new Set(html.match(/(?:[$€£R]\s?)[\d,.]+/g) || [])].slice(0, 20);
  return { title, meta_description: description, og_title: ogTitle, detected_prices: prices, status, content_length: html.length };
}

function describeChanges(previous: Record<string, unknown> | null, current: Record<string, unknown>): string[] {
  if (!previous) return ['Initial snapshot captured'];
  const changes: string[] = [];
  if (previous.title !== current.title) changes.push('Page title changed');
  if (previous.meta_description !== current.meta_description) changes.push('Meta description changed');
  if (previous.og_title !== current.og_title) changes.push('Open Graph title changed');
  if (JSON.stringify(previous.detected_prices || []) !== JSON.stringify(current.detected_prices || [])) changes.push('Displayed pricing changed');
  if (previous.status !== current.status) changes.push(`HTTP status changed from ${String(previous.status)} to ${String(current.status)}`);
  return changes;
}

export async function checkCompetitor(id: string, orgId: string): Promise<void> {
  const competitor = await getById(id, orgId);
  if (!competitor.url) throw new AppError(400, 'Competitor URL is required for monitoring', 'COMPETITOR_URL_REQUIRED');

  let snapshotData: Record<string, unknown>;
  try {
    const response = await safeFetch(competitor.url, {
      headers: { 'User-Agent': 'AmarktAI-Competitor-Monitor/1.0', Accept: 'text/html,application/xhtml+xml' },
      timeoutMs: 20000,
      maxResponseBytes: 5 * 1024 * 1024,
    });
    const html = await response.text();
    snapshotData = response.ok
      ? extractHtmlMetadata(html, response.status)
      : { status: response.status, error: `HTTP ${response.status}`, content_length: html.length };
  } catch (error) {
    snapshotData = { error: error instanceof Error ? error.message : 'Fetch failed', checked_at: new Date().toISOString() };
  }

  const previousResult = await query(
    `SELECT data FROM competitor_snapshots
     WHERE competitor_id=$1 AND organization_id=$2 AND type='website'
     ORDER BY snapshot_date DESC,created_at DESC LIMIT 1`,
    [id, orgId]
  );
  const previous = previousResult.rows.length === 0
    ? null
    : typeof previousResult.rows[0].data === 'string'
      ? JSON.parse(previousResult.rows[0].data) as Record<string, unknown>
      : previousResult.rows[0].data as Record<string, unknown>;
  const changes = describeChanges(previous, snapshotData);

  await createSnapshot(id, orgId, {
    type: 'website',
    title: `Website check - ${new Date().toISOString().slice(0, 10)}`,
    data: { ...snapshotData, changed: changes.length > 0, changes },
    summary: changes.length > 0 ? changes.join('; ') : 'No changes detected',
  });
  await query('UPDATE competitors SET last_checked_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2', [id, orgId]);
  logger.info(`Competitor check completed: ${id}; changes=${changes.length}`);
}

export async function getRecentChanges(orgId: string, days = 7): Promise<{ competitor: Competitor; snapshot: CompetitorSnapshot }[]> {
  const boundedDays = Math.max(1, Math.min(Number(days) || 7, 365));
  const result = await query(
    `SELECT cs.*,c.id AS comp_id,c.organization_id,c.name,c.url,c.description,c.industry,
            c.monitoring_config,c.last_checked_at,c.status AS comp_status,c.created_by,
            c.created_at AS comp_created_at,c.updated_at AS comp_updated_at
     FROM competitor_snapshots cs
     JOIN competitors c ON c.id=cs.competitor_id
     WHERE c.organization_id=$1
       AND c.deleted_at IS NULL
       AND cs.created_at >= NOW() - ($2::int * INTERVAL '1 day')
       AND cs.summary <> 'No changes detected'
     ORDER BY cs.created_at DESC LIMIT 50`,
    [orgId, boundedDays]
  );
  return result.rows.map((row) => ({
    competitor: mapRow({
      id: row.comp_id, organization_id: row.organization_id, name: row.name, url: row.url,
      description: row.description, industry: row.industry, monitoring_config: row.monitoring_config,
      last_checked_at: row.last_checked_at, status: row.comp_status, created_by: row.created_by,
      created_at: row.comp_created_at, updated_at: row.comp_updated_at, deleted_at: null,
    }),
    snapshot: mapSnapshotRow(row),
  }));
}

function mapRow(row: Record<string, unknown>): Competitor {
  return {
    id: String(row.id), organization_id: String(row.organization_id), name: String(row.name),
    url: row.url ? String(row.url) : null, description: row.description ? String(row.description) : null,
    industry: row.industry ? String(row.industry) : null,
    monitoring_config: typeof row.monitoring_config === 'string' ? JSON.parse(row.monitoring_config) : (row.monitoring_config as Record<string, unknown>) || {},
    last_checked_at: row.last_checked_at as Date | null, status: String(row.status),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: row.created_at as Date, updated_at: row.updated_at as Date,
  };
}

function mapSnapshotRow(row: Record<string, unknown>): CompetitorSnapshot {
  return {
    id: String(row.id), competitor_id: String(row.competitor_id), organization_id: String(row.organization_id),
    type: String(row.type), title: row.title ? String(row.title) : null,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as Record<string, unknown>) || {},
    summary: row.summary ? String(row.summary) : null,
    snapshot_date: String(row.snapshot_date), created_at: row.created_at as Date,
  };
}
