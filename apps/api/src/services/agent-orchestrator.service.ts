import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { contextEngine } from './context-engine.service';
import { toolService } from './tool.service';
import { generateGovernedText } from './governed-text-generation.service';
import * as usageService from './usage.service';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, ToolCallResult } from '../types';
import { env } from '../config/env';

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

interface RequestedToolCall {
  tool: string;
  input: Record<string, unknown>;
}

function jsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return (value as T) ?? fallback;
}

async function loadAgent(agentId: string, orgId: string): Promise<AgentDefinitionRow> {
  const result = await query('SELECT * FROM agents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL', [agentId, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Agent');
  const row = result.rows[0];
  return {
    ...row,
    config: jsonValue(row.config, {}),
    capabilities: jsonValue(row.capabilities, []),
    tools: jsonValue(row.tools, []),
  } as AgentDefinitionRow;
}

async function getOrCreateConversation(conversationId: string | undefined, agentId: string, orgId: string, title: string): Promise<ConversationRow> {
  if (conversationId) {
    const result = await query('SELECT * FROM agent_conversations WHERE id = $1 AND organization_id = $2 AND agent_id = $3', [conversationId, orgId, agentId]);
    if (result.rows.length === 0) throw new NotFoundError('Conversation');
    return result.rows[0] as ConversationRow;
  }
  const result = await query(
    `INSERT INTO agent_conversations (id, organization_id, agent_id, title, metadata)
     VALUES ($1,$2,$3,$4,'{}'::jsonb) RETURNING *`,
    [uuidv4(), orgId, agentId, title.slice(0, 160)]
  );
  return result.rows[0] as ConversationRow;
}

async function getConversationMessages(conversationId: string): Promise<MessageRow[]> {
  const result = await query('SELECT * FROM agent_messages WHERE conversation_id = $1 ORDER BY created_at ASC', [conversationId]);
  return result.rows as MessageRow[];
}

async function storeMessage(
  conversationId: string,
  role: 'system' | 'user' | 'assistant' | 'tool',
  content: string,
  toolCalls?: Record<string, unknown>[],
  toolCallId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO agent_messages (id, conversation_id, role, content, tool_calls, tool_call_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uuidv4(), conversationId, role, content, toolCalls ? JSON.stringify(toolCalls) : null, toolCallId || null, JSON.stringify(metadata || {})]
  );
}

function toolInstruction(tools: Record<string, unknown>[]): string {
  if (tools.length === 0) return '';
  return `You can use the following tools:\n${JSON.stringify(tools, null, 2)}\n\nWhen a tool is needed, return ONLY valid JSON in this exact shape:\n{"response":"brief reason","tool_calls":[{"name":"tool_name","input":{}}]}\nWhen no tool is needed, answer normally. Never invent a tool name or tool result.`;
}

function parseToolCalls(content: string, allowedTools: Set<string>): { response: string; calls: RequestedToolCall[] } {
  const candidates = [content.trim(), content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>;
      const rawCalls = Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [];
      const calls = rawCalls.flatMap((value): RequestedToolCall[] => {
        if (!value || typeof value !== 'object') return [];
        const row = value as Record<string, unknown>;
        const name = String(row.name || row.tool || '');
        if (!allowedTools.has(name)) return [];
        const input = row.input && typeof row.input === 'object' ? row.input as Record<string, unknown> : {};
        return [{ tool: name, input }];
      });
      if (calls.length > 0) return { response: String(parsed.response || ''), calls };
    } catch {
      // Normal assistant text is not a tool request.
    }
  }
  return { response: content, calls: [] };
}

