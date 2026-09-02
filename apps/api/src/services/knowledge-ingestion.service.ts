import { query, transaction } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import * as vectorService from './vector.service';
import { safeFetch, validatePublicHttpUrl } from '../utils/safe-fetch';
import crypto from 'crypto';

interface SourceRow extends Record<string, unknown> {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  url: string | null;
  config: Record<string, unknown> | string;
}

export interface DocumentInput {
  title: string;
  content: string;
  url?: string;
  metadata?: Record<string, unknown>;
  rawHtml?: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringHeaders(value: unknown): Record<string, string> {
  const object = objectValue(value);
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(object)) {
    if (typeof headerValue === 'string') headers[key] = headerValue;
  }
  return headers;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function htmlToText(html: string): string {
  return decodeHtml(
    html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|article|section|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim()
  );
}

function htmlTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 500) : fallback;
}

function firstMetaContent(html: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const forward = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'));
    const reverse = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`, 'i'));
    const value = htmlToText(forward?.[1] || reverse?.[1] || '');
    if (value) return value;
  }
  return '';
}

function structuredDataText(html: string): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1]);
      const queue = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of queue) {
        const records = Array.isArray(entry?.['@graph']) ? entry['@graph'] : [entry];
        for (const record of records) {
          for (const key of ['name', 'description', 'slogan', 'serviceType', 'category']) {
            if (typeof record?.[key] === 'string') values.push(record[key]);
          }
        }
      }
    } catch { /* Invalid first-party structured data is ignored. */ }
  }
  return values;
}

function metadataText(html: string, fallback: string): string {
  return [...new Set([
    htmlTitle(html, fallback),
    firstMetaContent(html, ['description', 'og:description', 'twitter:description']),
    firstMetaContent(html, ['og:site_name']),
    ...structuredDataText(html),
  ].map((value) => value.trim()).filter(Boolean))].join('\n\n');
}

function canonicalFromHtml(html: string, fallback: URL): URL {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  try { return new URL(match?.[1] || fallback.toString(), fallback); } catch { return fallback; }
}

function robotsAllows(robots: string, path: string): boolean {
  let applies = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (field?.toLowerCase() === 'user-agent') applies = value === '*';
    if (applies && field?.toLowerCase() === 'allow' && value && path.startsWith(value)) return true;
    if (applies && field?.toLowerCase() === 'disallow' && value && path.startsWith(value)) return false;
  }
  return true;
}

function sitemapLocations(xml: string, root: URL): string[] {
  return [...xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)].flatMap((match) => {
    try {
      const url = new URL(decodeHtml(match[1].trim()), root);
      return url.origin === root.origin ? [url.toString()] : [];
    } catch { return []; }
  });
}

function linksFromHtml(html: string, baseUrl: URL): string[] {
  const links = new Set<string>();
  const pattern = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl);
      url.hash = '';
      if (['http:', 'https:'].includes(url.protocol)) links.add(url.toString());
    } catch {
      // Ignore invalid links.
    }
  }
  return [...links];
}

function chunkText(text: string, maxChars = 6000, overlap = 500): string[] {
  const clean = text.replace(/\r/g, '').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);
    if (end < clean.length) {
      const boundary = Math.max(clean.lastIndexOf('\n', end), clean.lastIndexOf('. ', end));
      if (boundary > start + maxChars * 0.6) end = boundary + 1;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<{ finalUrl: string; contentType: string; text: string }> {
  const response = await safeFetch(url, {
    headers: {
      'User-Agent': 'AmarktAI-Marketing-KnowledgeBot/1.0',
      Accept: 'text/html,application/json,text/plain,application/xml;q=0.9,*/*;q=0.8',
      ...headers,
    },
    timeoutMs: 30000,
    maxResponseBytes: 10 * 1024 * 1024,
  });
  const text = await response.text();
  if (!response.ok) throw new AppError(502, `Knowledge source returned HTTP ${response.status}: ${text.slice(0, 300)}`, 'KNOWLEDGE_FETCH_FAILED');
  return { finalUrl: response.url, contentType: response.headers.get('content-type') || '', text };
}

export async function collectWebsiteDocuments(
  sourceUrl: string,
  options: { maxPages?: number; includeSubdomains?: boolean } = {}
): Promise<DocumentInput[]> {
  const validated = await validatePublicHttpUrl(sourceUrl);
  const root = new URL(validated.toString());
  const maxPages = Math.max(1, Math.min(Number(options.maxPages || 10), 50));
  let robots = '';
  try { robots = (await fetchText(new URL('/robots.txt', root).toString())).text; } catch { /* Missing robots does not prohibit crawling. */ }
  const queue = [root.toString()];
  try {
    const sitemap = await fetchText(new URL('/sitemap.xml', root).toString());
    queue.push(...sitemapLocations(sitemap.text, root));
  } catch { /* A sitemap is useful but optional. */ }
  const visited = new Set<string>();
  const documents: DocumentInput[] = [];

  while (queue.length > 0 && documents.length < maxPages && visited.size < maxPages * 3) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const requested = new URL(current);
    if (!robotsAllows(robots, requested.pathname)) continue;
    const response = await fetchText(current);
    const currentUrl = new URL(response.finalUrl);
    const sameHost = currentUrl.hostname === root.hostname || (options.includeSubdomains === true && currentUrl.hostname.endsWith(`.${root.hostname}`));
    if (!sameHost) continue;
    if (response.contentType.includes('html') || /<html\b/i.test(response.text)) {
      const canonical = canonicalFromHtml(response.text, currentUrl);
      if (canonical.origin !== root.origin) continue;
      const visible = htmlToText(response.text);
      const metadata = metadataText(response.text, currentUrl.pathname || 'Home');
      const content = [metadata, visible].filter(Boolean).join('\n\n').trim();
      if (content.length >= 40) documents.push({
        title: htmlTitle(response.text, currentUrl.pathname || 'Home'),
        content,
        url: canonical.toString(),
        rawHtml: response.text,
        metadata: {
          source_type: 'website',
          canonical_url: canonical.toString(),
          rendered_fallback_needed: visible.length < 80,
          extraction: visible.length >= 80 ? 'visible_html_and_metadata' : 'metadata_and_structured_data',
        },
      });
      for (const link of linksFromHtml(response.text, currentUrl)) {
        const next = new URL(link);
        const allowedHost = next.hostname === root.hostname || (options.includeSubdomains === true && next.hostname.endsWith(`.${root.hostname}`));
        if (allowedHost && !visited.has(next.toString()) && !queue.includes(next.toString())) queue.push(next.toString());
      }
    } else if (/^(text\/plain|application\/json)/i.test(response.contentType)) {
      documents.push({ title: currentUrl.pathname.split('/').filter(Boolean).pop() || 'Website', content: response.text, url: response.finalUrl, metadata: { source_type: 'website', content_type: response.contentType } });
    }
  }
  if (documents.length === 0) throw new AppError(422, 'We could not read useful public information from this website.', 'KNOWLEDGE_EMPTY_SOURCE');
  return documents;
}

function parseRss(xml: string, sourceUrl: string): DocumentInput[] {
  const documents: DocumentInput[] = [];
  for (const item of (xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || []).slice(0, 100)) {
    const tag = (name: string) => {
      const match = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
      return match ? htmlToText(match[1].replace(/<!\[CDATA\[|\]\]>/g, '')) : '';
    };
    const title = tag('title') || 'RSS item';
    const content = tag('content') || tag('description') || tag('summary');
    const link = item.match(/<link[^>]*href=["']([^"']+)["']/i) || item.match(/<link[^>]*>([^<]+)<\/link>/i);
    if (content) {
      let itemUrl = sourceUrl;
      try { if (link?.[1]) itemUrl = new URL(link[1], sourceUrl).toString(); } catch { /* retain source URL */ }
      documents.push({ title, content, url: itemUrl, metadata: { source_type: 'rss' } });
    }
  }
  return documents;
}

async function collectDocuments(source: SourceRow): Promise<DocumentInput[]> {
  const config = objectValue(source.config);

  if (source.type === 'manual' || source.type === 'document') {
    const content = String(config.content || '').trim();
    if (!content) throw new AppError(400, `${source.type} sources require content`, 'KNOWLEDGE_CONTENT_REQUIRED');
    return [{ title: String(config.title || source.name), content, url: source.url || undefined, metadata: { source_type: source.type, filename: config.filename || null } }];
  }

  if (source.type === 'api') {
    if (!source.url) throw new AppError(400, 'API sources require a URL', 'KNOWLEDGE_URL_REQUIRED');
    const response = await fetchText(source.url, stringHeaders(config.headers));
    let content = response.text;
    if (response.contentType.includes('json')) {
      try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* retain source text */ }
    }
    return [{ title: source.name, content, url: response.finalUrl, metadata: { source_type: 'api', content_type: response.contentType } }];
  }

  if (source.type === 'rss') {
    if (!source.url) throw new AppError(400, 'RSS sources require a URL', 'KNOWLEDGE_URL_REQUIRED');
    const response = await fetchText(source.url);
    const documents = parseRss(response.text, response.finalUrl);
    if (documents.length === 0) throw new AppError(400, 'RSS source contained no usable items', 'KNOWLEDGE_EMPTY_SOURCE');
    return documents;
  }

  if (source.type === 'website') {
    if (!source.url) throw new AppError(400, 'Website sources require a URL', 'KNOWLEDGE_URL_REQUIRED');
    const maxPages = Math.max(1, Math.min(Number(config.max_pages || 10), 50));
    return collectWebsiteDocuments(source.url, { maxPages, includeSubdomains: config.include_subdomains === true });
  }

  throw new AppError(400, `Unsupported knowledge source type: ${source.type}`, 'KNOWLEDGE_TYPE_UNSUPPORTED');
}

export async function ingestSource(
  sourceId: string,
  orgId: string,
  triggerType: 'manual' | 'scheduled' | 'connector' | 'director' = 'manual'
): Promise<{ documents: number; items: number; tokens: number; embeddings: number; version: number; changes: number }> {
  const sourceResult = await query('SELECT * FROM knowledge_sources WHERE id=$1 AND organization_id=$2', [sourceId, orgId]);
  if (sourceResult.rows.length === 0) throw new AppError(404, 'Knowledge source not found', 'NOT_FOUND');
  const source = sourceResult.rows[0] as SourceRow;
  const previousVersion = Number(sourceResult.rows[0].knowledge_version || 0);
  const syncRun = await query(
    `INSERT INTO knowledge_sync_runs (organization_id,source_id,trigger_type,previous_version,resulting_version)
     VALUES ($1,$2,$3,$4,$4) RETURNING id`,
    [orgId, sourceId, triggerType, previousVersion]
  );
  await query("UPDATE knowledge_sources SET status='syncing',error_message=NULL,updated_at=NOW() WHERE id=$1 AND organization_id=$2", [sourceId, orgId]);

  try {
    const documents = await collectDocuments(source);
    const pageInputs = documents.map((document, index) => ({
      ...document,
      url: document.url || `source://${sourceId}/document/${index + 1}`,
      fingerprint: crypto.createHash('sha256').update(`${document.title}\n${document.content}`).digest('hex'),
    }));
    const currentPages = await query(
      `SELECT * FROM knowledge_page_versions
       WHERE source_id=$1 AND organization_id=$2 AND is_current=TRUE AND change_type<>'deleted'`,
      [sourceId, orgId]
    );
    const previousByUrl = new Map(currentPages.rows.map((row) => [String(row.url), row]));
    const currentUrls = new Set(pageInputs.map((page) => page.url));
    const pageChanges = pageInputs.map((page) => ({
      page,
      previous: previousByUrl.get(page.url),
      changeType: !previousByUrl.has(page.url)
        ? 'added'
        : String(previousByUrl.get(page.url)?.fingerprint) === page.fingerprint ? 'unchanged' : 'changed',
    }));
    const deletedPages = currentPages.rows.filter((row) => !currentUrls.has(String(row.url)));
    const added = pageChanges.filter((change) => change.changeType === 'added').length;
    const changed = pageChanges.filter((change) => change.changeType === 'changed').length;
    const deleted = deletedPages.length;
    const totalChanges = added + changed + deleted;
    const sourceVersion = previousVersion + (totalChanges > 0 ? 1 : 0);
    const sourceFingerprint = crypto.createHash('sha256').update(
      pageInputs.map((page) => `${page.url}:${page.fingerprint}`).sort().join('\n')
    ).digest('hex');
    const prepared = documents.flatMap((document) => chunkText(document.content).map((content, index) => ({
      title: document.title, content, url: document.url || null,
      metadata: { ...(document.metadata || {}), document_title: document.title, chunk_index: index },
      tokens: Math.ceil(content.length / 4), chunkIndex: index,
    })));
    if (prepared.length === 0) throw new AppError(400, 'Knowledge source produced no chunks', 'KNOWLEDGE_EMPTY_SOURCE');

    const totalTokens = prepared.reduce((sum, item) => sum + item.tokens, 0);
    const itemIds = await transaction(async (client) => {
      for (const change of pageChanges.filter((entry) => entry.changeType !== 'unchanged')) {
        if (change.previous) {
          await client.query('UPDATE knowledge_page_versions SET is_current=FALSE WHERE id=$1', [change.previous.id]);
        }
        await client.query(
          `INSERT INTO knowledge_page_versions
             (organization_id,source_id,url,page_version,source_version,fingerprint,title,content,metadata,change_type,is_current)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)`,
          [
            orgId, sourceId, change.page.url, Number(change.previous?.page_version || 0) + 1,
            sourceVersion, change.page.fingerprint, change.page.title, change.page.content,
            JSON.stringify(change.page.metadata || {}), change.changeType,
          ]
        );
      }
      for (const previous of deletedPages) {
        await client.query('UPDATE knowledge_page_versions SET is_current=FALSE WHERE id=$1', [previous.id]);
        await client.query(
          `INSERT INTO knowledge_page_versions
             (organization_id,source_id,url,page_version,source_version,fingerprint,title,content,metadata,change_type,is_current)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,'deleted',TRUE)`,
          [orgId, sourceId, previous.url, Number(previous.page_version || 0) + 1, sourceVersion, previous.fingerprint, previous.title, JSON.stringify({ deleted_at: new Date().toISOString() })]
        );
      }
      await client.query('DELETE FROM knowledge_items WHERE source_id=$1 AND organization_id=$2', [sourceId, orgId]);
      const ids: string[] = [];
      for (const item of prepared) {
        const inserted = await client.query(
          `INSERT INTO knowledge_items
             (organization_id,source_id,title,content,content_type,url,metadata,tokens,chunk_index)
           VALUES ($1,$2,$3,$4,'text',$5,$6,$7,$8) RETURNING id`,
          [orgId, sourceId, item.title, item.content, item.url, JSON.stringify(item.metadata), item.tokens, item.chunkIndex]
        );
        ids.push(String(inserted.rows[0].id));
      }
      await client.query(
        `UPDATE knowledge_sources SET status='active',item_count=$1,total_tokens=$2,last_synced_at=NOW(),
           last_success_at=NOW(),consecutive_failures=0,content_fingerprint=$3,knowledge_version=$4,
           stale_after=NOW() + (refresh_interval_minutes || ' minutes')::interval,
           next_refresh_at=NOW() + (refresh_interval_minutes || ' minutes')::interval,
           error_message=NULL,updated_at=NOW()
         WHERE id=$5 AND organization_id=$6`,
        [prepared.length, totalTokens, sourceFingerprint, sourceVersion, sourceId, orgId]
      );
      await client.query(
        `UPDATE knowledge_sync_runs SET status=$1,resulting_version=$2,pages_seen=$3,pages_added=$4,
           pages_changed=$5,pages_deleted=$6,completed_at=NOW() WHERE id=$7`,
        [totalChanges > 0 ? 'completed' : 'unchanged', sourceVersion, pageInputs.length, added, changed, deleted, syncRun.rows[0].id]
      );
      if (totalChanges > 0) {
        await client.query(
          `INSERT INTO marketing_change_events
             (organization_id,source_type,source_id,event_type,materiality,summary,payload)
           VALUES ($1,'website',$2,'website_knowledge_changed','material',$3,$4)`,
          [orgId, sourceId, `Knowledge changed: ${added} added, ${changed} changed, ${deleted} deleted page(s)`, JSON.stringify({ source_version: sourceVersion, pages_added: added, pages_changed: changed, pages_deleted: deleted })]
        );
      }
      return ids;
    });

    let embeddingCount = 0;
    try {
      for (let start = 0; start < prepared.length; start += 20) {
        const batch = prepared.slice(start, start + 20);
        const embeddings = await vectorService.generateEmbeddings(batch.map((item) => item.content), orgId);
        for (let index = 0; index < embeddings.length; index++) {
          await vectorService.storeEmbedding(itemIds[start + index], embeddings[index]);
          embeddingCount++;
        }
      }
    } catch (error) {
      logger.warn(`Knowledge source ${sourceId} indexed without embeddings`, error);
    }

    return { documents: documents.length, items: prepared.length, tokens: totalTokens, embeddings: embeddingCount, version: sourceVersion, changes: totalChanges };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knowledge ingestion failed';
    await query(
      `UPDATE knowledge_sources SET status='error',error_message=$1,consecutive_failures=consecutive_failures+1,
         next_refresh_at=NOW() + (LEAST(1440,POWER(2,LEAST(consecutive_failures+1,8))::int * 15) || ' minutes')::interval,
         updated_at=NOW() WHERE id=$2 AND organization_id=$3`,
      [message, sourceId, orgId]
    );
    await query("UPDATE knowledge_sync_runs SET status='failed',error_message=$1,completed_at=NOW() WHERE id=$2", [message.slice(0, 2000), syncRun.rows[0].id]);
    throw error;
  }
}

