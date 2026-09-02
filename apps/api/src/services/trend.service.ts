import crypto from 'crypto';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { TrendMonitor, TrendItem, CreateTrendMonitorData, UpdateTrendMonitorData } from '../types';
import { safeFetch } from '../utils/safe-fetch';

interface CandidateItem {
  title: string;
  url: string;
  source: string;
  summary: string;
  published_at: string | null;
  data: Record<string, unknown>;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function asStringArray(value: unknown): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function stripHtml(value: string): string {
  return decodeXml(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(block: string, names: string[]): string {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match?.[1]) return stripHtml(match[1]);
  }
  return '';
}

function parseFeed(xml: string, sourceUrl: string): CandidateItem[] {
  const blocks = [
    ...(xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []),
    ...(xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || []),
  ];
  return blocks.slice(0, 100).flatMap((block): CandidateItem[] => {
    const title = tag(block, ['title']);
    const linkText = tag(block, ['link', 'guid']);
    const linkHref = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || '';
    const rawUrl = linkHref || linkText;
    let url = '';
    try { url = rawUrl ? new URL(rawUrl, sourceUrl).toString() : ''; } catch { url = ''; }
    const summary = tag(block, ['description', 'summary', 'content:encoded', 'content']);
    const published = tag(block, ['pubDate', 'published', 'updated', 'dc:date']);
    if (!title && !summary) return [];
    const stableUrl = url || `${sourceUrl}#item-${crypto.createHash('sha256').update(`${title}|${published}|${summary}`).digest('hex').slice(0, 20)}`;
    return [{
      title: title || summary.slice(0, 160),
      url: stableUrl,
      source: new URL(sourceUrl).hostname,
      summary: summary.slice(0, 4000),
      published_at: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
      data: { feed_url: sourceUrl },
    }];
  });
}

function findJsonItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  for (const key of ['items', 'articles', 'results', 'data', 'entries', 'posts']) {
    if (Array.isArray(object[key])) return object[key] as unknown[];
  }
  return [];
}

function parseJsonItems(value: unknown, sourceUrl: string): CandidateItem[] {
  return findJsonItems(value).slice(0, 100).flatMap((entry, index): CandidateItem[] => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const title = String(row.title || row.name || row.headline || '').trim();
    const summary = String(row.summary || row.description || row.excerpt || row.content || row.text || '').trim();
    if (!title && !summary) return [];
    const rawUrl = String(row.url || row.link || row.permalink || '').trim();
    let url = '';
    try { url = rawUrl ? new URL(rawUrl, sourceUrl).toString() : ''; } catch { url = ''; }
    const published = String(row.published_at || row.publishedAt || row.date || row.created_at || row.createdAt || '').trim();
    const stableUrl = url || `${sourceUrl}#item-${crypto.createHash('sha256').update(`${index}|${title}|${summary}`).digest('hex').slice(0, 20)}`;
    return [{
      title: title || summary.slice(0, 160), url: stableUrl, source: new URL(sourceUrl).hostname,
      summary: stripHtml(summary).slice(0, 4000),
      published_at: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
      data: { feed_url: sourceUrl, source_payload: row },
    }];
  });
}