function buildMessages(agent: AgentDefinitionRow, context: string, history: MessageRow[], userMessage: string, input: Record<string, unknown> | undefined, tools: Record<string, unknown>[]): ChatMessage[] {
  const systemParts = [agent.system_prompt || '', context, input && Object.keys(input).length > 0 ? `Structured input:\n${JSON.stringify(input, null, 2)}` : '', toolInstruction(tools)].filter(Boolean);
  const messages: ChatMessage[] = systemParts.length > 0 ? [{ role: 'system', content: systemParts.join('\n\n---\n\n') }] : [];
  for (const message of history.slice(-40)) {
    if (message.role === 'user' || message.role === 'assistant') messages.push({ role: message.role, content: message.content });
    if (message.role === 'tool') messages.push({ role: 'user', content: `Tool result (${message.tool_call_id || 'tool'}): ${message.content}` });
  }
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

async function runTurn(
  agent: AgentDefinitionRow,
  messages: ChatMessage[],
  tools: Record<string, unknown>[],
  orgId: string,
  userId?: string
): Promise<{ response: string; requestedCalls: RequestedToolCall[]; tokensIn: number; tokensOut: number }> {
  const result = await generateGovernedText({
    organizationId: orgId,
    userId,
    title: `Run ${agent.name} agent turn`,
    summary: 'Generate a governed draft or select an allowed tool',
    messages,
    maxTokens: 4000,
    temperature: 0.4,
    payload: { purpose: 'agent_turn', agent_id: agent.id },
  });
  const allowedTools = new Set(tools.map((tool) => String((tool.function as Record<string, unknown> | undefined)?.name || '')));
  const parsed = parseToolCalls(result.content, allowedTools);
  return { response: parsed.response, requestedCalls: parsed.calls, tokensIn: result.tokensIn, tokensOut: result.tokensOut };
}

export async function execute(options: ExecuteOptions): Promise<AgentResponse> {
  const { agentId, orgId, userId, task, input, conversationId, maxTurns = 5 } = options;
  if (!orgId) throw new AppError(400, 'Organization ID required', 'BAD_REQUEST');
  const agent = await loadAgent(agentId, orgId);
  if (agent.status !== 'active') throw new AppError(400, 'Agent is not active', 'AGENT_INACTIVE');

  const userMessage = task || (input ? JSON.stringify(input) : 'Please proceed with the task.');
  const context = await contextEngine.assemble({
    orgId,
    agentId,
    includeBrandDna: true,
    includeKnowledge: true,
    includeHistory: !!conversationId,
    historyLimit: 20,
    knowledgeQuery: userMessage,
  });
  const conversation = await getOrCreateConversation(conversationId, agentId, orgId, userMessage);
  const history = await getConversationMessages(conversation.id);
  await storeMessage(conversation.id, 'user', userMessage, undefined, undefined, { input, task });

  const tools = await toolService.getToolDefinitions(agent.tools || []);
  let messages = buildMessages(agent, context.fullContext, history, userMessage, input, tools);
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostCents = 0;
  let finalResponse = '';
  let turns = 0;
  const allToolCalls: ToolCallResult[] = [];

  for (let turn = 0; turn < Math.max(1, Math.min(maxTurns, 10)); turn++) {
    turns++;
    const result = await runTurn(agent, messages, tools, orgId, userId);
    totalTokensIn += result.tokensIn;
    totalTokensOut += result.tokensOut;
    totalCostCents += usageService.estimateCost('genx', agent.model || env.DEFAULT_TEXT_MODEL, result.tokensIn, result.tokensOut);
    finalResponse = result.response;

    await storeMessage(
      conversation.id,
      'assistant',
      result.response,
      result.requestedCalls.map((call) => ({ tool: call.tool, input: call.input })),
      undefined,
      { tokensIn: result.tokensIn, tokensOut: result.tokensOut }
    );

    if (result.requestedCalls.length === 0) break;

    const turnResults: ToolCallResult[] = [];
    for (const call of result.requestedCalls) {
      const toolResult = await toolService.execute(call.tool, call.input, orgId);
      allToolCalls.push(toolResult);
      turnResults.push(toolResult);
      await storeMessage(conversation.id, 'tool', JSON.stringify(toolResult.output), undefined, call.tool, { success: toolResult.success, error: toolResult.error });
    }

    messages.push({ role: 'assistant', content: result.response || 'I will use the requested tools.' });
    messages.push({
      role: 'user',
      content: `Tool execution results:\n${JSON.stringify(turnResults, null, 2)}\n\nUse these real results to continue. Request another tool only when necessary; otherwise provide the final answer.`,
    });
  }

  await query('UPDATE agent_conversations SET updated_at = NOW() WHERE id = $1', [conversation.id]);
  logger.info(`Agent ${agentId} completed ${turns} turns with ${allToolCalls.length} tool calls`);
  return {
    conversationId: conversation.id,
    response: finalResponse,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
    tokensUsed: { in: totalTokensIn, out: totalTokensOut },
    costCents: totalCostCents,
    turns,
  };
}

export async function getConversation(conversationId: string, orgId: string): Promise<{ conversation: ConversationRow; messages: MessageRow[] }> {
  const result = await query('SELECT * FROM agent_conversations WHERE id = $1 AND organization_id = $2', [conversationId, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Conversation');
  return { conversation: result.rows[0] as ConversationRow, messages: await getConversationMessages(conversationId) };
}

export async function listConversations(orgId: string, agentId?: string, limit = 20): Promise<ConversationRow[]> {
  const params: unknown[] = [orgId];
  let sql = 'SELECT * FROM agent_conversations WHERE organization_id = $1';
  if (agentId) { sql += ' AND agent_id = $2'; params.push(agentId); }
  sql += ` ORDER BY updated_at DESC LIMIT $${params.length + 1}`;
  params.push(Math.max(1, Math.min(limit, 100)));
  const result = await query(sql, params);
  return result.rows as ConversationRow[];
}

export async function deleteConversation(conversationId: string, orgId: string): Promise<void> {
  const result = await query('DELETE FROM agent_conversations WHERE id = $1 AND organization_id = $2 RETURNING id', [conversationId, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Conversation');
}

export const agentOrchestrator = { execute, getConversation, listConversations, deleteConversation };
export default agentOrchestrator;