export async function hybridSearch(orgId: string, searchText: string, limit = 10): Promise<Array<Record<string, unknown>>> {
  const maxResults = Math.max(1, Math.min(limit, 50));
  const lexical = await query(
    `SELECT ki.id,ki.source_id,ki.title,ki.content,ki.url,ki.metadata,
       ts_rank(to_tsvector('simple',COALESCE(ki.title,'') || ' ' || COALESCE(ki.content,'')),plainto_tsquery('simple',$2)) AS lexical_score
     FROM knowledge_items ki
     WHERE ki.organization_id=$1
       AND to_tsvector('simple',COALESCE(ki.title,'') || ' ' || COALESCE(ki.content,'')) @@ plainto_tsquery('simple',$2)
     ORDER BY lexical_score DESC,ki.updated_at DESC LIMIT $3`,
    [orgId, searchText, maxResults]
  );

  const combined = new Map<string, Record<string, unknown>>();
  for (const row of lexical.rows) combined.set(String(row.id), { ...row, score: Number(row.lexical_score || 0), match_type: 'keyword' });

  try {
    const embedding = await vectorService.generateEmbedding(searchText, orgId);
    for (const row of await vectorService.similaritySearch(orgId, embedding, maxResults, 0)) {
      const existing = combined.get(row.id);
      combined.set(row.id, {
        ...(existing || row), ...row,
        score: Math.max(Number(existing?.score || 0), row.similarity),
        match_type: existing ? 'hybrid' : 'semantic',
      });
    }
  } catch (error) {
    logger.warn('Semantic knowledge search unavailable; returning keyword results', error);
  }

  if (combined.size === 0) {
    const fallback = await query(
      `SELECT id,source_id,title,content,url,metadata,0.01 AS score,'substring' AS match_type
       FROM knowledge_items WHERE organization_id=$1 AND (title ILIKE $2 OR content ILIKE $2)
       ORDER BY updated_at DESC LIMIT $3`,
      [orgId, `%${searchText}%`, maxResults]
    );
    return fallback.rows;
  }

  return [...combined.values()].sort((left, right) => Number(right.score || 0) - Number(left.score || 0)).slice(0, maxResults);
}
