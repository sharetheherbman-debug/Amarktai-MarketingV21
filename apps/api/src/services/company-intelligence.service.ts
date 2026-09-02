import crypto from 'crypto';
import { env } from '../config/env';
import { query, transaction } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { validatePublicHttpUrl } from '../utils/safe-fetch';
import { normalizeProductScopes } from '../utils/product-scope';
import * as brandDnaService from './brand-dna.service';
import * as knowledgeService from './knowledge.service';
import { collectWebsiteDocumentsDetailed, normalizeKnowledgeUrl, WebsiteCandidate } from './knowledge-ingestion.service';
import { generateGovernedText } from './governed-text-generation.service';
import * as pricing from './genx-pricing.service';

const APPLICATION_ID = 'company-intelligence';
const MAX_ANALYSIS_OUTPUT_TOKENS = 3500;
const MAX_EVIDENCE_CHARS = 70_000;
const LIFECYCLE = new Set(['live', 'coming_soon', 'paused', 'retired', 'internal', 'unknown']);

export interface ProductConfiguration {
  scopeKey: string;
  name: string;
  lifecycleStatus: 'live' | 'coming_soon' | 'paused' | 'retired' | 'internal' | 'unknown';
  description?: string;
}

export interface WebEstateSite {
  url: string;
  name?: string;
  relationship?: 'primary' | 'product' | 'service' | 'landing' | 'other';
  productScopes?: string[];
  lifecycleStatus?: ProductConfiguration['lifecycleStatus'];
  approved?: boolean;
  primary?: boolean;
}

interface BrainState extends Record<string, unknown> {
  step?: number;
  completed?: boolean;
  company?: Record<string, unknown>;
  webEstate?: WebEstateSite[];
  products?: ProductConfiguration[];
  channels?: string[];
  assets?: Record<string, unknown>;
  strategy?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
}

