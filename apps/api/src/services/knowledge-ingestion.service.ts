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

export interface WebsiteCandidate {
  url: string;
  hostname: string;
  linkedFrom: string[];
  occurrences: number;
  relationship: 'subdomain' | 'linked_domain';
}

export interface WebsiteCrawlIssue {
  url: string;
  reason: string;
}

export interface WebsiteCrawlResult {
  documents: DocumentInput[];
  candidates: WebsiteCandidate[];
  issues: WebsiteCrawlIssue[];
  pagesVisited: number;
  pagesAccepted: number;
  bytesFetched: number;
  sitemapUrls: number;
}

interface WebsiteCollectOptions {
  maxPages?: number;
  maxDepth?: number;
  includeSubdomains?: boolean;
  totalByteLimit?: number;
}

const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|msclkid|mc_cid|mc_eid|ref_src|ref_url)$/i;
const NOISE_PATH = /\/(?:login|log-in|signin|sign-in|signup|sign-up|register|password|reset-password|account|admin|dashboard|checkout|cart|basket|wp-admin|wp-login|feed|tag|author|search)(?:\/|$)/i;
const LOW_VALUE_EXT = /\.(?:jpg|jpeg|png|gif|webp|svg|ico|css|js|map|woff2?|ttf|eot|zip|mp4|mp3|mov|avi|webm)(?:$|\?)/i;
const SOCIAL_HOST = /(^|\.)(?:facebook\.com|instagram\.com|linkedin\.com|youtube\.com|youtu\.be|tiktok\.com|x\.com|twitter\.com|pinterest\.com|reddit\.com)$/i;
const HIGH_VALUE_PATH = /\/(?:about|features?|services?|products?|solutions?|pricing|plans?|faq|contact|case-stud(?:y|ies)|testimonials?|courses?|academy|shop)(?:\/|$)/i;
const MAX_SITEMAPS = 20;
const MAX_SITEMAP_URLS = 1000;

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

export function normalizeKnowledgeUrl(value: string, base?: string | URL): string {
  const url = base ? new URL(value, base) : new URL(value);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  return url.toString();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function removeBoilerplate(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<([a-z0-9]+)\b[^>]*(?:id|class)=["'][^"']*(?:cookie|consent|newsletter-popup|modal-overlay)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi, ' ');
}

function htmlToText(html: string): string {
  return decodeHtml(
    removeBoilerplate(html)
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, _level, text) => `\n\nHEADING: ${text}\n`)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|article|section|li|dt|dd)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim()
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

function structuredDataFacts(html: string): string[] {
  const values: string[] = [];
  const visit = (record: unknown, depth = 0): void => {
    if (!record || typeof record !== 'object' || depth > 4) return;
    if (Array.isArray(record)) { for (const value of record.slice(0, 100)) visit(value, depth + 1); return; }
    const item = record as Record<string, unknown>;
    for (const key of ['name', 'description', 'slogan', 'serviceType', 'category', 'price', 'priceCurrency', 'availability']) {
      if (typeof item[key] === 'string' || typeof item[key] === 'number') values.push(`${key}: ${String(item[key])}`);
    }
    for (const key of ['offers', 'mainEntity', 'hasOfferCatalog', 'itemListElement', '@graph']) visit(item[key], depth + 1);
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* Invalid first-party structured data is ignored. */ }
  }
  return [...new Set(values)].slice(0, 150);
}

function pageHeadings(html: string): string[] {
  return [...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map((match) => htmlToText(match[1]).trim()).filter(Boolean).slice(0, 80);
}

function pageCtas(html: string): string[] {
  const ctas = [
    ...html.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi),
  ].map((match) => htmlToText(match[1]).trim())
    .filter((value) => value.length >= 2 && value.length <= 120);
  return [...new Set(ctas)].slice(0, 40);
}

function metadataText(html: string, fallback: string): string {
  return [...new Set([
    htmlTitle(html, fallback),
    firstMetaContent(html, ['description', 'og:description', 'twitter:description']),
    firstMetaContent(html, ['og:site_name']),
    ...structuredDataFacts(html),
  ].map((value) => value.trim()).filter(Boolean))].join('\n\n');
}

