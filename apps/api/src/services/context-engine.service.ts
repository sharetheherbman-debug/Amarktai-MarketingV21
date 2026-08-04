import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError } from '../middleware/errorHandler';
import * as memoryService from '../memory/memory.service';

export interface ContextOptions {
  orgId: string;
  agentId: string;
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

async function loadAgent(agentId: string, orgId: string): Promise<AgentRow> {
  const result = await query(
    `SELECT * FROM agents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [agentId, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Agent');
  }

  return result.rows[0];
}

async function getBrandDna(orgId: string): Promise<string> {
  try {
    const brandMemories = await memoryService.getBrandMemory(orgId);

    if (brandMemories.length === 0) {
      const result = await query(
        `SELECT * FROM brand_dna WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
        [orgId]
      );

      if (result.rows.length === 0) {
        return '';
      }

      const dna = result.rows[0];
      const parts: string[] = [];

      if (dna.name) parts.push(`Brand Name: ${dna.name}`);
      if (dna.industry) parts.push(`Industry: ${dna.industry}`);
      if (dna.tone) parts.push(`Tone: ${dna.tone}`);
      if (dna.voice) parts.push(`Voice: ${dna.voice}`);
      if (dna.values) parts.push(`Values: ${JSON.stringify(dna.values)}`);
      if (dna.target_audience) parts.push(`Target Audience: ${JSON.stringify(dna.target_audience)}`);
      if (dna.style_guide) parts.push(`Style Guide: ${JSON.stringify(dna.style_guide)}`);

      return parts.length > 0 ? `Brand DNA:\n${parts.join('\n')}` : '';
    }

    const parts: string[] = ['Brand Memory:'];
    for (const memory of brandMemories) {
      parts.push(`- ${memory.key}: ${JSON.stringify(memory.value)}`);
    }

    return parts.join('\n');
  } catch (error) {
    logger.warn(`Failed to load Brand DNA: ${error}`);
    return '';
  }
}

async function getRelevantKnowledge(orgId: string, searchQuery: string, limit: number = 5): Promise<string> {
  if (!searchQuery || searchQuery.trim().length === 0) {
    return '';
  }

  try {
    const result = await query(
      `SELECT title, content, type, metadata
       FROM knowledge_items
       WHERE organization_id = $1
         AND deleted_at IS NULL
         AND status = 'active'
         AND (
           title ILIKE $2
           OR content ILIKE $2
           OR tags::text ILIKE $2
         )
       ORDER BY
         CASE WHEN title ILIKE $2 THEN 0 ELSE 1 END,
         updated_at DESC
       LIMIT $3`,
      [orgId, `%${searchQuery}%`, limit]
    );

    if (result.rows.length === 0) {
      const memoryResults = await memoryService.search(searchQuery, orgId, 'knowledge', limit);

      if (memoryResults.length === 0) {
        return '';
      }

      const parts: string[] = ['Relevant Knowledge:'];
      for (const item of memoryResults) {
        parts.push(`- ${item.key}: ${JSON.stringify(item.value)}`);
      }

      return parts.join('\n');
    }

    const parts: string[] = ['Relevant Knowledge:'];
    for (const item of result.rows) {
      const title = item.title || 'Untitled';
      const content = item.content ? item.content.substring(0, 500) : '';
      parts.push(`- [${item.type}] ${title}: ${content}`);
    }

    return parts.join('\n');
  } catch (error) {
    logger.warn(`Failed to search knowledge: ${error}`);
    return '';
  }
}

async function getRecentHistory(agentId: string, orgId: string, limit: number = 10): Promise<string> {
  try {
    const result = await query(
      `SELECT ac.id, ac.title, ac.updated_at,
              am.role, am.content, am.created_at
       FROM agent_conversations ac
       JOIN agent_messages am ON am.conversation_id = ac.id
       WHERE ac.agent_id = $1
         AND ac.organization_id = $2
         AND am.role IN ('user', 'assistant')
       ORDER BY ac.updated_at DESC, am.created_at ASC
       LIMIT $3`,
      [agentId, orgId, limit * 3]
    );

    if (result.rows.length === 0) {
      return '';
    }

    const conversationGroups: Record<string, typeof result.rows> = {};
    for (const row of result.rows) {
      if (!conversationGroups[row.id]) {
        conversationGroups[row.id] = [];
      }
      conversationGroups[row.id].push(row);
    }

    const parts: string[] = ['Recent Conversation History:'];

    const sortedConversations = Object.entries(conversationGroups)
      .sort(([, a], [, b]) => {
        const aTime = a[0]?.updated_at ? new Date(a[0].updated_at).getTime() : 0;
        const bTime = b[0]?.updated_at ? new Date(b[0].updated_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 3);

    for (const [convId, messages] of sortedConversations) {
      const title = messages[0]?.title || 'Untitled Conversation';
      parts.push(`\nConversation: ${title}`);

      const recentMessages = messages.slice(-6);
      for (const msg of recentMessages) {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const content = msg.content ? msg.content.substring(0, 200) : '';
        parts.push(`  ${role}: ${content}`);
      }
    }

    return parts.join('\n');
  } catch (error) {
    logger.warn(`Failed to load conversation history: ${error}`);
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
    knowledgeQuery,
  } = options;

  const agent = await loadAgent(agentId, orgId);

  const agentConfig = agent.config as Record<string, unknown>;
  const configBrandDna = agentConfig?.include_brand_dna !== false;
  const configKnowledge = agentConfig?.include_knowledge !== false;
  const configHistory = agentConfig?.include_history !== false;

  const tasks: Promise<string>[] = [];

  tasks.push(includeBrandDna && configBrandDna ? getBrandDna(orgId) : Promise.resolve(''));
  tasks.push(
    includeKnowledge && configKnowledge
      ? getRelevantKnowledge(orgId, knowledgeQuery || '', 5)
      : Promise.resolve('')
  );
  tasks.push(
    includeHistory && configHistory
      ? getRecentHistory(agentId, orgId, historyLimit)
      : Promise.resolve('')
  );

  const [brandDna, knowledge, recentHistory] = await Promise.all(tasks);

  const contextParts: string[] = [];

  if (brandDna) {
    contextParts.push(brandDna);
  }

  if (knowledge) {
    contextParts.push(knowledge);
  }

  if (recentHistory) {
    contextParts.push(recentHistory);
  }

  const fullContext = contextParts.join('\n\n---\n\n');

  logger.debug(`Context assembled for agent ${agentId}: ${fullContext.length} chars`);

  return {
    systemPrompt: agent.system_prompt || '',
    brandDna,
    knowledge,
    recentHistory,
    fullContext,
  };
}

export const contextEngine = {
  assemble,
};

export default contextEngine;
