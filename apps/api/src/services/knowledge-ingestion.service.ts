import { query, transaction } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import * as vectorService from './vector.service';
import { safeFetch } from '../utils/safe-fetch';

interface SourceRow extends Record<string, unknown> {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  url: string | null;
  config: Record<string, unknown> | string;
}

interface DocumentInput {
  title: string;
  content: string;
  url?: string;
  metadata?: Record<string, unknown>;
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
      'User-Agent': 'AmarktAI-KnowledgeBot/1.0',
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
    const root = new URL(source.url);
    const maxPages = Math.max(1, Math.min(Number(config.max_pages || 10), 50));
    const includeSubdomains = config.include_subdomains === true;
    const queue = [root.toString()];
    const visited = new Set<string>();
    const documents: DocumentInput[] = [];

    while (queue.length > 0 && visited.size < maxPages) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const response = await fetchText(current);
      const currentUrl = new URL(response.finalUrl);
      if (response.contentType.includes('html') || /<html\b/i.test(response.text)) {
        const content = htmlToText(response.text);
        if (content.length >= 80) documents.push({ title: htmlTitle(response.text, currentUrl.pathname || source.name), content, url: response.finalUrl, metadata: { source_type: 'website' } });
        for (const link of linksFromHtml(response.text, currentUrl)) {
          const next = new URL(link);
          const sameHost = next.hostname === root.hostname || (includeSubdomains && next.hostname.endsWith(`.${root.hostname}`));
          if (sameHost && !visited.has(next.toString()) && !queue.includes(next.toString())) queue.push(next.toString());
        }
      } else {
        documents.push({ title: currentUrl.pathname.split('/').filter(Boolean).pop() || source.name, content: response.text, url: response.finalUrl, metadata: { source_type: 'website', content_type: response.contentType } });
      }
    }
    if (documents.length === 0) throw new AppError(400, 'Website crawl produced no indexable content', 'KNOWLEDGE_EMPTY_SOURCE');
    return documents;
  }

  throw new AppError(400, `Unsupported knowledge source type: ${source.type}`, 'KNOWLEDGE_TYPE_UNSUPPORTED');
}

export async function ingestSource(sourceId: string, orgId: string): Promise<{ documents: number; items: number; tokens: number; embeddings: number }> {
  const sourceResult = await query('SELECT * FROM knowledge_sources WHERE id=$1 AND organization_id=$2', [sourceId, orgId]);
  if (sourceResult.rows.length === 0) throw new AppError(404, 'Knowledge source not found', 'NOT_FOUND');
  const source = sourceResult.rows[0] as SourceRow;
  await query("UPDATE knowledge_sources SET status='syncing',error_message=NULL,updated_at=NOW() WHERE id=$1 AND organization_id=$2", [sourceId, orgId]);

  try {
    const documents = await collectDocuments(source);
    const prepared = documents.flatMap((document) => chunkText(document.content).map((content, index) => ({
      title: document.title, content, url: document.url || null,
      metadata: { ...(document.metadata || {}), document_title: document.title, chunk_index: index },
      tokens: Math.ceil(content.length / 4), chunkIndex: index,
    })));
    if (prepared.length === 0) throw new AppError(400, 'Knowledge source produced no chunks', 'KNOWLEDGE_EMPTY_SOURCE');

    const totalTokens = prepared.reduce((sum, item) => sum + item.tokens, 0);
    const itemIds = await transaction(async (client) => {
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
        `UPDATE knowledge_sources SET status='active',item_count=$1,total_tokens=$2,last_synced_at=NOW(),error_message=NULL,updated_at=NOW()
         WHERE id=$3 AND organization_id=$4`,
        [prepared.length, totalTokens, sourceId, orgId]
      );
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

    return { documents: documents.length, items: prepared.length, tokens: totalTokens, embeddings: embeddingCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knowledge ingestion failed';
    await query("UPDATE knowledge_sources SET status='error',error_message=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3", [message, sourceId, orgId]);
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
