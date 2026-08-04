import { query } from '../config/database';
import { store, retrieve, remove } from './memory.service';
import { logger } from '../utils/logger';

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export async function addMessage(
  conversationId: string,
  role: 'system' | 'user' | 'assistant',
  content: string,
  orgId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const key = `conversation:${conversationId}:messages`;
  const existing = await retrieve(key, orgId, 'conversation');

  const messages: ConversationMessage[] = existing
    ? (existing.value as unknown as ConversationMessage[])
    : [];

  messages.push({
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata,
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await store(key, messages as any, 'conversation', orgId, 'conversation', expiresAt);
}

export async function getHistory(
  conversationId: string,
  orgId: string,
  limit: number = 50
): Promise<ConversationMessage[]> {
  const key = `conversation:${conversationId}:messages`;
  const memory = await retrieve(key, orgId, 'conversation');

  if (!memory) {
    return [];
  }

  const messages = memory.value as unknown as ConversationMessage[];
  return messages.slice(-limit);
}

export async function summarize(conversationId: string, orgId: string): Promise<string> {
  const messages = await getHistory(conversationId, orgId, 100);

  if (messages.length === 0) {
    return 'No conversation history.';
  }

  const messageCount = messages.length;
  const userMessages = messages.filter((m) => m.role === 'user');
  const assistantMessages = messages.filter((m) => m.role === 'assistant');

  return `Conversation has ${messageCount} messages (${userMessages.length} from user, ${assistantMessages.length} from assistant). Started at ${messages[0].timestamp}.`;
}

export async function clear(conversationId: string, orgId: string): Promise<void> {
  const key = `conversation:${conversationId}:messages`;
  await remove(key, orgId, 'conversation');
  logger.info(`Conversation cleared: ${conversationId}`);
}

export async function getActiveConversations(orgId: string): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT key FROM memory
     WHERE organization_id = $1
     AND type = 'conversation'
     AND namespace = 'conversation'
     AND key LIKE 'conversation:%:messages'
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [orgId]
  );

  return result.rows.map((row: any) => {
    const match = row.key.match(/conversation:(.+):messages/);
    return match ? match[1] : '';
  }).filter(Boolean);
}