function canonicalFromHtml(html: string, fallback: URL): URL {
  const match = html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i);
  try { return new URL(match?.[1] || fallback.toString(), fallback); } catch { return fallback; }
}

function robotsAllows(robots: string, path: string): boolean {
  let applies = false;
  let bestMatch = -1;
  let allowed = true;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const key = field?.toLowerCase();
    if (key === 'user-agent') { applies = value === '*' || /amarktai-marketing-knowledgebot/i.test(value); continue; }
    if (!applies || !['allow', 'disallow'].includes(key || '') || !value) continue;
    if (path.startsWith(value) && value.length >= bestMatch) {
      bestMatch = value.length;
      allowed = key === 'allow';
    }
  }
  return allowed;
}

function robotsSitemaps(robots: string, root: URL): string[] {
  return robots.split(/\r?\n/).flatMap((raw) => {
    const match = raw.replace(/#.*/, '').match(/^\s*sitemap\s*:\s*(.+)$/i);
    if (!match) return [];
    try { return [normalizeKnowledgeUrl(match[1].trim(), root)]; } catch { return []; }
  });
}

function xmlLocations(xml: string, root: URL): string[] {
  return [...xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)].flatMap((match) => {
    try { return [normalizeKnowledgeUrl(decodeHtml(match[1].trim()), root)]; } catch { return []; }
  });
}

function linksFromHtml(html: string, baseUrl: URL): string[] {
  const links = new Set<string>();
  const pattern = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      links.add(normalizeKnowledgeUrl(url.toString()));
    } catch { /* Ignore invalid links. */ }
  }
  return [...links];
}

function allowedHost(url: URL, root: URL, includeSubdomains: boolean): boolean {
  return url.hostname === root.hostname || (includeSubdomains && url.hostname.endsWith(`.${root.hostname}`));
}

function crawlableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (LOW_VALUE_EXT.test(url.pathname)) return false;
    if (NOISE_PATH.test(url.pathname)) return false;
    if ([...url.searchParams.keys()].some((key) => /^(replytocom|preview|share|print)$/i.test(key))) return false;
    return true;
  } catch { return false; }
}

function pagePriority(url: URL, depth: number): number {
  if (url.pathname === '/' || url.pathname === '') return 1000;
  let score = Math.max(0, 500 - depth * 80);
  if (HIGH_VALUE_PATH.test(url.pathname)) score += 350;
  if (/\/(?:privacy|terms|cookies?|legal)(?:\/|$)/i.test(url.pathname)) score -= 250;
  score -= Math.min(200, url.pathname.split('/').filter(Boolean).length * 20);
  return score;
}