interface EvidenceBundle {
  text: string;
  sourceFingerprint: string;
  pageCount: number;
  sourceCount: number;
  configuredProducts: ProductConfiguration[];
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function lifecycleValue(value: unknown): ProductConfiguration['lifecycleStatus'] {
  const normalized = String(value || 'unknown').trim().toLowerCase();
  return LIFECYCLE.has(normalized) ? normalized as ProductConfiguration['lifecycleStatus'] : 'unknown';
}

function slug(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function normalizeProductConfiguration(value: unknown): ProductConfiguration[] {
  const result: ProductConfiguration[] = [];
  for (const raw of arrayValue(value).slice(0, 32)) {
    const item = objectValue(raw);
    const name = String(item.name || item.productName || item.scopeKey || item.scope_key || '').trim().slice(0, 200);
    const scopeKey = slug(item.scopeKey || item.scope_key || name);
    if (!scopeKey || !name) continue;
    result.push({
      scopeKey,
      name,
      lifecycleStatus: lifecycleValue(item.lifecycleStatus || item.lifecycle_status),
      description: String(item.description || '').trim().slice(0, 1500) || undefined,
    });
  }
  return [...new Map(result.map((item) => [item.scopeKey, item])).values()];
}

function normalizeState(value: unknown): BrainState {
  const raw = objectValue(value);
  return {
    ...raw,
    step: Math.max(1, Math.min(Number(raw.step || 1), 12)),
    completed: raw.completed === true,
    webEstate: arrayValue(raw.webEstate).slice(0, 32) as WebEstateSite[],
    products: normalizeProductConfiguration(raw.products),
  };
}

async function loadState(orgId: string): Promise<BrainState> {
  const result = await query("SELECT COALESCE(settings->'business_brain','{}'::jsonb) AS business_brain FROM organizations WHERE id=$1 AND deleted_at IS NULL", [orgId]);
  if (result.rows.length === 0) throw new AppError(404, 'Organization not found', 'NOT_FOUND');
  return normalizeState(result.rows[0].business_brain);
}

export async function saveState(orgId: string, patch: Record<string, unknown>): Promise<BrainState> {
  const current = await loadState(orgId);
  const merged = normalizeState({ ...current, ...patch });
  await query(
    `UPDATE organizations
     SET settings=jsonb_set(COALESCE(settings,'{}'::jsonb),'{business_brain}',$1::jsonb,TRUE),updated_at=NOW()
     WHERE id=$2 AND deleted_at IS NULL`,
    [JSON.stringify(merged), orgId]
  );
  return merged;
}

async function currentSnapshot(orgId: string, sourceType: 'website' | 'owner'): Promise<Record<string, unknown> | null> {
  const result = await query(
    `SELECT id,version,fingerprint,payload,authoritative_fields,received_at
     FROM business_knowledge_snapshots
     WHERE organization_id=$1 AND application_id=$2 AND source_type=$3 AND is_current=TRUE
     LIMIT 1`,
    [orgId, APPLICATION_ID, sourceType]
  );
  return result.rows[0] || null;
}

async function persistSnapshot(
  orgId: string,
  sourceType: 'website' | 'owner',
  payload: Record<string, unknown>,
  authoritativeFields: string[] = []
): Promise<Record<string, unknown>> {
  const hash = fingerprint(payload);
  const current = await currentSnapshot(orgId, sourceType);
  if (current && String(current.fingerprint) === hash) return current;
  const version = Number(current?.version || 0) + 1;
  return transaction(async (client) => {
    await client.query(
      `UPDATE business_knowledge_snapshots SET is_current=FALSE
       WHERE organization_id=$1 AND application_id=$2 AND source_type=$3 AND is_current=TRUE`,
      [orgId, APPLICATION_ID, sourceType]
    );
    const inserted = await client.query(
      `INSERT INTO business_knowledge_snapshots
         (organization_id,application_id,source_type,version,fingerprint,payload,authoritative_fields,is_current)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING id,version,fingerprint,payload,authoritative_fields,received_at`,
      [orgId, APPLICATION_ID, sourceType, version, hash, JSON.stringify(payload), JSON.stringify(authoritativeFields)]
    );
    return inserted.rows[0];
  });
}

export async function discoverWebEstate(primaryUrl: string): Promise<{
  primary: string;
  candidates: WebsiteCandidate[];
  crawl: { pagesVisited: number; pagesAccepted: number; issues: number; sitemapUrls: number; bytesFetched: number };
}> {
  const validated = await validatePublicHttpUrl(primaryUrl);
  const primary = normalizeKnowledgeUrl(validated.toString());
  const result = await collectWebsiteDocumentsDetailed(primary, { maxPages: 10, maxDepth: 2, includeSubdomains: false, totalByteLimit: 12 * 1024 * 1024 });
  return {
    primary,
    candidates: result.candidates,
    crawl: {
      pagesVisited: result.pagesVisited,
      pagesAccepted: result.pagesAccepted,
      issues: result.issues.length,
      sitemapUrls: result.sitemapUrls,
      bytesFetched: result.bytesFetched,
    },
  };
}

export async function saveWebEstate(
  orgId: string,
  userId: string,
  sites: WebEstateSite[],
  syncNow = false
): Promise<{ sites: Array<Record<string, unknown>>; sync: Array<Record<string, unknown>>; state: BrainState }> {
  const approved = sites.filter((site) => site.approved !== false).slice(0, 32);
  if (approved.length === 0) throw new AppError(400, 'Approve at least one public website or continue with manual business information.', 'WEB_ESTATE_REQUIRED');
  const existing = await knowledgeService.list(orgId, 'website');
  const saved: Array<Record<string, unknown>> = [];
  const sync: Array<Record<string, unknown>> = [];
  const stateSites: WebEstateSite[] = [];

  for (const site of approved) {
    const validated = await validatePublicHttpUrl(site.url);
    const normalizedUrl = normalizeKnowledgeUrl(validated.toString());
    const productScopes = normalizeProductScopes(site.productScopes || []);
    const lifecycleStatus = lifecycleValue(site.lifecycleStatus);
    const config = {
      max_pages: 75,
      max_depth: 5,
      max_total_bytes: 40 * 1024 * 1024,
      include_subdomains: false,
      refresh_interval_minutes: 1440,
      approved_web_estate: true,
      relationship: site.relationship || (site.primary ? 'primary' : 'other'),
      product_scopes: productScopes,
      lifecycle_status: lifecycleStatus,
      primary: site.primary === true,
    };
    const match = existing.find((source) => {
      if (!source.url) return false;
      try { return normalizeKnowledgeUrl(source.url) === normalizedUrl; } catch { return false; }
    });
    const name = String(site.name || new URL(normalizedUrl).hostname).trim().slice(0, 255);
    const source = match
      ? await knowledgeService.update(match.id, orgId, { name, url: normalizedUrl, config: { ...match.config, ...config } })
      : await knowledgeService.create(orgId, { name, type: 'website', url: normalizedUrl, config }, userId);
    saved.push(source as unknown as Record<string, unknown>);
    stateSites.push({
      url: normalizedUrl,
      name,
      relationship: config.relationship as WebEstateSite['relationship'],
      productScopes,
      lifecycleStatus,
      approved: true,
      primary: site.primary === true,
    });
    if (syncNow) {
      try {
        sync.push({ sourceId: source.id, success: true, ...(await knowledgeService.syncSource(source.id, orgId)) });
      } catch (error) {
        sync.push({ sourceId: source.id, success: false, error: error instanceof Error ? error.message : 'Website sync failed' });
      }
    }
  }

  const current = await loadState(orgId);
  const state = await saveState(orgId, { ...current, webEstate: stateSites, step: Math.max(Number(current.step || 1), 3) });
  return { sites: saved, sync, state };
}

async function buildEvidence(orgId: string): Promise<EvidenceBundle> {
  const state = await loadState(orgId);
  const result = await query(
    `SELECT ks.id AS source_id,ks.name AS source_name,ks.url AS source_url,ks.config,
            kpv.url AS page_url,kpv.title,kpv.content,kpv.metadata,kpv.fingerprint
     FROM knowledge_sources ks
     JOIN knowledge_page_versions kpv ON kpv.source_id=ks.id AND kpv.organization_id=ks.organization_id
     WHERE ks.organization_id=$1 AND ks.type='website' AND ks.deleted_at IS NULL
       AND COALESCE((ks.config->>'approved_web_estate')::boolean,FALSE)=TRUE
       AND kpv.is_current=TRUE AND kpv.change_type<>'deleted'
     ORDER BY COALESCE((ks.config->>'primary')::boolean,FALSE) DESC,ks.name,kpv.url
     LIMIT 250`,
    [orgId]
  );
  if (result.rows.length === 0) throw new AppError(422, 'No successfully crawled approved website knowledge is available yet. Crawl the approved sites first or add manual business knowledge.', 'COMPANY_EVIDENCE_REQUIRED');

  const configured = new Map<string, ProductConfiguration>();
  for (const product of normalizeProductConfiguration(state.products)) configured.set(product.scopeKey, product);
  const lines: string[] = [];
  const hashes: string[] = [];
  const sourceIds = new Set<string>();
  let usedChars = 0;
  for (const row of result.rows) {
    const config = objectValue(row.config);
    const scopes = normalizeProductScopes(config.product_scopes || []);
    for (const scope of scopes) {
      if (!configured.has(scope)) configured.set(scope, { scopeKey: scope, name: scope.replace(/[-_]+/g, ' '), lifecycleStatus: lifecycleValue(config.lifecycle_status) });
    }
    const block = [
      `SOURCE_URL: ${String(row.page_url || row.source_url || '')}`,
      `SOURCE_NAME: ${String(row.source_name || '')}`,
      `PRODUCT_SCOPES: ${scopes.join(', ') || 'company-wide'}`,
      `LIFECYCLE_STATUS: ${String(config.lifecycle_status || 'unknown')}`,
      `TITLE: ${String(row.title || '')}`,
      `CONTENT:\n${String(row.content || '').slice(0, 5000)}`,
    ].join('\n');
    if (usedChars + block.length > MAX_EVIDENCE_CHARS) break;
    lines.push(block);
    usedChars += block.length;
    hashes.push(String(row.fingerprint || ''));
    sourceIds.add(String(row.source_id));
  }
  if (lines.length === 0) throw new AppError(422, 'Approved website pages contain insufficient readable content.', 'COMPANY_EVIDENCE_EMPTY');
  return {
    text: lines.join('\n\n---\n\n'),
    sourceFingerprint: crypto.createHash('sha256').update(hashes.sort().join(':')).digest('hex'),
    pageCount: lines.length,
    sourceCount: sourceIds.size,
    configuredProducts: [...configured.values()],
  };
}

function analysisPrompt(evidence: EvidenceBundle, existingBrand: unknown): string {
  return `You are the Company Intelligence analyst inside a white-label marketing platform.
Use ONLY the supplied first-party website evidence and owner Brand DNA. Do not invent prices, features, proof, testimonials, guarantees, locations, audiences or availability.
If evidence is insufficient, use null/[] and add a targeted question. If sources conflict, report the conflict.
Product lifecycle configuration is authoritative. A coming_soon, paused, retired or internal product must never be described as available to buy now.
Return STRICT JSON only, no markdown.

AUTHORITATIVE PRODUCT CONFIGURATION:
${JSON.stringify(evidence.configuredProducts)}

OWNER BRAND DNA (owner-entered facts outrank website inference):
${JSON.stringify(existingBrand || {})}

FIRST-PARTY WEBSITE EVIDENCE:
${evidence.text}

Return this shape:
{
  "company": {"name": string|null,"description": string|null,"industry": string|null,"mission": string|null,"positioning": string|null,"value_proposition": string|null,"geography": string[],"differentiators": string[],"brand_voice": string|null,"preferred_terms": string[],"prohibited_terms": string[],"sources": string[],"confidence": number},
  "audiences": [{"name": string,"needs": string[],"pain_points": string[],"use_cases": string[],"geography": string[],"sources": string[]}],
  "products": [{"scope_key": string,"name": string,"lifecycle_status": "live"|"coming_soon"|"paused"|"retired"|"internal"|"unknown","description": string|null,"audiences": string[],"features": string[],"benefits": string[],"differentiators": string[],"pricing_facts": string[],"ctas": string[],"urls": string[],"sources": string[]}],
  "proof": [{"type": string,"claim": string,"sources": string[]}],
  "faq": [{"question": string,"answer": string,"sources": string[]}],
  "content_themes": string[],
  "marketing_constraints": [{"rule": string,"reason": string,"product_scopes": string[],"sources": string[]}],
  "conflicts": [{"topic": string,"details": string,"sources": string[]}],
  "questions": string[]
}`;
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AppError(502, 'GenX returned an invalid Company Intelligence response.', 'COMPANY_ANALYSIS_INVALID');
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError(502, 'GenX returned malformed Company Intelligence JSON. No Company Brain changes were saved.', 'COMPANY_ANALYSIS_INVALID');
  }
}

function enforceConfiguredProducts(profile: Record<string, unknown>, configured: ProductConfiguration[]): Record<string, unknown> {
  const products = arrayValue(profile.products).map((raw) => objectValue(raw));
  const byScope = new Map<string, Record<string, unknown>>();
  for (const product of products) {
    const scope = slug(product.scope_key || product.scopeKey || product.name);
    if (scope) byScope.set(scope, { ...product, scope_key: scope, lifecycle_status: lifecycleValue(product.lifecycle_status) });
  }
  for (const configuredProduct of configured) {
    const existing = byScope.get(configuredProduct.scopeKey) || {};
    byScope.set(configuredProduct.scopeKey, {
      ...existing,
      scope_key: configuredProduct.scopeKey,
      name: configuredProduct.name,
      lifecycle_status: configuredProduct.lifecycleStatus,
      description: existing.description || configuredProduct.description || null,
    });
  }
  return { ...profile, products: [...byScope.values()] };
}

export async function estimateAnalysis(orgId: string): Promise<Record<string, unknown>> {
  const evidence = await buildEvidence(orgId);
  const brand = await brandDnaService.get(orgId);
  const prompt = analysisPrompt(evidence, brand);
  const estimatedInputTokens = Math.max(1, Buffer.byteLength(prompt, 'utf8') + 64);
  const [inputQuote, outputQuote] = await Promise.all([
    pricing.quoteGeneration({ modelId: env.DEFAULT_TEXT_MODEL, operation: 'text_input', quantity: estimatedInputTokens, quantityUnit: 'tokens' }),
    pricing.quoteGeneration({ modelId: env.DEFAULT_TEXT_MODEL, operation: 'text_output', quantity: MAX_ANALYSIS_OUTPUT_TOKENS, quantityUnit: 'tokens' }),
  ]);
  return {
    provider: 'genx',
    model: env.DEFAULT_TEXT_MODEL,
    pages: evidence.pageCount,
    sources: evidence.sourceCount,
    source_fingerprint: evidence.sourceFingerprint,
    maximum_output_tokens: MAX_ANALYSIS_OUTPUT_TOKENS,
    maximum_reserved_credits: inputQuote.reservation_credits + outputQuote.reservation_credits,
    requires_explicit_action: true,
    note: 'Crawling itself does not use GenX generation credits. This estimate is for the explicit AI Company Review only.',
  };
}

export async function analyseCompany(orgId: string, userId: string, idempotencyKey?: string): Promise<Record<string, unknown>> {
  const evidence = await buildEvidence(orgId);
  const existingWebsite = await currentSnapshot(orgId, 'website');
  if (existingWebsite && objectValue(existingWebsite.payload).source_fingerprint === evidence.sourceFingerprint) {
    return { profile: objectValue(existingWebsite.payload).profile || {}, reused: true, source_fingerprint: evidence.sourceFingerprint, snapshot_version: existingWebsite.version };
  }
  const brand = await brandDnaService.get(orgId);
  const result = await generateGovernedText({
    organizationId: orgId,
    userId,
    idempotencyKey: idempotencyKey || `company-intelligence:${evidence.sourceFingerprint}`,
    title: 'Analyse company websites with GenX',
    summary: `Build a source-grounded Company Marketing Profile from ${evidence.pageCount} approved website page(s).`,
    prompt: analysisPrompt(evidence, brand),
    maxTokens: MAX_ANALYSIS_OUTPUT_TOKENS,
    temperature: 0.2,
    payload: { purpose: 'company_intelligence_review', source_fingerprint: evidence.sourceFingerprint, page_count: evidence.pageCount, source_count: evidence.sourceCount },
  });
  const parsed = enforceConfiguredProducts(parseJsonObject(result.content), evidence.configuredProducts);
  const payload = {
    profile: parsed,
    source_fingerprint: evidence.sourceFingerprint,
    page_count: evidence.pageCount,
    source_count: evidence.sourceCount,
    generated_at: new Date().toISOString(),
    provider: 'genx',
    model: env.DEFAULT_TEXT_MODEL,
    provenance_rule: 'Every sourced fact must reference one or more SOURCE_URL values from approved first-party evidence; unknown facts remain unknown.',
  };
  const snapshot = await persistSnapshot(orgId, 'website', payload);
  const current = await loadState(orgId);
  await saveState(orgId, { ...current, analysis: { sourceFingerprint: evidence.sourceFingerprint, snapshotVersion: snapshot.version, reviewed: false, generatedAt: payload.generated_at }, step: Math.max(Number(current.step || 1), 5) });
  return { profile: parsed, reused: false, source_fingerprint: evidence.sourceFingerprint, snapshot_version: snapshot.version };
}

export async function approveCompanyProfile(orgId: string, userId: string, profile: Record<string, unknown>): Promise<Record<string, unknown>> {
  const serialized = JSON.stringify(profile);
  if (Buffer.byteLength(serialized, 'utf8') > 512 * 1024) throw new AppError(413, 'Company profile is too large', 'COMPANY_PROFILE_TOO_LARGE');
  const configuredProducts = normalizeProductConfiguration(arrayValue(profile.products).map((raw) => {
    const item = objectValue(raw);
    return { scopeKey: item.scope_key || item.scopeKey || item.name, name: item.name, lifecycleStatus: item.lifecycle_status || item.lifecycleStatus, description: item.description };
  }));
  const enforced = enforceConfiguredProducts(profile, configuredProducts);
  const payload = { profile: enforced, approved_at: new Date().toISOString(), approved_by: userId };
  const snapshot = await persistSnapshot(orgId, 'owner', payload, ['profile']);

  const company = objectValue(enforced.company);
  const products = arrayValue(enforced.products).map((item) => String(objectValue(item).name || '')).filter(Boolean).slice(0, 100);
  const audiences = arrayValue(enforced.audiences).map((item) => String(objectValue(item).name || '')).filter(Boolean);
  const constraints = arrayValue(enforced.marketing_constraints).map((item) => String(objectValue(item).rule || '')).filter(Boolean);
  await brandDnaService.upsert(orgId, {
    company_name: String(company.name || '').trim() || undefined,
    company_description: String(company.description || '').trim() || undefined,
    industry: String(company.industry || '').trim() || undefined,
    products,
    brand_voice: String(company.brand_voice || '').trim() || undefined,
    target_audience: audiences.length > 0 ? { description: audiences.join(', ') } : undefined,
    compliance_rules: constraints,
    prohibited_phrases: arrayValue(company.prohibited_terms).map(String).filter(Boolean),
  });
  const current = await loadState(orgId);
  const state = await saveState(orgId, {
    ...current,
    products: configuredProducts.length > 0 ? configuredProducts : current.products,
    analysis: { ...objectValue(current.analysis), reviewed: true, ownerSnapshotVersion: snapshot.version, approvedAt: payload.approved_at },
    step: Math.max(Number(current.step || 1), 6),
  });
  return { profile: enforced, snapshot_version: snapshot.version, state };
}

export async function getBusinessBrain(orgId: string): Promise<Record<string, unknown>> {
  const [state, website, owner, sources, brand] = await Promise.all([
    loadState(orgId),
    currentSnapshot(orgId, 'website'),
    currentSnapshot(orgId, 'owner'),
    knowledgeService.list(orgId, 'website'),
    brandDnaService.get(orgId),
  ]);
  const ownerPayload = objectValue(owner?.payload);
  const websitePayload = objectValue(website?.payload);
  const profile = objectValue(ownerPayload.profile).company || objectValue(websitePayload.profile).company
    ? objectValue(ownerPayload.profile).profile ? objectValue(ownerPayload.profile).profile : (ownerPayload.profile || websitePayload.profile || {})
    : (ownerPayload.profile || websitePayload.profile || {});
  return {
    state,
    profile,
    profile_status: owner ? 'approved' : website ? 'needs_review' : 'not_analysed',
    website_snapshot: website ? { version: website.version, fingerprint: website.fingerprint, received_at: website.received_at } : null,
    owner_snapshot: owner ? { version: owner.version, fingerprint: owner.fingerprint, received_at: owner.received_at } : null,
    brand_dna: brand,
    websites: sources.map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      status: source.status,
      error_message: source.error_message,
      item_count: source.item_count,
      last_synced_at: source.last_synced_at,
      config: source.config,
    })),
  };
}
