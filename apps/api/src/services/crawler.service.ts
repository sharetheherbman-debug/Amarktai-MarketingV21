import { logger } from '../utils/logger';
import * as knowledgeService from './knowledge.service';
import { ingestSource, normalizeKnowledgeUrl } from './knowledge-ingestion.service';

interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  followLinks?: boolean;
}

const CHUNK_MAX_TOKENS = 500;

/**
 * Compatibility entry point retained for older callers.
 *
 * There is intentionally no independent website traversal here. Every website
 * sync is delegated to knowledge-ingestion.service.ts so robots, sitemap,
 * canonical, SSRF, deduplication, versioning and partial-failure rules have one
 * source of truth.
 */
export async function crawlWebsite(
  sourceId: string,
  orgId: string,
  url: string,
  options?: CrawlOptions
): Promise<void> {
  const source = await knowledgeService.getById(sourceId, orgId);
  const maxPages = Math.max(1, Math.min(Number(options?.maxPages ?? 50), 100));
  const requestedDepth = options?.followLinks === false ? 0 : Number(options?.maxDepth ?? 3);
  const maxDepth = Math.max(0, Math.min(requestedDepth, 8));
  const normalizedUrl = normalizeKnowledgeUrl(url);
  await knowledgeService.update(sourceId, orgId, {
    url: normalizedUrl,
    config: {
      ...(source.config || {}),
      max_pages: maxPages,
      max_depth: maxDepth,
      legacy_include_patterns: Array.isArray(options?.includePatterns) ? options!.includePatterns.slice(0, 50) : [],
      legacy_exclude_patterns: Array.isArray(options?.excludePatterns) ? options!.excludePatterns.slice(0, 50) : [],
    },
  });
  const result = await ingestSource(sourceId, orgId, 'manual');
  logger.info(`Legacy crawler entry point delegated to canonical ingestion for ${sourceId}: ${result.documents} document(s), ${result.changes} change(s)`);
}

export async function parsePdf(buffer: Buffer): Promise<{ title: string; content: string }[]> {
  const text = extractPdfText(buffer);
  const chunks = chunkText(text, CHUNK_MAX_TOKENS);
  return chunks.map((chunk) => ({ title: 'Imported PDF', content: chunk }));
}

export async function parseDocument(content: string, filename: string): Promise<{ title: string; content: string }[]> {
  const title = filename.replace(/\.[^/.]+$/, '');
  return chunkText(content, CHUNK_MAX_TOKENS).map((chunk) => ({ title, content: chunk }));
}

function chunkText(text: string, maxTokens: number): string[] {
  if (!text || text.trim().length === 0) return [];
  const paragraphs = text.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (countTokens(candidate) <= maxTokens) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current.trim());
    current = '';
    if (countTokens(paragraph) <= maxTokens) {
      current = paragraph;
      continue;
    }
    let part = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = part ? `${part} ${word}` : word;
      if (countTokens(next) > maxTokens && part) {
        chunks.push(part.trim());
        part = word;
      } else {
        part = next;
      }
    }
    current = part;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function countTokens(text: string): number {
  return text ? Math.ceil(text.length / 4) : 0;
}

function extractPdfText(buffer: Buffer): string {
  const text = buffer.toString('latin1');
  let content = '';
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(text)) !== null) {
    const strings = match[1].match(/\(([^)]*)\)/g) || [];
    for (const value of strings) content += `${value.slice(1, -1)} `;
  }
  const tjRegex = /\[(.*?)\]\s*TJ/g;
  let tjMatch: RegExpExecArray | null;
  while ((tjMatch = tjRegex.exec(text)) !== null) {
    const strings = tjMatch[1].match(/\(([^)]*)\)/g) || [];
    for (const value of strings) content += `${value.slice(1, -1)} `;
  }
  content = content.replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, ' ').trim();
  return content || 'Unable to extract PDF text content.';
}
