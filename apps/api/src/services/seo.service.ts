import { query } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { generateGovernedText } from './governed-text-generation.service';
import { contextEngine } from './context-engine.service';
import { safeFetch } from '../utils/safe-fetch';

export interface SeoKeyword {
  id: string;
  organization_id: string;
  keyword: string;
  search_volume: number;
  difficulty: number;
  cpc_cents: number;
  intent: string | null;
  cluster_id: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SeoCluster {
  id: string;
  organization_id: string;
  name: string;
  pillar_page: string | null;
  description: string | null;
  keyword_count: number;
  created_at: string;
}

export interface SeoAudit {
  id: string;
  organization_id: string;
  url: string;
  score: number;
  issues: SeoIssue[];
  suggestions: string[];
  technical: Record<string, unknown>;
  performance: Record<string, unknown>;
  created_at: string;
}

export interface SeoIssue {
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  element?: string;
}

export interface KeywordResearchResult {
  keyword: string;
  search_volume: number;
  difficulty: number;
  cpc_cents: number;
  intent: string;
  related_keywords: string[];
  estimated: true;
}

function parseAiJson<T>(content: string, label: string): T {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned) as T; }
  catch {
    const objectStart = cleaned.indexOf('{');
    const arrayStart = cleaned.indexOf('[');
    const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
    const end = cleaned.startsWith('[', start) ? cleaned.lastIndexOf(']') : cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw new AppError(502, `AI provider returned invalid ${label} JSON`, 'AI_RESPONSE_INVALID');
    try { return JSON.parse(cleaned.slice(start, end + 1)) as T; }
    catch { throw new AppError(502, `AI provider returned invalid ${label} JSON`, 'AI_RESPONSE_INVALID'); }
  }
}

async function aiJson<T>(orgId: string, prompt: string, maxTokens: number, temperature: number, label: string): Promise<T> {
  const result = await generateGovernedText({
    organizationId: orgId,
    title: `Generate ${label}`,
    messages: [
      { role: 'system', content: 'Return only strict JSON. Do not wrap it in Markdown. Do not claim live external metrics unless they were provided.' },
      { role: 'user', content: prompt },
    ],
    maxTokens,
    temperature,
    payload: { purpose: label },
  });
  return parseAiJson<T>(result.content, label);
}

export async function researchKeywords(orgId: string, seed: string, count = 20): Promise<KeywordResearchResult[]> {
  const boundedCount = Math.max(1, Math.min(Number(count) || 20, 100));
  const context = await contextEngine.assemble({ orgId, includeBrandDna: true, includeKnowledge: true, knowledgeQuery: seed });
  const parsed = await aiJson<unknown>(orgId, `Generate ${boundedCount} SEO keyword ideas for "${seed}".
The search volume, difficulty and CPC values must be clearly treated as AI estimates rather than live keyword-tool data.
Return: [{"keyword":"...","search_volume":0,"difficulty":0,"cpc_cents":0,"intent":"informational|navigational|commercial|transactional","related_keywords":["..."]}]

${context.fullContext}`, 5000, 0.5, 'keyword research');
  if (!Array.isArray(parsed)) throw new AppError(502, 'AI keyword response must be an array', 'AI_RESPONSE_INVALID');
  const results = parsed.slice(0, boundedCount).flatMap((value): KeywordResearchResult[] => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const keyword = String(row.keyword || '').trim();
    if (!keyword) return [];
    return [{
      keyword,
      search_volume: Math.max(0, Math.round(Number(row.search_volume || 0))),
      difficulty: Math.max(0, Math.min(Number(row.difficulty || 0), 100)),
      cpc_cents: Math.max(0, Math.round(Number(row.cpc_cents || 0))),
      intent: ['informational', 'navigational', 'commercial', 'transactional'].includes(String(row.intent)) ? String(row.intent) : 'informational',
      related_keywords: Array.isArray(row.related_keywords) ? row.related_keywords.map(String).filter(Boolean).slice(0, 10) : [],
      estimated: true,
    }];
  });
  if (results.length === 0) throw new AppError(502, 'AI provider returned no usable keyword ideas', 'AI_RESPONSE_INVALID');
  return results;
}

export async function clusterKeywords(orgId: string, keywords: string[]): Promise<{ cluster: string; keywords: string[]; pillar_page: string }[]> {
  const unique = [...new Set(keywords.map((value) => value.trim()).filter(Boolean))].slice(0, 500);
  if (unique.length === 0) throw new AppError(400, 'At least one keyword is required', 'VALIDATION_ERROR');
  const parsed = await aiJson<unknown>(orgId, `Group these SEO keywords into coherent topic clusters:
${unique.join(', ')}
Return: [{"cluster":"...","keywords":["..."],"pillar_page":"..."}]`, 4000, 0.3, 'keyword cluster');
  if (!Array.isArray(parsed)) throw new AppError(502, 'AI cluster response must be an array', 'AI_RESPONSE_INVALID');
  const clusters = parsed.flatMap((value): { cluster: string; keywords: string[]; pillar_page: string }[] => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    const cluster = String(row.cluster || '').trim();
    const grouped = Array.isArray(row.keywords) ? row.keywords.map(String).filter((keyword) => unique.includes(keyword)) : [];
    if (!cluster || grouped.length === 0) return [];
    return [{ cluster, keywords: grouped, pillar_page: String(row.pillar_page || cluster).trim() }];
  });
  if (clusters.length === 0) throw new AppError(502, 'AI provider returned no usable keyword clusters', 'AI_RESPONSE_INVALID');
  return clusters;
}

