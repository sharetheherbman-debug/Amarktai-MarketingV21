import { logger } from '../utils/logger';
import * as knowledgeService from './knowledge.service';
import * as vectorService from './vector.service';
import { AppError } from '../middleware/errorHandler';

interface CrawlResult {
  url: string;
  title: string;
  content: string;
  links: string[];
  statusCode: number;
}

interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  followLinks?: boolean;
}

const DEFAULT_OPTIONS: Required<CrawlOptions> = {
  maxPages: 50,
  maxDepth: 3,
  includePatterns: [],
  excludePatterns: [],
  followLinks: true,
};

const REQUEST_TIMEOUT_MS = 15000;
const CHUNK_MAX_TOKENS = 500;

// ─── Public API ──────────────────────────────────────────────────────────────

export async function crawlWebsite(
  sourceId: string,
  orgId: string,
  url: string,
  options?: CrawlOptions
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url, depth: 0 }];
  let totalChunks = 0;

  try {
    await knowledgeService.updateSourceStatus(sourceId, 'crawling');
    await knowledgeService.deleteItemsBySource(sourceId);

    const baseDomain = new URL(url).hostname;

    while (queue.length > 0 && visited.size < opts.maxPages) {
      const { url: currentUrl, depth } = queue.shift()!;

      if (visited.has(currentUrl)) continue;
      if (depth > opts.maxDepth) continue;

      if (opts.excludePatterns.length > 0 && matchesPatterns(currentUrl, opts.excludePatterns)) {
        continue;
      }
      if (opts.includePatterns.length > 0 && !matchesPatterns(currentUrl, opts.includePatterns)) {
        continue;
      }

      visited.add(currentUrl);

      try {
        const result = await fetchPage(currentUrl);

        if (result.statusCode >= 400) {
          logger.warn(`Crawl skipped ${currentUrl}: HTTP ${result.statusCode}`);
          continue;
        }

        const { title, content, links } = await extractText(result.content, currentUrl);

        if (!content || content.trim().length === 0) {
          continue;
        }

        const chunks = chunkText(content, CHUNK_MAX_TOKENS);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const tokens = countTokens(chunk);

          await knowledgeService.createItem(orgId, sourceId, {
            title: chunks.length > 1 ? `${title} [${i + 1}/${chunks.length}]` : title,
            content: chunk,
            content_type: 'webpage',
            url: currentUrl,
            metadata: { depth, chunkIndex: i, totalChunks: chunks.length },
            tokens,
            chunk_index: i,
          });

          totalChunks++;
        }

        if (opts.followLinks && depth < opts.maxDepth) {
          for (const link of links) {
            try {
              const linkDomain = new URL(link).hostname;
              if (linkDomain === baseDomain && !visited.has(link)) {
                queue.push({ url: link, depth: depth + 1 });
              }
            } catch {
              // invalid URL, skip
            }
          }
        }
      } catch (error) {
        logger.warn(`Failed to crawl ${currentUrl}: ${error}`);
      }
    }

    await knowledgeService.updateSourceStatus(sourceId, 'completed');
    logger.info(`Crawl completed for source ${sourceId}: ${totalChunks} chunks from ${visited.size} pages`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown crawl error';
    await knowledgeService.updateSourceStatus(sourceId, 'failed', message);
    logger.error(`Crawl failed for source ${sourceId}: ${message}`);
    throw new AppError(500, `Crawl failed: ${message}`, 'CRAWL_ERROR');
  }
}

export async function parsePdf(buffer: Buffer): Promise<{ title: string; content: string }[]> {
  const text = extractPdfText(buffer);
  const title = 'Imported PDF';
  const chunks = chunkText(text, CHUNK_MAX_TOKENS);
  return chunks.map((chunk) => ({ title, content: chunk }));
}

export async function parseDocument(
  content: string,
  filename: string
): Promise<{ title: string; content: string }[]> {
  const title = filename.replace(/\.[^/.]+$/, '');
  const chunks = chunkText(content, CHUNK_MAX_TOKENS);
  return chunks.map((chunk) => ({ title, content: chunk }));
}

// ─── Internal: HTTP fetching ─────────────────────────────────────────────────

async function fetchPage(url: string): Promise<CrawlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AmarktAI-Crawler/1.0',
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
      redirect: 'follow',
    });

    const statusCode = response.status;
    const html = await response.text();

    return { url, title: '', content: html, links: [], statusCode };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Internal: HTML parsing (regex-based, no dependencies) ───────────────────

async function extractText(
  html: string,
  url: string
): Promise<{ title: string; content: string; links: string[] }> {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : url;

  const links: string[] = [];
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["'][^>]*>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    try {
      const href = linkMatch[1];
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
        continue;
      }
      const absoluteUrl = new URL(href, url).toString();
      links.push(absoluteUrl);
    } catch {
      // invalid URL, skip
    }
  }

  let content = html;

  content = content.replace(/<script[\s\S]*?<\/script>/gi, '');
  content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
  content = content.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  content = content.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  content = content.replace(/<header[\s\S]*?<\/header>/gi, '');

  content = content.replace(/<br\s*\/?>/gi, '\n');
  content = content.replace(/<\/p>/gi, '\n\n');
  content = content.replace(/<\/div>/gi, '\n');
  content = content.replace(/<\/li>/gi, '\n');
  content = content.replace(/<\/h[1-6]>/gi, '\n\n');
  content = content.replace(/<hr\s*\/?>/gi, '\n\n');

  content = content.replace(/<[^>]+>/g, ' ');

  content = decodeEntities(content);

  content = content.replace(/[ \t]+/g, ' ');
  content = content.replace(/\n{3,}/g, '\n\n');
  content = content.replace(/^\s+|\s+$/gm, '');
  content = content.trim();

  return { title, content, links };
}

// ─── Internal: Text chunking ─────────────────────────────────────────────────

function chunkText(text: string, maxTokens: number = CHUNK_MAX_TOKENS): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = '';
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = countTokens(paragraph);

    if (paragraphTokens > maxTokens) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
        currentTokens = 0;
      }

      const sentences = splitIntoChunks(paragraph, maxTokens);
      chunks.push(...sentences);
      continue;
    }

    if (currentTokens + paragraphTokens > maxTokens && currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentTokens = 0;
    }

    currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    currentTokens += paragraphTokens;
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function splitIntoChunks(text: string, maxTokens: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (countTokens(test) > maxTokens && current) {
      chunks.push(current);
      current = word;
    } else {
      current = test;
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current);
  }

  return chunks;
}

// ─── Internal: Token counting (approximate) ──────────────────────────────────

function countTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ─── Internal: Utilities ─────────────────────────────────────────────────────

function matchesPatterns(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(url);
    } catch {
      return url.includes(pattern);
    }
  });
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function extractPdfText(buffer: Buffer): string {
  const text = buffer.toString('latin1');
  let content = '';

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(text)) !== null) {
    const stream = match[1];
    const textMatches = stream.match(/\(([^)]*)\)/g);
    if (textMatches) {
      for (const tm of textMatches) {
        content += tm.slice(1, -1) + ' ';
      }
    }
  }

  const tjRegex = /\[(.*?)\]\s*TJ/g;
  let tjMatch: RegExpExecArray | null;
  while ((tjMatch = tjRegex.exec(text)) !== null) {
    const inner = tjMatch[1];
    const strMatches = inner.match(/\(([^)]*)\)/g);
    if (strMatches) {
      for (const sm of strMatches) {
        content += sm.slice(1, -1) + ' ';
      }
    }
  }

  content = content.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, ' ');
  return content.trim() || 'Unable to extract PDF text content.';
}
