import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import * as brandDnaService from './brand-dna.service';
import * as knowledgeService from './knowledge.service';

export interface ContextOptions {
  orgId: string;
  agentId?: string;
  includeBrandDna?: boolean;
  includeKnowledge?: boolean;
  includeHistory?: boolean;
  historyLimit?: number;
  knowledgeQuery?: string;
}

export interface AssembledContext {
  systemPrompt: string;
  brandDna: string;
  knowledge: string;
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
  return typeof value === 'object' ? value as Record<string, unknown> : {};
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
  try {
    return await brandDnaService.getContextString(orgId);
  } catch (error) {
    logger.warn(`Failed to load Brand DNA for ${orgId}: ${error}`);
    return '';
  }
}

async function getRelevantKnowledge(orgId: string, searchText: string, limit = 5): Promise<string> {
  const normalized = searchText.trim();
  if (!normalized) return '';
  try {
    const rows = await knowledgeService.search(orgId, normalized, limit);
    if (rows.length === 0) return '';
    const parts = ['RELEVANT KNOWLEDGE:'];
    for (const row of rows) {
      const title = String(row.title || 'Untitled');
      const content = String(row.content || '').slice(0, 1200);
      const source = row.url ? ` (${String(row.url)})` : '';
      parts.push(`- ${title}${source}: ${content}`);
    }
    return parts.join('\n');
  } catch (error) {
    logger.warn(`Failed to search knowledge for ${orgId}: ${error}`);
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
       WHERE ac.agent_id = $1
         AND ac.organization_id = $2
         AND am.role IN ('user', 'assistant')
       ORDER BY ac.updated_at DESC, am.created_at ASC
       LIMIT $3`,
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
      for (const message of messages.slice(-6)) {
        parts.push(`${message.role === 'user' ? 'User' : 'Assistant'}: ${String(message.content || '').slice(0, 500)}`);
      }
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
    historyLimit = 10,
    knowledgeQuery = '',
  } = options;

  const agent = await loadAgent(agentId, orgId);
  const config = agent?.config || {};
  const [brandDna, knowledge, recentHistory] = await Promise.all([
    includeBrandDna && config.include_brand_dna !== false ? getBrandDna(orgId) : Promise.resolve(''),
    includeKnowledge && config.include_knowledge !== false ? getRelevantKnowledge(orgId, knowledgeQuery, 5) : Promise.resolve(''),
    includeHistory && config.include_history !== false ? getRecentHistory(agentId, orgId, historyLimit) : Promise.resolve(''),
  ]);

  const fullContext = [brandDna, knowledge, recentHistory].filter(Boolean).join('\n\n---\n\n');
  logger.debug(`Context assembled for ${agentId || 'unscoped generation'}: ${fullContext.length} chars`);
  return {
    systemPrompt: agent?.system_prompt || '',
    brandDna,
    knowledge,
    recentHistory,
    fullContext,
  };
}

export const contextEngine = { assemble };
export default contextEngine;