export async function saveKeywords(orgId: string, keywords: Array<{ keyword: string; search_volume?: number; difficulty?: number; cpc_cents?: number; intent?: string; estimated?: boolean }>): Promise<void> {
  for (const keyword of keywords) {
    const name = String(keyword.keyword || '').trim();
    if (!name) continue;
    await query(
      `INSERT INTO seo_keywords (organization_id,keyword,search_volume,difficulty,cpc_cents,intent,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (organization_id,keyword) DO UPDATE SET
         search_volume=EXCLUDED.search_volume,difficulty=EXCLUDED.difficulty,cpc_cents=EXCLUDED.cpc_cents,
         intent=EXCLUDED.intent,metadata=EXCLUDED.metadata,updated_at=NOW()`,
      [
        orgId, name, Math.max(0, Number(keyword.search_volume || 0)), Math.max(0, Math.min(Number(keyword.difficulty || 0), 100)),
        Math.max(0, Number(keyword.cpc_cents || 0)), keyword.intent || null,
        JSON.stringify({ metrics_source: keyword.estimated === false ? 'external' : 'ai_estimate' }),
      ]
    );
  }
}

export async function listKeywords(orgId: string): Promise<SeoKeyword[]> {
  const result = await query('SELECT * FROM seo_keywords WHERE organization_id=$1 ORDER BY search_volume DESC,keyword', [orgId]);
  return result.rows.map(mapKeywordRow);
}

export async function auditUrl(orgId: string, url: string, userId: string): Promise<SeoAudit> {
  const response = await safeFetch(url, {
    headers: { 'User-Agent': 'AmarktAI-Marketing-SEO-Audit/1.0', Accept: 'text/html,application/xhtml+xml' },
    timeoutMs: 20000,
    maxResponseBytes: 5 * 1024 * 1024,
  });
  const html = await response.text();
  if (!response.ok) throw new AppError(502, `SEO audit URL returned HTTP ${response.status}`, 'SEO_URL_FETCH_FAILED');
  if (!String(response.headers.get('content-type') || '').toLowerCase().includes('html') && !/<html\b/i.test(html)) {
    throw new AppError(400, 'SEO audit URL did not return HTML', 'SEO_URL_NOT_HTML');
  }

  const issues: SeoIssue[] = [];
  const suggestions: string[] = [];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (!title) issues.push({ type: 'meta', severity: 'error', message: 'Missing title tag' });
  else {
    if (title.length < 30) issues.push({ type: 'meta', severity: 'warning', message: `Title too short (${title.length} characters). Aim for 30–60.` });
    if (title.length > 60) issues.push({ type: 'meta', severity: 'warning', message: `Title too long (${title.length} characters). Aim for 30–60.` });
  }
  const description = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim()
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1]?.trim();
  if (!description) issues.push({ type: 'meta', severity: 'warning', message: 'Missing meta description' });
  else {
    if (description.length < 120) issues.push({ type: 'meta', severity: 'info', message: `Meta description is short (${description.length} characters).` });
    if (description.length > 160) issues.push({ type: 'meta', severity: 'warning', message: `Meta description is long (${description.length} characters).` });
  }
  const headings = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || [];
  if (headings.length === 0) issues.push({ type: 'structure', severity: 'error', message: 'Missing H1 heading' });
  if (headings.length > 1) issues.push({ type: 'structure', severity: 'warning', message: `Multiple H1 headings found (${headings.length})` });
  const images = html.match(/<img\b[^>]*>/gi) || [];
  const missingAlt = images.filter((image) => !/\balt=["'][^"']*["']/i.test(image));
  if (missingAlt.length > 0) issues.push({ type: 'accessibility', severity: 'warning', message: `${missingAlt.length} images are missing alt attributes` });
  const hasSchema = /application\/ld\+json/i.test(html);
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html);
  const hasCanonical = /<link[^>]*rel=["'][^"']*canonical/i.test(html);
  if (!hasSchema) suggestions.push('Add relevant JSON-LD structured data');
  if (!hasViewport) issues.push({ type: 'mobile', severity: 'error', message: 'Missing viewport meta tag' });
  if (!hasCanonical) suggestions.push('Add a canonical URL');
  const internalLinks = html.match(/<a[^>]+href=["'](?:\/|#)[^"']*["']/gi) || [];
  if (internalLinks.length < 3) suggestions.push('Add more relevant internal links');

  const score = Math.max(0, 100 - issues.filter((issue) => issue.severity === 'error').length * 15 - issues.filter((issue) => issue.severity === 'warning').length * 5);
  return saveAudit(orgId, response.url, score, issues, suggestions, {
    hasSchema, hasViewport, hasCanonical, h1Count: headings.length, imageCount: images.length, imagesMissingAlt: missingAlt.length,
  }, { internalLinks: internalLinks.length, responseBytes: html.length, httpStatus: response.status }, userId);
}

