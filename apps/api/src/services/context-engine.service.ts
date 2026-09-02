import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import * as brandDnaService from './brand-dna.service';
import { hybridSearch } from './knowledge-ingestion.service';
import { getPlatformIntelligenceContext } from './platform-intelligence.service';

export interface ContextOptions {
  orgId: string;
  agentId?: string;
  includeBrandDna?: boolean;
  includeKnowledge?: boolean;
  includeHistory?: boolean;
  includePlatformIntelligence?: boolean;
  historyLimit?: number;
  knowledgeQuery?: string;
  productScopes?: string[];
  platforms?: string[];
}

export interface AssembledContext {
  systemPrompt: string;
  brandDna: string;
  knowledge: string;
  platformIntelligence: string;
  recentHistory: string;
  fullContext: string;
}

interface AgentRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  type: string;
  config: Record<string, unknown>;
  system_prompt: string | null;
  model: string | null;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; }
    catch { return {}; }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizedScopes(value: string[] | undefined): string[] {
  return [...new Set((value || []).map((scope) => String(scope).trim().toLowerCase()).filter(Boolean))].slice(0, 32);
}

async function loadAgent(agentId: string | undefined, orgId: string): Promise<AgentRow | null> {
  if (!agentId) return null;
  const result = await query(
    'SELECT * FROM agents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
    [agentId, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Agent');
  return { ...result.rows[0], config: objectValue(result.rows[0].config) } as AgentRow;
}

async function getBrandDna(orgId: string): Promise<string> {
  try { return await brandDnaService.getContextString(orgId); }
  catch (error) {
    logger.warn(`Failed to load Brand DNA for ${orgId}: ${error}`);
    return '';
  }
}

async function getRelevantKnowledge(orgId: string, searchText: string, productScopes: string[], limit = 7): Promise<string> {
  const normalized = searchText.trim();
  if (!normalized) return '';
  try {
    const rows = await hybridSearch(orgId, normalized, limit, productScopes);
    if (rows.length === 0) return '';
    const parts = [`RELEVANT APPROVED KNOWLEDGE${productScopes.length ? ` FOR PRODUCT/SERVICE SCOPE(S): ${productScopes.join(', ')}` : ''}:`];
    for (const row of rows) {
      const title = String(row.title || 'Untitled');
      const content = String(row.content || '').slice(0, 1400);
      const source = row.url ? ` (${String(row.url)})` : '';
      const metadata = objectValue(row.metadata);
      const scopes = Array.isArray(metadata.product_scopes) ? metadata.product_scopes.map(String).filter(Boolean) : [];
      const lifecycle = String(metadata.lifecycle_status || '').trim();
      parts.push(`- ${title}${source}${scopes.length ? ` [scope: ${scopes.join(', ')}]` : ' [company-wide]'}${lifecycle ? ` [lifecycle: ${lifecycle}]` : ''}: ${content}`);
    }
    return parts.join('\n');
  } catch (error) {
    logger.warn(`Failed to search knowledge for ${orgId}: ${error}`);
    return '';
  }
}

function productScopeFromRecord(value: Record<string, unknown>): string {
  return String(value.scope_key || value.scopeKey || value.product_scope || value.productScope || '').trim().toLowerCase();
}

function scopeProfile(profileValue: unknown, productScopes: string[]): Record<string, unknown> {
  const profile = objectValue(profileValue);
  if (productScopes.length === 0) return profile;
  const wanted = new Set(productScopes);
  const products = arrayValue(profile.products).filter((item) => {
    const record = objectValue(item);
    const scope = productScopeFromRecord(record);
    return !scope || wanted.has(scope);
  });
  const constraints = arrayValue(profile.marketing_constraints).filter((item) => {
    const record = objectValue(item);
    const scopes = arrayValue(record.product_scopes).map((scope) => String(scope).toLowerCase()).filter(Boolean);
    return scopes.length === 0 || scopes.some((scope) => wanted.has(scope));
  });
  return { ...profile, products, marketing_constraints: constraints };
}

function scopeSnapshot(row: Record<string, unknown>, productScopes: string[]): Record<string, unknown> {
  const payload = objectValue(row.payload);
  if (productScopes.length === 0) return row;
  return {
    ...row,
    payload: {
      ...payload,
      profile: scopeProfile(payload.profile, productScopes),
    },
  };
}

async function getLivingBusinessBrain(orgId: string, productScopes: string[]): Promise<string> {
  try {
    const [snapshots, campaigns, content, performance, intelligence] = await Promise.all([
      query(
        `SELECT application_id,source_type,version,payload,authoritative_fields,received_at
         FROM business_knowledge_snapshots
         WHERE organization_id=$1 AND is_current=TRUE
         ORDER BY CASE source_type WHEN 'owner' THEN 1 WHEN 'connector' THEN 2 ELSE 3 END,received_at DESC`,
        [orgId]
      ),
      query(`SELECT id,name,goal,status,product_lines,strategy_validation_status,updated_at FROM campaign_plans WHERE organization_id=$1 ORDER BY updated_at DESC LIMIT 10`, [orgId]),
      query(`SELECT id,title,type,platform,status,version,performance_summary,updated_at FROM content_items WHERE organization_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20`, [orgId]),
      query(
        `SELECT event_type,source,medium,platform,content_id,campaign_id,value_pence,metrics,occurred_at
         FROM marketing_performance_events WHERE organization_id=$1 ORDER BY occurred_at DESC LIMIT 50`,
        [orgId]
      ),
      query(
        `SELECT
           (SELECT COUNT(*) FROM competitors WHERE organization_id=$1 AND status='active' AND deleted_at IS NULL) AS competitors,
           (SELECT COUNT(*) FROM trend_items WHERE organization_id=$1 AND created_at > NOW()-INTERVAL '30 days') AS recent_trends,
           (SELECT COUNT(*) FROM application_conversion_events event JOIN application_connectors connector ON connector.application_id=event.application_id WHERE connector.default_organization_id=$1) AS conversions,
           (SELECT MAX(last_success_at) FROM knowledge_sources WHERE organization_id=$1 AND deleted_at IS NULL) AS knowledge_refreshed_at`,
        [orgId]
      ),
    ]);
    const scopedSnapshots = snapshots.rows.map((row) => scopeSnapshot(row, productScopes));
    const wanted = new Set(productScopes);
    const scopedCampaigns = productScopes.length === 0 ? campaigns.rows : campaigns.rows.filter((row) => {
      const scopes = arrayValue(row.product_lines).map((scope) => String(scope).toLowerCase()).filter(Boolean);
      return scopes.length === 0 || scopes.some((scope) => wanted.has(scope));
    });
    return `SHARED LIVING BUSINESS BRAIN (organization scoped${productScopes.length ? `; requested product/service scopes: ${productScopes.join(', ')}` : ''}):\n${JSON.stringify({
      approved_and_verified_business_sources: scopedSnapshots,
      active_campaign_context: scopedCampaigns,
      content_inventory: content.rows,
      recent_performance_and_sales_signals: performance.rows,
      intelligence_health: intelligence.rows[0] || {},
      authority_rule: 'Owner-approved corrections are binding over website inference. Structured connector values remain trusted live operational facts unless an explicit owner correction says otherwise. Unknown or conflicting facts must not be invented.',
      lifecycle_rule: 'Respect each product/service lifecycle. coming_soon, paused, retired and internal offerings are not available-for-purchase products.',
    }, null, 2)}`;
  } catch (error) {
    logger.warn(`Failed to load living business brain for ${orgId}: ${error}`);
    return '';
  }
}

async function getRecentHistory(agentId: string | undefined, orgId: string, limit = 10): Promise<string> {
  if (!agentId) return '';
  try {
    const result = await query(
      `SELECT ac.id, ac.title, ac.updated_at, am.role, am.content, am.created_at
       FROM agent_conversations ac
       JOIN agent_messages am ON am.conversation_id = ac.id
       WHERE ac.agent_id = $1 AND ac.organization_id = $2 AND am.role IN ('user', 'assistant')
       ORDER BY ac.updated_at DESC, am.created_at ASC LIMIT $3`,
      [agentId, orgId, Math.max(1, Math.min(limit, 50)) * 3]
    );
    if (result.rows.length === 0) return '';
    const groups = new Map<string, typeof result.rows>();
    for (const row of result.rows) {
      const id = String(row.id);
      groups.set(id, [...(groups.get(id) || []), row]);
    }
    const conversations = [...groups.values()]
      .sort((left, right) => new Date(right[0]?.updated_at || 0).getTime() - new Date(left[0]?.updated_at || 0).getTime())
      .slice(0, 3);
    const parts = ['RECENT CONVERSATION HISTORY:'];
    for (const messages of conversations) {
      parts.push(`Conversation: ${String(messages[0]?.title || 'Untitled')}`);
      for (const message of messages.slice(-6)) parts.push(`${message.role === 'user' ? 'User' : 'Assistant'}: ${String(message.content || '').slice(0, 500)}`);
    }
    return parts.join('\n');
  } catch (error) {
    logger.warn(`Failed to load conversation history for ${agentId}: ${error}`);
    return '';
  }
}

export async function assemble(options: ContextOptions): Promise<AssembledContext> {
  const {
    orgId,
    agentId,
    includeBrandDna = true,
    includeKnowledge = true,
    includeHistory = true,
    includePlatformIntelligence = true,
    historyLimit = 10,
    knowledgeQuery = '',
    productScopes: requestedScopes,
    platforms,
  } = options;
  const productScopes = normalizedScopes(requestedScopes);
  const agent = await loadAgent(agentId, orgId);
  const config = agent?.config || {};
  const [brandDna, businessKnowledge, livingBrain, recentHistory] = await Promise.all([
    includeBrandDna && config.include_brand_dna !== false ? getBrandDna(orgId) : Promise.resolve(''),
    includeKnowledge && config.include_knowledge !== false ? getRelevantKnowledge(orgId, knowledgeQuery, productScopes, 7) : Promise.resolve(''),
    includeKnowledge && config.include_knowledge !== false ? getLivingBusinessBrain(orgId, productScopes) : Promise.resolve(''),
    includeHistory && config.include_history !== false ? getRecentHistory(agentId, orgId, historyLimit) : Promise.resolve(''),
  ]);
  const platformIntelligence = includePlatformIntelligence && config.include_platform_intelligence !== false
    ? getPlatformIntelligenceContext(platforms)
    : '';
  const knowledge = [livingBrain, businessKnowledge, platformIntelligence].filter(Boolean).join('\n\n---\n\n');
  const fullContext = [brandDna, knowledge, recentHistory].filter(Boolean).join('\n\n---\n\n');
  logger.debug(`Context assembled for ${agentId || 'unscoped generation'}: ${fullContext.length} chars; scopes=${productScopes.join(',') || 'company-wide'}`);
  return { systemPrompt: agent?.system_prompt || '', brandDna, knowledge, platformIntelligence, recentHistory, fullContext };
}

export const contextEngine = { assemble };
export default contextEngine;
