import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { contextEngine } from './context-engine.service';
import { toolService } from './tool.service';
import { providerRouter } from '../providers/provider-router';
import * as usageService from './usage.service';
import { v4 as uuidv4 } from 'uuid';
import {
  Agent,
  AgentDefinition,
  AgentConversation,
  ConversationMessage,
  ChatMessage,
  ToolCallResult,
} from '../types';

export interface ExecuteOptions {
  agentId: string;
  orgId: string;
  userId?: string;
  task?: string;
  input?: Record<string, unknown>;
  conversationId?: string;
  maxTurns?: number;
}

export interface AgentResponse {
  conversationId: string;
  response: string;
  toolCalls?: ToolCallResult[];
  tokensUsed: { in: number; out: number };
  costCents: number;
  turns: number;
}

interface AgentDefinitionRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  type: string;
  config: Record<string, unknown>;
  system_prompt: string | null;
  model: string | null;
  provider: string | null;
  status: string;
  capabilities: string[];
  tools: string[];
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface ConversationRow {
  id: string;
  organization_id: string;
  agent_id: string;
  title: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  tool_calls: Record<string, unknown>[] | null;
  tool_call_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

async function loadAgent(agentId: string, orgId: string): Promise<AgentDefinitionRow> {
  const result = await query(
    `SELECT * FROM agents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [agentId, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Agent');
  }

  return result.rows[0];
}

async function getOrCreateConversation(
  conversationId: string | undefined,
  agentId: string,
  orgId: string
): Promise<ConversationRow> {
  if (conversationId) {
    const result = await query(
      `SELECT * FROM agent_conversations WHERE id = $1 AND organization_id = $2 AND agent_id = $3`,
      [conversationId, orgId, agentId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Conversation');
    }

    return result.rows[0];
  }

  const result = await query(
    `INSERT INTO agent_conversations (id, organization_id, agent_id, title, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [uuidv4(), orgId, agentId, null, JSON.stringify({})]
  );

  return result.rows[0];
}

async function getConversationMessages(conversationId: string): Promise<MessageRow[]> {
  const result = await query(
    `SELECT * FROM agent_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  );

  return result.rows;
}

async function storeMessage(
  conversationId: string,
  role: 'system' | 'user' | 'assistant' | 'tool',
  content: string,
  toolCalls?: Record<string, unknown>[],
  toolCallId?: string,
  metadata?: Record<string, unknown>
): Promise<MessageRow> {
  const result = await query(
    `INSERT INTO agent_messages (id, conversation_id, role, content, tool_calls, tool_call_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      uuidv4(),
      conversationId,
      role,
      content,
      toolCalls ? JSON.stringify(toolCalls) : null,
      toolCallId || null,
      JSON.stringify(metadata || {}),
    ]
  );

  return result.rows[0];
}

async function buildMessagesArray(
  agent: AgentDefinitionRow,
  context: string,
  history: MessageRow[],
  userMessage: string,
  input?: Record<string, unknown>
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];

  const systemParts: string[] = [];

  if (agent.system_prompt) {
    systemParts.push(agent.system_prompt);
  }

  if (context) {
    systemParts.push(context);
  }

  if (input && Object.keys(input).length > 0) {
    systemParts.push(`User Input:\n${JSON.stringify(input, null, 2)}`);
  }

  if (systemParts.length > 0) {
    messages.push({
      role: 'system',
      content: systemParts.join('\n\n---\n\n'),
    });
  }

  for (const msg of history) {
    if (msg.role === 'system') continue;

    const chatMsg: ChatMessage = {
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    };

    messages.push(chatMsg);
  }

  if (userMessage) {
    messages.push({
      role: 'user',
      content: userMessage,
    });
  }

  return messages;
}

async function runTurn(
  agent: AgentDefinitionRow,
  messages: ChatMessage[],
  tools: Record<string, unknown>[],
  orgId: string,
  userId?: string
): Promise<{ response: string; toolCalls: ToolCallResult[]; tokensIn: number; tokensOut: number }> {
  const model = agent.model || 'gpt-4o-mini';
  const providerName = agent.provider || undefined;

  let result;

  if (providerName) {
    const providers = await query(
      `SELECT * FROM ai_providers WHERE name = $1 AND enabled = true`,
      [providerName]
    );

    if (providers.rows.length > 0) {
      result = await providerRouter.routeRequest(messages, model, undefined, {
        organizationId: orgId,
        userId,
      });
    } else {
      result = await providerRouter.routeRequest(messages, model, undefined, {
        organizationId: orgId,
        userId,
      });
    }
  } else {
    result = await providerRouter.routeRequest(messages, model, undefined, {
      organizationId: orgId,
      userId,
    });
  }

  const toolCalls: ToolCallResult[] = [];

  return {
    response: result.content,
    toolCalls,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  };
}

export async function execute(options: ExecuteOptions): Promise<AgentResponse> {
  const { agentId, orgId, userId, task, input, conversationId, maxTurns = 5 } = options;

  logger.info(`Executing agent ${agentId} for org ${orgId}`);

  const agent = await loadAgent(agentId, orgId);

  if (agent.status !== 'active') {
    throw new AppError(400, 'Agent is not active', 'AGENT_INACTIVE');
  }

  const context = await contextEngine.assemble({
    orgId,
    agentId,
    includeBrandDna: true,
    includeKnowledge: true,
    includeHistory: !!conversationId,
    historyLimit: 20,
    knowledgeQuery: task || JSON.stringify(input),
  });

  const conversation = await getOrCreateConversation(conversationId, agentId, orgId);

  const history = await getConversationMessages(conversation.id);

  const userMessage = task || (input ? JSON.stringify(input) : 'Please proceed with the task.');

  await storeMessage(conversation.id, 'user', userMessage, undefined, undefined, {
    input,
    task,
  });

  const tools = await toolService.getToolDefinitions(agent.tools || []);

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostCents = 0;
  let turns = 0;
  let finalResponse = '';
  const allToolCalls: ToolCallResult[] = [];

  let currentMessages = await buildMessagesArray(agent, context.fullContext, history, userMessage, input);

  for (let turn = 0; turn < maxTurns; turn++) {
    turns++;

    const turnResult = await runTurn(agent, currentMessages, tools, orgId, userId);

    totalTokensIn += turnResult.tokensIn;
    totalTokensOut += turnResult.tokensOut;

    const costCents = usageService.estimateCost(
      agent.provider || 'default',
      agent.model || 'gpt-4o-mini',
      turnResult.tokensIn,
      turnResult.tokensOut
    );
    totalCostCents += costCents;

    finalResponse = turnResult.response;

    if (turnResult.toolCalls.length === 0) {
      await storeMessage(conversation.id, 'assistant', turnResult.response, undefined, undefined, {
        tokensIn: turnResult.tokensIn,
        tokensOut: turnResult.tokensOut,
      });
      break;
    }

    await storeMessage(conversation.id, 'assistant', turnResult.response, turnResult.toolCalls as any, undefined, {
      tokensIn: turnResult.tokensIn,
      tokensOut: turnResult.tokensOut,
    });

    for (const toolCall of turnResult.toolCalls) {
      const toolResult = await toolService.execute(toolCall.tool, toolCall.input, orgId);
      allToolCalls.push(toolResult);

      await storeMessage(
        conversation.id,
        'tool',
        JSON.stringify(toolResult.output),
        undefined,
        toolCall.tool,
        { toolName: toolCall.tool, success: toolResult.success }
      );

      currentMessages.push({
        role: 'assistant',
        content: '',
      });

      currentMessages.push({
        role: 'user' as any,
        content: `Tool result for ${toolCall.tool}:\n${JSON.stringify(toolResult.output)}`,
      });
    }
  }

  await query(
    `UPDATE agent_conversations SET updated_at = NOW() WHERE id = $1`,
    [conversation.id]
  );

  logger.info(
    `Agent execution complete: ${turns} turns, ${totalTokensIn} tokens in, ${totalTokensOut} tokens out, $${(totalCostCents / 100).toFixed(4)}`
  );

  return {
    conversationId: conversation.id,
    response: finalResponse,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    tokensUsed: { in: totalTokensIn, out: totalTokensOut },
    costCents: totalCostCents,
    turns,
  };
}

export async function getConversation(
  conversationId: string,
  orgId: string
): Promise<{ conversation: ConversationRow; messages: MessageRow[] }> {
  const convResult = await query(
    `SELECT * FROM agent_conversations WHERE id = $1 AND organization_id = $2`,
    [conversationId, orgId]
  );

  if (convResult.rows.length === 0) {
    throw new NotFoundError('Conversation');
  }

  const messages = await getConversationMessages(conversationId);

  return {
    conversation: convResult.rows[0],
    messages,
  };
}

export async function listConversations(
  orgId: string,
  agentId?: string,
  limit: number = 20
): Promise<ConversationRow[]> {
  let sql = `SELECT * FROM agent_conversations WHERE organization_id = $1`;
  const params: any[] = [orgId];
  let paramCount = 2;

  if (agentId) {
    sql += ` AND agent_id = $${paramCount++}`;
    params.push(agentId);
  }

  sql += ` ORDER BY updated_at DESC LIMIT $${paramCount}`;
  params.push(limit);

  const result = await query(sql, params);
  return result.rows;
}

export async function deleteConversation(conversationId: string, orgId: string): Promise<void> {
  const result = await query(
    `DELETE FROM agent_conversations WHERE id = $1 AND organization_id = $2 RETURNING id`,
    [conversationId, orgId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Conversation');
  }

  logger.info(`Conversation deleted: ${conversationId}`);
}

export const agentOrchestrator = {
  execute,
  getConversation,
  listConversations,
  deleteConversation,
};

export default agentOrchestrator;