async function saveAudit(orgId: string, url: string, score: number, issues: SeoIssue[], suggestions: string[], technical: Record<string, unknown>, performance: Record<string, unknown>, userId: string): Promise<SeoAudit> {
  const result = await query(
    `INSERT INTO seo_audits (organization_id,url,score,issues,suggestions,technical,performance,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [orgId, url, score, JSON.stringify(issues), JSON.stringify(suggestions), JSON.stringify(technical), JSON.stringify(performance), userId]
  );
  return mapAuditRow(result.rows[0]);
}

export async function listAudits(orgId: string): Promise<SeoAudit[]> {
  const result = await query('SELECT * FROM seo_audits WHERE organization_id=$1 ORDER BY created_at DESC', [orgId]);
  return result.rows.map(mapAuditRow);
}

export async function generateMeta(orgId: string, topic: string, keywords: string[]): Promise<{ titles: string[]; descriptions: string[]; schema: Record<string, unknown> }> {
  const parsed = await aiJson<Record<string, unknown>>(orgId, `Generate SEO metadata for a page about "${topic}" targeting: ${keywords.join(', ')}.
Return {"titles":[five titles, each 30-60 characters],"descriptions":[five descriptions, each 120-160 characters],"schema":{valid JSON-LD object}}`, 3000, 0.5, 'SEO metadata');
  const titles = Array.isArray(parsed.titles) ? parsed.titles.map(String).filter(Boolean).slice(0, 5) : [];
  const descriptions = Array.isArray(parsed.descriptions) ? parsed.descriptions.map(String).filter(Boolean).slice(0, 5) : [];
  const schema = parsed.schema && typeof parsed.schema === 'object' ? parsed.schema as Record<string, unknown> : {};
  if (titles.length === 0 || descriptions.length === 0) throw new AppError(502, 'AI provider returned incomplete SEO metadata', 'AI_RESPONSE_INVALID');
  return { titles, descriptions, schema };
}

export async function generateSchema(orgId: string, type: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const parsed = await aiJson<unknown>(orgId, `Generate one valid JSON-LD schema.org object for a ${type} page using this data:\n${JSON.stringify(data, null, 2)}`, 2500, 0.2, 'JSON-LD schema');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new AppError(502, 'AI provider returned invalid JSON-LD schema', 'AI_RESPONSE_INVALID');
  return parsed as Record<string, unknown>;
}

export async function optimizeContent(orgId: string, content: string, targetKeywords: string[]): Promise<{ score: number; suggestions: string[]; optimized_title: string; optimized_meta: string }> {
  const parsed = await aiJson<Record<string, unknown>>(orgId, `Analyze this content for SEO targeting ${targetKeywords.join(', ')}:\n\n${content.slice(0, 12000)}\n\nReturn {"score":0,"suggestions":["..."],"optimized_title":"...","optimized_meta":"..."}`, 3000, 0.3, 'content optimization');
  const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String).filter(Boolean) : [];
  const title = String(parsed.optimized_title || '').trim();
  const meta = String(parsed.optimized_meta || '').trim();
  if (!title || !meta) throw new AppError(502, 'AI provider returned incomplete SEO optimization', 'AI_RESPONSE_INVALID');
  return { score: Math.max(0, Math.min(Number(parsed.score || 0), 100)), suggestions, optimized_title: title, optimized_meta: meta };
}

function mapKeywordRow(row: Record<string, unknown>): SeoKeyword {
  return {
    id: String(row.id), organization_id: String(row.organization_id), keyword: String(row.keyword),
    search_volume: Number(row.search_volume || 0), difficulty: Number(row.difficulty || 0), cpc_cents: Number(row.cpc_cents || 0),
    intent: row.intent ? String(row.intent) : null, cluster_id: row.cluster_id ? String(row.cluster_id) : null,
    status: String(row.status), metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: String(row.created_at), updated_at: String(row.updated_at),
  };
}

function mapAuditRow(row: Record<string, unknown>): SeoAudit {
  return {
    id: String(row.id), organization_id: String(row.organization_id), url: String(row.url), score: Number(row.score || 0),
    issues: typeof row.issues === 'string' ? JSON.parse(row.issues) : (row.issues as SeoIssue[]) || [],
    suggestions: typeof row.suggestions === 'string' ? JSON.parse(row.suggestions) : (row.suggestions as string[]) || [],
    technical: typeof row.technical === 'string' ? JSON.parse(row.technical) : (row.technical as Record<string, unknown>) || {},
    performance: typeof row.performance === 'string' ? JSON.parse(row.performance) : (row.performance as Record<string, unknown>) || {},
    created_at: String(row.created_at),
  };
}
