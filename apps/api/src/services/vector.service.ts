import { providerRouter } from '../providers/provider-router';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export async function generateEmbedding(text: string, orgId: string): Promise<number[]> {
  try {
    const { model } = await getEmbeddingConfig(orgId);
    const results = await providerRouter.embeddings(text, model);
    return results[0].embedding;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown embedding error';
    logger.error(`Embedding generation failed: ${message}`);
    throw new AppError(500, `Embedding generation failed: ${message}`, 'EMBEDDING_ERROR');
  }
}

export async function generateEmbeddings(texts: string[], orgId: string): Promise<number[][]> {
  try {
    const { model } = await getEmbeddingConfig(orgId);
    const results = await providerRouter.embeddings(texts, model);
    return results.map((r) => r.embedding);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown embedding error';
    logger.error(`Batch embedding generation failed: ${message}`);
    throw new AppError(500, `Batch embedding generation failed: ${message}`, 'EMBEDDING_ERROR');
  }
}

export async function storeEmbedding(itemId: string, embedding: number[]): Promise<void> {
  const embeddingStr = `[${embedding.join(',')}]`;

  await query(
    `INSERT INTO knowledge_embeddings (item_id, embedding)
     VALUES ($1, $2::vector)
     ON CONFLICT (item_id) DO UPDATE SET embedding = $2::vector, updated_at = NOW()`,
    [itemId, embeddingStr]
  );

  logger.debug(`Embedding stored for item: ${itemId}`);
}

export async function similaritySearch(
  orgId: string,
  embedding: number[],
  limit: number = 10,
  threshold: number = 0.8
): Promise<{ id: string; title: string; content: string; similarity: number }[]> {
  const embeddingStr = `[${embedding.join(',')}]`;

  const result = await query(
    `SELECT
       ki.id,
       ki.title,
       ki.content,
       1 - (ke.embedding <=> $2::vector) AS similarity
     FROM knowledge_items ki
     JOIN knowledge_embeddings ke ON ke.item_id = ki.id
     WHERE ki.organization_id = $1
       AND 1 - (ke.embedding <=> $2::vector) >= $3
     ORDER BY ke.embedding <=> $2::vector
     LIMIT $4`,
    [orgId, embeddingStr, threshold, limit]
  );

  return result.rows.map((row) => ({
    id: row.id as string,
    title: row.title as string | null ?? '',
    content: row.content as string,
    similarity: parseFloat(row.similarity as string),
  }));
}

export async function searchByText(
  orgId: string,
  text: string,
  limit: number = 10
): Promise<{ id: string; title: string; content: string; similarity: number }[]> {
  const embedding = await generateEmbedding(text, orgId);
  return similaritySearch(orgId, embedding, limit, 0);
}

async function getEmbeddingConfig(orgId: string): Promise<{ provider: string; model: string }> {
  const result = await query(
    `SELECT settings FROM organizations WHERE id = $1`,
    [orgId]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'Organization not found', 'NOT_FOUND');
  }

  const settings = typeof result.rows[0].settings === 'string'
    ? JSON.parse(result.rows[0].settings)
    : (result.rows[0].settings || {});

  const embeddingConfig = settings.embedding as Record<string, string> | undefined;

  return {
    provider: embeddingConfig?.provider || 'default',
    model: embeddingConfig?.model || 'text-embedding-ada-002',
  };
}
