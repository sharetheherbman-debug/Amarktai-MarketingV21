import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { providerRouter } from '../providers/provider-router';
import { contextEngine } from './context-engine.service';

// ─── Types ───────────────────────────────────────────────────────────────────

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
}

// ─── Keyword Research ────────────────────────────────────────────────────────

export async function researchKeywords(
  orgId: string,
  seed: string,
  count: number = 20
): Promise<KeywordResearchResult[]> {
  const context = await contextEngine.assemble({
    orgId,
    agentId: '',
    includeBrandDna: true,
  });

  const prompt = `Generate ${count} SEO keyword variations for "${seed}".
For each keyword provide:
- Estimated monthly search volume (high/medium/low as number)
- Difficulty score (0-100)
- CPC estimate in cents
- Search intent (informational/navigational/commercial/transactional)
- 3 related keywords

Return as JSON array: [{"keyword":"...","search_volume":0,"difficulty":0,"cpc_cents":0,"intent":"...","related_keywords":["..."]}]

${context.brandDna ? `Brand context: ${context.brandDna.substring(0, 500)}` : ''}`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { max_tokens: 4000, temperature: 0.7 },
      { organizationId: orgId }
    );

    const parsed = JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.error(`Keyword research failed: ${error}`);
    return [];
  }
}

export async function clusterKeywords(
  orgId: string,
  keywords: string[]
): Promise<{ cluster: string; keywords: string[]; pillar_page: string }[]> {
  const prompt = `Group these SEO keywords into topic clusters:
${keywords.join(', ')}

For each cluster provide:
- Cluster name
- Keywords in the cluster
- Suggested pillar page topic

Return as JSON: [{"cluster":"...","keywords":["..."],"pillar_page":"..."}]`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { max_tokens: 3000, temperature: 0.5 },
      { organizationId: orgId }
    );

    return JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return [];
  }
}

export async function saveKeywords(orgId: string, keywords: Array<{ keyword: string; search_volume?: number; difficulty?: number; cpc_cents?: number; intent?: string }>): Promise<void> {
  for (const kw of keywords) {
    await query(
      `INSERT INTO seo_keywords (organization_id, keyword, search_volume, difficulty, cpc_cents, intent)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [orgId, kw.keyword, kw.search_volume || 0, kw.difficulty || 0, kw.cpc_cents || 0, kw.intent || null]
    );
  }
}

export async function listKeywords(orgId: string): Promise<SeoKeyword[]> {
  const result = await query(
    'SELECT * FROM seo_keywords WHERE organization_id = $1 ORDER BY search_volume DESC',
    [orgId]
  );
  return result.rows.map(mapKeywordRow);
}

// ─── SEO Audit ───────────────────────────────────────────────────────────────

export async function auditUrl(orgId: string, url: string, userId: string): Promise<SeoAudit> {
  const issues: SeoIssue[] = [];
  const suggestions: string[] = [];

  // Fetch the page
  let html = '';
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'AmarktAI-SEO/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    html = await response.text();
  } catch {
    issues.push({ type: 'accessibility', severity: 'error', message: 'Could not access URL' });
    return saveAudit(orgId, url, 0, issues, suggestions, {}, {}, userId);
  }

  // Title check
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!titleMatch) {
    issues.push({ type: 'meta', severity: 'error', message: 'Missing title tag' });
  } else {
    const title = titleMatch[1].trim();
    if (title.length < 30) issues.push({ type: 'meta', severity: 'warning', message: `Title too short (${title.length} chars). Aim for 30-60.` });
    if (title.length > 60) issues.push({ type: 'meta', severity: 'warning', message: `Title too long (${title.length} chars). Aim for 30-60.` });
  }

  // Meta description
  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (!metaDescMatch) {
    issues.push({ type: 'meta', severity: 'warning', message: 'Missing meta description' });
  } else {
    const desc = metaDescMatch[1].trim();
    if (desc.length < 120) issues.push({ type: 'meta', severity: 'info', message: `Meta description short (${desc.length} chars). Aim for 120-160.` });
    if (desc.length > 160) issues.push({ type: 'meta', severity: 'warning', message: `Meta description too long (${desc.length} chars). Aim for 120-160.` });
  }

  // H1 check
  const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gis);
  if (!h1Matches || h1Matches.length === 0) {
    issues.push({ type: 'structure', severity: 'error', message: 'Missing H1 tag' });
  } else if (h1Matches.length > 1) {
    issues.push({ type: 'structure', severity: 'warning', message: `Multiple H1 tags found (${h1Matches.length})` });
  }

  // Image alt tags
  const imgMatches = html.match(/<img[^>]*>/gi) || [];
  const imgNoAlt = imgMatches.filter(img => !img.match(/alt=["'][^"']+["']/i));
  if (imgNoAlt.length > 0) {
    issues.push({ type: 'accessibility', severity: 'warning', message: `${imgNoAlt.length} images missing alt text` });
  }

  // Schema markup
  const hasSchema = html.includes('application/ld+json');
  if (!hasSchema) {
    suggestions.push('Add structured data (JSON-LD) for better SERP display');
  }

  // Mobile viewport
  const hasViewport = html.includes('viewport');
  if (!hasViewport) {
    issues.push({ type: 'mobile', severity: 'error', message: 'Missing viewport meta tag' });
  }

  // Canonical
  const hasCanonical = html.includes('rel="canonical"');
  if (!hasCanonical) {
    suggestions.push('Add canonical URL to prevent duplicate content issues');
  }

  // Internal links
  const internalLinks = html.match(/href=["']\/[^"']*["']/gi) || [];
  if (internalLinks.length < 3) {
    suggestions.push('Add more internal links for better crawlability');
  }

  const score = Math.max(0, 100 - issues.filter(i => i.severity === 'error').length * 15 - issues.filter(i => i.severity === 'warning').length * 5);
  const technical = { hasSchema, hasViewport, hasCanonical, h1Count: h1Matches?.length || 0, imgCount: imgMatches.length, imgNoAlt: imgNoAlt.length };
  const performance = { internalLinks: internalLinks.length };

  return saveAudit(orgId, url, score, issues, suggestions, technical, performance, userId);
}

async function saveAudit(orgId: string, url: string, score: number, issues: SeoIssue[], suggestions: string[], technical: Record<string, unknown>, performance: Record<string, unknown>, userId: string): Promise<SeoAudit> {
  const result = await query(
    `INSERT INTO seo_audits (organization_id, url, score, issues, suggestions, technical, performance, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [orgId, url, score, JSON.stringify(issues), JSON.stringify(suggestions), JSON.stringify(technical), JSON.stringify(performance), userId]
  );
  return mapAuditRow(result.rows[0]);
}

export async function listAudits(orgId: string): Promise<SeoAudit[]> {
  const result = await query('SELECT * FROM seo_audits WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
  return result.rows.map(mapAuditRow);
}

// ─── Meta Generators ─────────────────────────────────────────────────────────

export async function generateMeta(orgId: string, topic: string, keywords: string[]): Promise<{ titles: string[]; descriptions: string[]; schema: Record<string, unknown> }> {
  const prompt = `Generate SEO metadata for a page about "${topic}" targeting keywords: ${keywords.join(', ')}.

Provide:
1. 5 meta title options (30-60 chars each)
2. 5 meta description options (120-160 chars each)
3. A JSON-LD schema summary for this page

Return as JSON: {"titles":["..."],"descriptions":["..."],"schema":{...}}`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { max_tokens: 2000, temperature: 0.8 },
      { organizationId: orgId }
    );

    return JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return { titles: [], descriptions: [], schema: {} };
  }
}

export async function generateSchema(orgId: string, type: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const prompt = `Generate a JSON-LD schema.org markup for a ${type} page with this data:
${JSON.stringify(data, null, 2)}

Return only the JSON-LD object as JSON.`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { max_tokens: 1500, temperature: 0.3 },
      { organizationId: orgId }
    );

    return JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return {};
  }
}