function relevanceScore(item: CandidateItem, topic: string, keywords: string[]): number {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const terms = [...new Set([topic, ...keywords].map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (terms.length === 0) return 0.5;
  let matched = 0;
  for (const term of terms) if (text.includes(term)) matched++;
  const topicBonus = topic.trim() && text.includes(topic.trim().toLowerCase()) ? 0.25 : 0;
  return Math.max(0, Math.min(1, matched / Math.max(1, Math.min(terms.length, 4)) + topicBonus));
}

function sentiment(text: string): string {
  const normalized = text.toLowerCase();
  const positive = ['growth', 'gain', 'success', 'improve', 'launch', 'win', 'opportunity', 'positive'];
  const negative = ['loss', 'decline', 'fail', 'risk', 'crisis', 'negative', 'drop', 'warning'];
  const positiveCount = positive.filter((word) => normalized.includes(word)).length;
  const negativeCount = negative.filter((word) => normalized.includes(word)).length;
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

export async function listMonitors(orgId: string): Promise<TrendMonitor[]> {
  const result = await query('SELECT * FROM trend_monitors WHERE organization_id=$1 ORDER BY created_at DESC', [orgId]);
  return result.rows.map(mapMonitorRow);
}

export async function getMonitorById(id: string, orgId: string): Promise<TrendMonitor> {
  const result = await query('SELECT * FROM trend_monitors WHERE id=$1 AND organization_id=$2', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Trend monitor');
  return mapMonitorRow(result.rows[0]);
}

export async function createMonitor(orgId: string, data: CreateTrendMonitorData, userId: string): Promise<TrendMonitor> {
  const result = await query(
    `INSERT INTO trend_monitors
       (organization_id,topic,description,keywords,sources,config,alert_threshold,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [orgId, data.topic, data.description || null, JSON.stringify(data.keywords || []), JSON.stringify(data.sources || []), JSON.stringify(data.config || {}), data.alert_threshold ?? 0.7, userId]
  );
  return mapMonitorRow(result.rows[0]);
}

export async function updateMonitor(id: string, orgId: string, data: UpdateTrendMonitorData): Promise<TrendMonitor> {
  const existing = await getMonitorById(id, orgId);
  const updates: string[] = [];
  const values: unknown[] = [];
  let parameter = 1;
  const add = (column: string, value: unknown) => { updates.push(`${column}=$${parameter++}`); values.push(value); };
  if (data.topic !== undefined) add('topic', data.topic);
  if (data.description !== undefined) add('description', data.description || null);
  if (data.keywords !== undefined) add('keywords', JSON.stringify(data.keywords));
  if (data.sources !== undefined) add('sources', JSON.stringify(data.sources));
  if (data.config !== undefined) add('config', JSON.stringify(data.config));
  if (data.alert_threshold !== undefined) add('alert_threshold', data.alert_threshold);
  if (data.is_active !== undefined) add('is_active', data.is_active);
  if (updates.length === 0) return existing;
  updates.push('updated_at=NOW()');
  values.push(id, orgId);
  const result = await query(`UPDATE trend_monitors SET ${updates.join(',')} WHERE id=$${parameter} AND organization_id=$${parameter + 1} RETURNING *`, values);
  if (result.rows.length === 0) throw new NotFoundError('Trend monitor');
  return mapMonitorRow(result.rows[0]);
}

export async function deleteMonitor(id: string, orgId: string): Promise<void> {
  const result = await query('DELETE FROM trend_monitors WHERE id=$1 AND organization_id=$2 RETURNING id', [id, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Trend monitor');
}

export async function listItems(orgId: string, monitorId?: string, limit = 50, offset = 0): Promise<{ items: TrendItem[]; total: number }> {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const boundedOffset = Math.max(0, Number(offset) || 0);
  let where = 'WHERE organization_id=$1';
  const params: unknown[] = [orgId];
  if (monitorId) { where += ' AND monitor_id=$2'; params.push(monitorId); }
  const count = await query(`SELECT COUNT(*) FROM trend_items ${where}`, params);
  const result = await query(
    `SELECT * FROM trend_items ${where} ORDER BY COALESCE(published_at,created_at) DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, boundedLimit, boundedOffset]
  );
  return { items: result.rows.map(mapItemRow), total: Number(count.rows[0].count || 0) };
}

export async function markAsRead(itemId: string, orgId: string): Promise<void> {
  const result = await query('UPDATE trend_items SET is_read=TRUE WHERE id=$1 AND organization_id=$2 RETURNING id', [itemId, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Trend item');
}

export async function toggleSaved(itemId: string, orgId: string): Promise<void> {
  const result = await query('UPDATE trend_items SET is_saved=NOT is_saved WHERE id=$1 AND organization_id=$2 RETURNING id', [itemId, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Trend item');
}

export async function getUnreadCount(orgId: string): Promise<number> {
  const result = await query('SELECT COUNT(*) FROM trend_items WHERE organization_id=$1 AND is_read=FALSE', [orgId]);
  return Number(result.rows[0].count || 0);
}

async function fetchSource(sourceUrl: string): Promise<CandidateItem[]> {
  const response = await safeFetch(sourceUrl, {
    headers: { 'User-Agent': 'AmarktAI-Marketing-Trend-Monitor/1.0', Accept: 'application/rss+xml,application/atom+xml,application/json,text/xml,*/*' },
    timeoutMs: 25000,
    maxResponseBytes: 5 * 1024 * 1024,
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('json') || body.trim().startsWith('{') || body.trim().startsWith('[')) {
    try { return parseJsonItems(JSON.parse(body), sourceUrl); }
    catch { throw new Error('Source returned invalid JSON'); }
  }
  if (contentType.includes('xml') || /<(rss|feed|rdf:RDF)\b/i.test(body)) return parseFeed(body, sourceUrl);
  throw new Error('Source must return RSS, Atom or JSON');
}

export async function checkMonitor(id: string, orgId: string): Promise<number> {
  const monitor = await getMonitorById(id, orgId);
  const keywords = asStringArray(monitor.keywords);
  const sources = asStringArray(monitor.sources);
  if (sources.length === 0) throw new AppError(400, 'Add at least one RSS, Atom or JSON source URL', 'TREND_SOURCE_REQUIRED');

  const candidates: CandidateItem[] = [];
  const failures: string[] = [];
  for (const source of sources.slice(0, 20)) {
    try {
      candidates.push(...await fetchSource(source));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${source}: ${message}`);
      logger.warn(`Trend source failed for monitor ${id}: ${source}: ${message}`);
    }
  }
  if (failures.length === sources.slice(0, 20).length) {
    throw new AppError(502, `All trend sources failed: ${failures.join('; ').slice(0, 1500)}`, 'TREND_SOURCES_FAILED');
  }

  let inserted = 0;
  for (const item of candidates) {
    const relevance = relevanceScore(item, monitor.topic, keywords);
    if (relevance <= 0) continue;
    const result = await query(
      `INSERT INTO trend_items
         (monitor_id,organization_id,title,url,source,summary,relevance_score,sentiment,data,published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (monitor_id,url) WHERE url IS NOT NULL DO UPDATE SET
         title=EXCLUDED.title,source=EXCLUDED.source,summary=EXCLUDED.summary,
         relevance_score=EXCLUDED.relevance_score,sentiment=EXCLUDED.sentiment,
         data=EXCLUDED.data,published_at=COALESCE(EXCLUDED.published_at,trend_items.published_at)
       RETURNING (xmax=0) AS inserted`,
      [id, orgId, item.title, item.url, item.source, item.summary, relevance, sentiment(`${item.title} ${item.summary}`), JSON.stringify(item.data), item.published_at]
    );
    if (result.rows[0]?.inserted === true) inserted++;
  }

  await query('UPDATE trend_monitors SET last_checked_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2', [id, orgId]);
  logger.info(`Trend check completed: ${id}; candidates=${candidates.length}; inserted=${inserted}; source_failures=${failures.length}`);
  return inserted;
}

export async function getAlerts(orgId: string): Promise<TrendItem[]> {
  const result = await query(
    `SELECT ti.* FROM trend_items ti JOIN trend_monitors tm ON tm.id=ti.monitor_id
     WHERE ti.organization_id=$1 AND ti.relevance_score>=tm.alert_threshold AND ti.is_read=FALSE
     ORDER BY ti.relevance_score DESC,COALESCE(ti.published_at,ti.created_at) DESC LIMIT 50`,
    [orgId]
  );
  return result.rows.map(mapItemRow);
}

function mapMonitorRow(row: Record<string, unknown>): TrendMonitor {
  return {
    id: String(row.id), organization_id: String(row.organization_id), topic: String(row.topic),
    description: row.description ? String(row.description) : null,
    keywords: asStringArray(row.keywords), sources: asStringArray(row.sources),
    config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as Record<string, unknown>) || {},
    last_checked_at: row.last_checked_at as Date | null,
    alert_threshold: Number(row.alert_threshold ?? 0.7), is_active: row.is_active !== false,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: row.created_at as Date, updated_at: row.updated_at as Date,
  };
}

function mapItemRow(row: Record<string, unknown>): TrendItem {
  return {
    id: String(row.id), monitor_id: String(row.monitor_id), organization_id: String(row.organization_id),
    title: row.title ? String(row.title) : null, url: row.url ? String(row.url) : null,
    source: row.source ? String(row.source) : null, summary: row.summary ? String(row.summary) : null,
    relevance_score: Number(row.relevance_score || 0), sentiment: row.sentiment ? String(row.sentiment) : null,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as Record<string, unknown>) || {},
    is_read: row.is_read === true, is_saved: row.is_saved === true,
    published_at: row.published_at as Date | null, created_at: row.created_at as Date,
  };
}
