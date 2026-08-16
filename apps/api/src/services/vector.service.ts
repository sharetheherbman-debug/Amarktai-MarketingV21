import crypto from 'crypto';
import { providerRouter } from '../providers/provider-router';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude > 0 ? vector.map((value) => value / magnitude) : vector;
}

function fitDimensions(vector: number[], dimensions: number): number[] {
  if (vector.length === dimensions) return normalizeVector(vector);
  const projected = new Array<number>(dimensions).fill(0);
  for (let index = 0; index < vector.length; index++) {
    const hash = crypto.createHash('sha256').update(String(index)).digest();
    const target = hash.readUInt32BE(0) % dimensions;
    projected[target] += vector[index] * (hash[4] % 2 === 0 ? 1 : -1);
  }
  return normalizeVector(projected);
}

function localEmbedding(text: string, dimensions = env.EMBEDDING_DIMENSIONS): number[] {
  const tokens = text
    .toLowerCase()
    .normalize('NFKC')
    .match(/[\p{L}\p{N}]+/gu) || [];
  if (tokens.length === 0) throw new AppError(400, 'Cannot embed empty text', 'EMBEDDING_INPUT_EMPTY');

  const features: string[] = [...tokens];
  for (let index = 0; index < tokens.length - 1; index++) {
    features.push(`${tokens[index]}_${tokens[index + 1]}`);
  }

  const counts = new Map<string, number>();
  for (const feature of features) counts.set(feature, (counts.get(feature) || 0) + 1);

  const vector = new Array<number>(dimensions).fill(0);
  for (const [feature, count] of counts) {
    const hash = crypto.createHash('sha256').update(feature).digest();
    const index = hash.readUInt32BE(0) % dimensions;
    const sign = hash[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.log(count));
  }
  return normalizeVector(vector);
}

async function getEmbeddingConfig(orgId: string): Promise<{ model: string }> {
  const result = await query('SELECT settings FROM organizations WHERE id = $1', [orgId]);
  if (result.rows.length === 0) throw new AppError(404, 'Organization not found', 'NOT_FOUND');
  const settings = typeof result.rows[0].settings === 'string'
    ? JSON.parse(result.rows[0].settings)
    : (result.rows[0].settings || {});
  const embedding = settings.embedding && typeof settings.embedding === 'object'
    ? settings.embedding as Record<string, unknown>
    : {};
  return {
    model: String(embedding.model || 'local-hash-embedding-v1'),
  };
}

export async function generateEmbedding(text: string, orgId: string): Promise<number[]> {
  const { model } = await getEmbeddingConfig(orgId);
  if (model) {
    try {
      const results = await providerRouter.embeddings(text, model);
      if (results[0]?.embedding?.length) return fitDimensions(results[0].embedding, env.EMBEDDING_DIMENSIONS);
    } catch (error) {
      logger.warn(`External embedding generation failed; using local embedding: ${error}`);
    }
  }
  if (!env.LOCAL_EMBEDDINGS_ENABLED) {
    throw new AppError(503, 'No working embedding provider is configured and local embeddings are disabled', 'EMBEDDING_UNAVAILABLE');
  }
  return localEmbedding(text);
}

export async function generateEmbeddings(texts: string[], orgId: string): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { model } = await getEmbeddingConfig(orgId);
  if (model) {
    try {
      const results = await providerRouter.embeddings(texts, model);
      if (results.length === texts.length && results.every((result) => result.embedding?.length)) {
        return results.map((result) => fitDimensions(result.embedding, env.EMBEDDING_DIMENSIONS));
      }
      logger.warn('External embedding provider returned an incomplete batch; using local embeddings');
    } catch (error) {
      logger.warn(`Batch embedding generation failed; using local embeddings: ${error}`);
    }
  }
  if (!env.LOCAL_EMBEDDINGS_ENABLED) {
    throw new AppError(503, 'No working embedding provider is configured and local embeddings are disabled', 'EMBEDDING_UNAVAILABLE');
  }
  return texts.map((text) => localEmbedding(text));
}

export async function storeEmbedding(itemId: string, embedding: number[]): Promise<void> {
  const vector = fitDimensions(embedding, env.EMBEDDING_DIMENSIONS);
  await query(
    `INSERT INTO knowledge_embeddings (item_id, embedding)
     VALUES ($1, $2::vector)
     ON CONFLICT (item_id) DO UPDATE SET embedding = $2::vector, updated_at = NOW()`,
    [itemId, `[${vector.join(',')}]`]
  );
  logger.debug(`Embedding stored for item: ${itemId}`);
}

export async function similaritySearch(
  orgId: string,
  embedding: number[],
  limit: number = 10,
  threshold: number = 0.8
): Promise<{ id: string; title: string; content: string; similarity: number }[]> {
  const vector = fitDimensions(embedding, env.EMBEDDING_DIMENSIONS);
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
    [orgId, `[${vector.join(',')}]`, threshold, limit]
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    title: row.title ? String(row.title) : '',
    content: String(row.content),
    similarity: Number(row.similarity || 0),
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