function pageType(url: URL): string {
  const path = url.pathname.toLowerCase();
  if (path === '/' || !path) return 'home';
  for (const type of ['about', 'pricing', 'faq', 'contact', 'course', 'academy', 'shop', 'product', 'service', 'feature', 'solution']) {
    if (path.includes(type)) return type;
  }
  if (/\/(blog|news|resources?)\//.test(path)) return 'resource';
  return 'page';
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

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<{ finalUrl: string; contentType: string; text: string; bytes: number }> {
  const response = await safeFetch(url, {
    headers: {
      'User-Agent': 'AmarktAI-Marketing-KnowledgeBot/1.0',
      Accept: 'text/html,application/xhtml+xml,application/json,text/plain,application/xml,text/xml;q=0.9,*/*;q=0.8',
      ...headers,
    },
    timeoutMs: 30000,
    maxRedirects: 5,
    maxResponseBytes: 10 * 1024 * 1024,
  });
  const text = await response.text();
  if (!response.ok) throw new AppError(502, `Knowledge source returned HTTP ${response.status}`, 'KNOWLEDGE_FETCH_FAILED');
  return { finalUrl: normalizeKnowledgeUrl(response.url || url), contentType: response.headers.get('content-type') || '', text, bytes: Buffer.byteLength(text, 'utf8') };
}

async function collectSitemapPages(root: URL, robots: string, includeSubdomains: boolean): Promise<{ urls: string[]; sitemapCount: number }> {
  const queue = [...new Set([...robotsSitemaps(robots, root), normalizeKnowledgeUrl('/sitemap.xml', root)])];
  const visited = new Set<string>();
  const pages = new Set<string>();
  while (queue.length > 0 && visited.size < MAX_SITEMAPS && pages.size < MAX_SITEMAP_URLS) {
    const sitemapUrl = queue.shift()!;
    if (visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    try {
      const sitemap = await fetchText(sitemapUrl);
      if (!/(?:xml|text)/i.test(sitemap.contentType) && !/<(?:urlset|sitemapindex)\b/i.test(sitemap.text)) continue;
      for (const location of xmlLocations(sitemap.text, root)) {
        let parsed: URL;
        try { parsed = new URL(location); } catch { continue; }
        if (!allowedHost(parsed, root, includeSubdomains)) continue;
        if (/<sitemapindex\b/i.test(sitemap.text) || /\.xml(?:$|\?)/i.test(parsed.pathname)) {
          if (!visited.has(location) && queue.length < MAX_SITEMAPS * 3) queue.push(location);
        } else if (crawlableUrl(location)) pages.add(location);
        if (pages.size >= MAX_SITEMAP_URLS) break;
      }
    } catch { /* Sitemap discovery is opportunistic; normal link crawling continues. */ }
  }
  return { urls: [...pages], sitemapCount: visited.size };
}

export async function collectWebsiteDocumentsDetailed(
  sourceUrl: string,
  options: WebsiteCollectOptions = {}
): Promise<WebsiteCrawlResult> {
  const validated = await validatePublicHttpUrl(sourceUrl);
  const root = new URL(normalizeKnowledgeUrl(validated.toString()));
  const maxPages = Math.max(1, Math.min(Number(options.maxPages || 25), 100));
  const maxDepth = Math.max(0, Math.min(Number(options.maxDepth ?? 4), 8));
  const includeSubdomains = options.includeSubdomains === true;
  const totalByteLimit = Math.max(1024 * 1024, Math.min(Number(options.totalByteLimit || 30 * 1024 * 1024), 100 * 1024 * 1024));
  let robots = '';
  try { robots = (await fetchText(normalizeKnowledgeUrl('/robots.txt', root))).text; } catch { /* Missing robots does not prohibit crawling. */ }
  const sitemap = await collectSitemapPages(root, robots, includeSubdomains);
  const queue: Array<{ url: string; depth: number; priority: number }> = [];
  const queued = new Set<string>();
  const enqueue = (value: string, depth: number) => {
    let normalized: string;
    try { normalized = normalizeKnowledgeUrl(value, root); } catch { return; }
    if (queued.has(normalized) || !crawlableUrl(normalized)) return;
    const parsed = new URL(normalized);
    if (!allowedHost(parsed, root, includeSubdomains)) return;
    queued.add(normalized);
    queue.push({ url: normalized, depth, priority: pagePriority(parsed, depth) });
  };
  enqueue(root.toString(), 0);
  for (const url of sitemap.urls) enqueue(url, Math.min(1, maxDepth));

  const visited = new Set<string>();
  const acceptedUrls = new Set<string>();
  const contentFingerprints = new Set<string>();
  const documents: DocumentInput[] = [];
  const issues: WebsiteCrawlIssue[] = [];
  const candidates = new Map<string, { urls: Set<string>; from: Set<string>; occurrences: number; relationship: 'subdomain' | 'linked_domain' }>();
  let bytesFetched = 0;

  while (queue.length > 0 && documents.length < maxPages && visited.size < maxPages * 4 && bytesFetched < totalByteLimit) {
    queue.sort((left, right) => right.priority - left.priority);
    const current = queue.shift()!;
    queued.delete(current.url);
    if (visited.has(current.url) || current.depth > maxDepth) continue;
    visited.add(current.url);
    const requested = new URL(current.url);
    if (!robotsAllows(robots, requested.pathname)) { issues.push({ url: current.url, reason: 'blocked_by_robots' }); continue; }
    try {
      const response = await fetchText(current.url);
      bytesFetched += response.bytes;
      if (bytesFetched > totalByteLimit) { issues.push({ url: current.url, reason: 'crawl_byte_limit_reached' }); break; }
      const currentUrl = new URL(response.finalUrl);
      if (!allowedHost(currentUrl, root, includeSubdomains)) { issues.push({ url: current.url, reason: 'redirected_outside_approved_site' }); continue; }
      if (response.contentType.includes('html') || /<html\b/i.test(response.text)) {
        const canonical = canonicalFromHtml(response.text, currentUrl);
        const canonicalNormalized = normalizeKnowledgeUrl(canonical.toString());
        if (!allowedHost(new URL(canonicalNormalized), root, includeSubdomains)) { issues.push({ url: current.url, reason: 'external_canonical' }); continue; }
        const visible = htmlToText(response.text);
        const metadata = metadataText(response.text, currentUrl.pathname || 'Home');
        const content = [metadata, visible].filter(Boolean).join('\n\n').trim();
        if (content.length >= 40) {
          const fingerprint = crypto.createHash('sha256').update(content).digest('hex');
          if (!acceptedUrls.has(canonicalNormalized) && !contentFingerprints.has(fingerprint)) {
            acceptedUrls.add(canonicalNormalized);
            contentFingerprints.add(fingerprint);
            documents.push({
              title: htmlTitle(response.text, currentUrl.pathname || 'Home'),
              content,
              url: canonicalNormalized,
              rawHtml: response.text,
              metadata: {
                source_type: 'website',
                canonical_url: canonicalNormalized,
                page_type: pageType(currentUrl),
                headings: pageHeadings(response.text),
                calls_to_action: pageCtas(response.text),
                rendered_fallback_needed: visible.length < 80,
                extraction: visible.length >= 80 ? 'structured_visible_html_and_metadata' : 'metadata_and_structured_data',
                content_hash: fingerprint,
              },
            });
          }
        } else {
          issues.push({ url: current.url, reason: 'insufficient_public_content' });
        }
        for (const link of linksFromHtml(response.text, currentUrl)) {
          const next = new URL(link);
          if (allowedHost(next, root, includeSubdomains)) {
            if (current.depth < maxDepth) enqueue(link, current.depth + 1);
            continue;
          }
          if (SOCIAL_HOST.test(next.hostname)) continue;
          const hostname = next.hostname.toLowerCase();
          const existing = candidates.get(hostname) || { urls: new Set<string>(), from: new Set<string>(), occurrences: 0, relationship: hostname.endsWith(`.${root.hostname}`) ? 'subdomain' as const : 'linked_domain' as const };
          existing.urls.add(link);
          existing.from.add(currentUrl.toString());
          existing.occurrences += 1;
          candidates.set(hostname, existing);
        }
      } else if (/^(text\/plain|application\/json)/i.test(response.contentType)) {
        const content = response.text.trim();
        if (content.length >= 40) {
          const fingerprint = crypto.createHash('sha256').update(content).digest('hex');
          if (!contentFingerprints.has(fingerprint)) {
            contentFingerprints.add(fingerprint);
            documents.push({
              title: currentUrl.pathname.split('/').filter(Boolean).pop() || 'Website',
              content,
              url: response.finalUrl,
              metadata: { source_type: 'website', content_type: response.contentType, page_type: 'data', content_hash: fingerprint },
            });
          }
        }
      } else {
        issues.push({ url: current.url, reason: `unsupported_content_type:${response.contentType || 'unknown'}` });
      }
    } catch (error) {
      issues.push({ url: current.url, reason: error instanceof Error ? error.message.slice(0, 300) : 'fetch_failed' });
      logger.warn(`Knowledge crawl skipped ${current.url}: ${error}`);
    }
  }

  if (documents.length === 0) throw new AppError(422, 'We could not read useful public information from this website. Add another public source or provide business information manually.', 'KNOWLEDGE_EMPTY_SOURCE');
  return {
    documents,
    candidates: [...candidates.entries()]
      .map(([hostname, value]) => ({ url: [...value.urls][0], hostname, linkedFrom: [...value.from].slice(0, 10), occurrences: value.occurrences, relationship: value.relationship }))
      .sort((left, right) => Number(right.relationship === 'subdomain') - Number(left.relationship === 'subdomain') || right.occurrences - left.occurrences)
      .slice(0, 30),
    issues: issues.slice(0, 100),
    pagesVisited: visited.size,
    pagesAccepted: documents.length,
    bytesFetched,
    sitemapUrls: sitemap.urls.length,
  };
}

export async function collectWebsiteDocuments(sourceUrl: string, options: WebsiteCollectOptions = {}): Promise<DocumentInput[]> {
  return (await collectWebsiteDocumentsDetailed(sourceUrl, options)).documents;
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
      try { if (link?.[1]) itemUrl = normalizeKnowledgeUrl(link[1], sourceUrl); } catch { /* retain source URL */ }
      documents.push({ title, content, url: itemUrl, metadata: { source_type: 'rss' } });
    }
  }
  return documents;
}

async function collectDocuments(source: SourceRow): Promise<{ documents: DocumentInput[]; crawl?: WebsiteCrawlResult }> {
  const config = objectValue(source.config);
  let documents: DocumentInput[];
  let crawl: WebsiteCrawlResult | undefined;

  if (source.type === 'manual' || source.type === 'document') {
    const content = String(config.content || '').trim();
    if (!content) throw new AppError(400, `${source.type} sources require content`, 'KNOWLEDGE_CONTENT_REQUIRED');
    documents = [{ title: String(config.title || source.name), content, url: source.url || undefined, metadata: { source_type: source.type, filename: config.filename || null } }];
  } else if (source.type === 'api') {
    if (!source.url) throw new AppError(400, 'API sources require a URL', 'KNOWLEDGE_URL_REQUIRED');
    const response = await fetchText(source.url, stringHeaders(config.headers));
    let content = response.text;
    if (response.contentType.includes('json')) {
      try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* retain source text */ }
    }
    documents = [{ title: source.name, content, url: response.finalUrl, metadata: { source_type: 'api', content_type: response.contentType } }];
  } else if (source.type === 'rss') {
    if (!source.url) throw new AppError(400, 'RSS sources require a URL', 'KNOWLEDGE_URL_REQUIRED');
    const response = await fetchText(source.url);
    documents = parseRss(response.text, response.finalUrl);
    if (documents.length === 0) throw new AppError(400, 'RSS source contained no usable items', 'KNOWLEDGE_EMPTY_SOURCE');
  } else if (source.type === 'website') {
    if (!source.url) throw new AppError(400, 'Website sources require a URL', 'KNOWLEDGE_URL_REQUIRED');
    crawl = await collectWebsiteDocumentsDetailed(source.url, {
      maxPages: Math.max(1, Math.min(Number(config.max_pages || 25), 100)),
      maxDepth: Math.max(0, Math.min(Number(config.max_depth ?? 4), 8)),
      includeSubdomains: config.include_subdomains === true,
      totalByteLimit: Math.max(1024 * 1024, Math.min(Number(config.max_total_bytes || 30 * 1024 * 1024), 100 * 1024 * 1024)),
    });
    documents = crawl.documents;
  } else {
    throw new AppError(400, `Unsupported knowledge source type: ${source.type}`, 'KNOWLEDGE_TYPE_UNSUPPORTED');
  }

  const productScopes = Array.isArray(config.product_scopes) ? config.product_scopes.map(String).filter(Boolean).slice(0, 32) : [];
  return {
    documents: documents.map((document) => ({
      ...document,
      metadata: {
        ...(document.metadata || {}),
        source_name: source.name,
        source_relationship: config.relationship || null,
        product_scopes: productScopes,
        lifecycle_status: config.lifecycle_status || null,
        approved_web_estate: config.approved_web_estate === true,
      },
    })),
    crawl,
  };
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
    const collected = await collectDocuments(source);
    const documents = collected.documents;
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
    const sourceFingerprint = crypto.createHash('sha256').update(pageInputs.map((page) => `${page.url}:${page.fingerprint}`).sort().join('\n')).digest('hex');
    const crawlPatch = collected.crawl ? {
      last_crawl_summary: {
        pages_visited: collected.crawl.pagesVisited,
        pages_accepted: collected.crawl.pagesAccepted,
        bytes_fetched: collected.crawl.bytesFetched,
        sitemap_urls: collected.crawl.sitemapUrls,
        issue_count: collected.crawl.issues.length,
        issues: collected.crawl.issues.slice(0, 25),
        discovered_sites: collected.crawl.candidates,
        completed_at: new Date().toISOString(),
      },
    } : {};

    if (totalChanges === 0) {
      await transaction(async (client) => {
        await client.query(
          `UPDATE knowledge_sources SET status='active',last_synced_at=NOW(),last_success_at=NOW(),consecutive_failures=0,
             content_fingerprint=$1,stale_after=NOW() + (refresh_interval_minutes || ' minutes')::interval,
             next_refresh_at=NOW() + (refresh_interval_minutes || ' minutes')::interval,error_message=NULL,
             config=COALESCE(config,'{}'::jsonb) || $2::jsonb,updated_at=NOW()
           WHERE id=$3 AND organization_id=$4`,
          [sourceFingerprint, JSON.stringify(crawlPatch), sourceId, orgId]
        );
        await client.query(
          `UPDATE knowledge_sync_runs SET status='unchanged',resulting_version=$1,pages_seen=$2,completed_at=NOW() WHERE id=$3`,
          [sourceVersion, pageInputs.length, syncRun.rows[0].id]
        );
      });
      return {
        documents: documents.length,
        items: Number(sourceResult.rows[0].item_count || 0),
        tokens: Number(sourceResult.rows[0].total_tokens || 0),
        embeddings: 0,
        version: sourceVersion,
        changes: 0,
      };
    }

    const prepared = documents.flatMap((document) => chunkText(document.content).map((content, index) => ({
      title: document.title,
      content,
      url: document.url || null,
      metadata: { ...(document.metadata || {}), document_title: document.title, chunk_index: index },
      tokens: Math.ceil(content.length / 4),
      chunkIndex: index,
    })));
    if (prepared.length === 0) throw new AppError(400, 'Knowledge source produced no chunks', 'KNOWLEDGE_EMPTY_SOURCE');
    const totalTokens = prepared.reduce((sum, item) => sum + item.tokens, 0);

    const itemIds = await transaction(async (client) => {
      for (const change of pageChanges.filter((entry) => entry.changeType !== 'unchanged')) {
        if (change.previous) await client.query('UPDATE knowledge_page_versions SET is_current=FALSE WHERE id=$1', [change.previous.id]);
        await client.query(
          `INSERT INTO knowledge_page_versions
             (organization_id,source_id,url,page_version,source_version,fingerprint,title,content,metadata,change_type,is_current)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)`,
          [orgId, sourceId, change.page.url, Number(change.previous?.page_version || 0) + 1, sourceVersion, change.page.fingerprint, change.page.title, change.page.content, JSON.stringify(change.page.metadata || {}), change.changeType]
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
        `UPDATE knowledge_sources SET status='active',item_count=$1,total_tokens=$2,last_synced_at=NOW(),last_success_at=NOW(),
           consecutive_failures=0,content_fingerprint=$3,knowledge_version=$4,
           stale_after=NOW() + (refresh_interval_minutes || ' minutes')::interval,
           next_refresh_at=NOW() + (refresh_interval_minutes || ' minutes')::interval,
           error_message=NULL,config=COALESCE(config,'{}'::jsonb) || $5::jsonb,updated_at=NOW()
         WHERE id=$6 AND organization_id=$7`,
        [prepared.length, totalTokens, sourceFingerprint, sourceVersion, JSON.stringify(crawlPatch), sourceId, orgId]
      );
      await client.query(
        `UPDATE knowledge_sync_runs SET status='completed',resulting_version=$1,pages_seen=$2,pages_added=$3,
           pages_changed=$4,pages_deleted=$5,completed_at=NOW() WHERE id=$6`,
        [sourceVersion, pageInputs.length, added, changed, deleted, syncRun.rows[0].id]
      );
      await client.query(
        `INSERT INTO marketing_change_events
           (organization_id,source_type,source_id,event_type,materiality,summary,payload)
         VALUES ($1,$2,$3,'website_knowledge_changed','material',$4,$5)`,
        [orgId, source.type === 'website' ? 'website' : source.type, sourceId, `Knowledge changed: ${added} added, ${changed} changed, ${deleted} deleted page(s)`, JSON.stringify({ source_version: sourceVersion, pages_added: added, pages_changed: changed, pages_deleted: deleted })]
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

function metadataScopes(value: unknown): string[] {
  const metadata = objectValue(value);
  return Array.isArray(metadata.product_scopes) ? metadata.product_scopes.map(String).filter(Boolean) : [];
}

function filterByProductScopes(rows: Array<Record<string, unknown>>, productScopes: string[]): Array<Record<string, unknown>> {
  if (productScopes.length === 0) return rows;
  const wanted = new Set(productScopes.map((scope) => scope.toLowerCase()));
  return rows.filter((row) => {
    const scopes = metadataScopes(row.metadata).map((scope) => scope.toLowerCase());
    return scopes.length === 0 || scopes.some((scope) => wanted.has(scope));
  });
}

export async function hybridSearch(orgId: string, searchText: string, limit = 10, productScopes: string[] = []): Promise<Array<Record<string, unknown>>> {
  const maxResults = Math.max(1, Math.min(limit, 50));
  const fetchLimit = productScopes.length > 0 ? Math.min(100, maxResults * 4) : maxResults;
  const lexical = await query(
    `SELECT ki.id,ki.source_id,ki.title,ki.content,ki.url,ki.metadata,
       ts_rank(to_tsvector('simple',COALESCE(ki.title,'') || ' ' || COALESCE(ki.content,'')),plainto_tsquery('simple',$2)) AS lexical_score
     FROM knowledge_items ki
     WHERE ki.organization_id=$1
       AND to_tsvector('simple',COALESCE(ki.title,'') || ' ' || COALESCE(ki.content,'')) @@ plainto_tsquery('simple',$2)
     ORDER BY lexical_score DESC,ki.updated_at DESC LIMIT $3`,
    [orgId, searchText, fetchLimit]
  );
  const combined = new Map<string, Record<string, unknown>>();
  for (const row of lexical.rows) combined.set(String(row.id), { ...row, score: Number(row.lexical_score || 0), match_type: 'keyword' });
  try {
    const embedding = await vectorService.generateEmbedding(searchText, orgId);
    for (const row of await vectorService.similaritySearch(orgId, embedding, fetchLimit, 0)) {
      const existing = combined.get(row.id);
      combined.set(row.id, { ...(existing || row), ...row, score: Math.max(Number(existing?.score || 0), row.similarity), match_type: existing ? 'hybrid' : 'semantic' });
    }
  } catch (error) {
    logger.warn('Semantic knowledge search unavailable; returning keyword results', error);
  }
  let rows = filterByProductScopes([...combined.values()], productScopes);
  if (rows.length === 0) {
    const fallback = await query(
      `SELECT id,source_id,title,content,url,metadata,0.01 AS score,'substring' AS match_type
       FROM knowledge_items WHERE organization_id=$1 AND (title ILIKE $2 OR content ILIKE $2)
       ORDER BY updated_at DESC LIMIT $3`,
      [orgId, `%${searchText}%`, fetchLimit]
    );
    rows = filterByProductScopes(fallback.rows, productScopes);
  }
  return rows.sort((left, right) => Number(right.score || 0) - Number(left.score || 0)).slice(0, maxResults);
}