// ─── Content Optimizer ───────────────────────────────────────────────────────

export async function optimizeContent(orgId: string, content: string, targetKeywords: string[]): Promise<{ score: number; suggestions: string[]; optimized_title: string; optimized_meta: string }> {
  const prompt = `Analyze this content for SEO optimization targeting: ${targetKeywords.join(', ')}

Content:
${content.substring(0, 3000)}

Provide:
1. SEO score (0-100)
2. List of optimization suggestions
3. Optimized title
4. Optimized meta description

Return as JSON: {"score":0,"suggestions":["..."],"optimized_title":"...","optimized_meta":"..."}`;

  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      'gpt-4o-mini',
      { max_tokens: 2000, temperature: 0.5 },
      { organizationId: orgId }
    );

    return JSON.parse(result.content.replace(/```json\n?|\n?```/g, ''));
  } catch {
    return { score: 0, suggestions: ['Analysis failed'], optimized_title: '', optimized_meta: '' };
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapKeywordRow(row: Record<string, unknown>): SeoKeyword {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    keyword: row.keyword as string,
    search_volume: parseInt(row.search_volume as string) || 0,
    difficulty: parseFloat(row.difficulty as string) || 0,
    cpc_cents: parseInt(row.cpc_cents as string) || 0,
    intent: row.intent as string | null,
    cluster_id: row.cluster_id as string | null,
    status: row.status as string,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapAuditRow(row: Record<string, unknown>): SeoAudit {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    url: row.url as string,
    score: parseFloat(row.score as string) || 0,
    issues: typeof row.issues === 'string' ? JSON.parse(row.issues) : (row.issues as SeoIssue[]) || [],
    suggestions: typeof row.suggestions === 'string' ? JSON.parse(row.suggestions) : (row.suggestions as string[]) || [],
    technical: typeof row.technical === 'string' ? JSON.parse(row.technical) : (row.technical as Record<string, unknown>) || {},
    performance: typeof row.performance === 'string' ? JSON.parse(row.performance) : (row.performance as Record<string, unknown>) || {},
    created_at: row.created_at as string,
  };
}
