import crypto from 'crypto';
import { promises as fs } from 'fs';
import { Queue } from 'bullmq';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';
import * as genxRegistry from './genx-model-registry.service';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

export const generationQueue = new Queue('studio-generations', { connection: redisConnection });

export interface StudioGeneration {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  model: string | null;
  prompt: string | null;
  negative_prompt: string | null;
  options: Record<string, unknown>;
  provider: string;
  provider_job_id: string | null;
  status: string;
  progress: number;
  output_urls: string[];
  primary_output_url: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface StudioAsset {
  id: string;
  organization_id: string;
  user_id: string | null;
  filename: string;
  original_name: string | null;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  url: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

function normalizeOperation(type: string): string {
  if (type === 'cinema') return 'text_to_video';
  return type;
}

async function ensureAvailableModels(operation?: string) {
  const normalized = operation ? normalizeOperation(operation) : undefined;
  let models = await genxRegistry.getAvailableModels(normalized);
  if (models.length > 0) return models;

  const liveModels = await genxRegistry.fetchLiveModelCatalogue();
  if (liveModels.length === 0) {
    throw new AppError(503, 'Amarktai Network is temporarily unavailable', 'GENX_CATALOGUE_UNAVAILABLE');
  }
  await genxRegistry.syncModelsToDatabase(liveModels);
  models = await genxRegistry.getAvailableModels(normalized);
  return models;
}

export async function getAvailableModels(operation?: string) {
  return ensureAvailableModels(operation);
}

export async function createGeneration(
  orgId: string,
  userId: string,
  data: {
    type: string;
    model?: string;
    prompt?: string;
    negative_prompt?: string;
    options?: Record<string, unknown>;
  }
): Promise<StudioGeneration> {
  const operation = normalizeOperation(data.type);
  let modelId = data.model;

  if (modelId) {
    const model = await genxRegistry.getModelById(modelId);
    if (!model || model.available === false || model.deprecated === true) {
      throw new AppError(400, 'The selected Amarktai Network model is not available', 'MODEL_UNAVAILABLE');
    }
    if (!(model.operations || []).includes(operation)) {
      throw new AppError(400, `Selected model does not support ${operation}`, 'MODEL_OPERATION_UNSUPPORTED');
    }
  } else {
    const models = await ensureAvailableModels(operation);
    if (models.length === 0) {
      throw new AppError(400, `No Amarktai Network model is currently available for ${operation}`, 'NO_MODEL_AVAILABLE');
    }
    modelId = models[0].id;
  }

  const idempotencyKey =
    typeof data.options?.idempotency_key === 'string'
      ? data.options.idempotency_key
      : crypto.randomUUID();

  const existing = await query(
    `SELECT * FROM studio_generations
     WHERE organization_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [orgId, idempotencyKey]
  );
  if (existing.rows.length > 0) return mapGenerationRow(existing.rows[0]);

  const result = await query(
    `INSERT INTO studio_generations (
       organization_id, user_id, type, model, prompt, negative_prompt, options,
       provider, status, idempotency_key
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'genx', 'pending', $8)
     RETURNING *`,
    [
      orgId,
      userId,
      data.type,
      modelId,
      data.prompt || null,
      data.negative_prompt || null,
      JSON.stringify(data.options || {}),
      idempotencyKey,
    ]
  );

  const generation = mapGenerationRow(result.rows[0]);
  const job = await generationQueue.add(
    'studio-generate',
    {
      kind: 'studio',
      generationId: generation.id,
      organizationId: orgId,
      userId,
      type: data.type,
      modelId,
      prompt: data.prompt,
      negativePrompt: data.negative_prompt,
      options: data.options || {},
    },
    {
      jobId: `studio-${generation.id}`,
      // Control Centre approvals may be granted after the owner reviews the
      // queued request. Retain the same job/idempotency key while it waits.
      attempts: 60,
      backoff: { type: 'fixed', delay: 30_000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    }
  );

  await query(
    'UPDATE studio_generations SET queue_job_id = $1, updated_at = NOW() WHERE id = $2',
    [String(job.id), generation.id]
  );

  logger.info(`Generation queued: ${generation.id}`);
  return getGeneration(generation.id, orgId);
}

export async function getGeneration(id: string, orgId: string): Promise<StudioGeneration> {
  const result = await query(
    'SELECT * FROM studio_generations WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Generation');
  return mapGenerationRow(result.rows[0]);
}

export async function retryGeneration(id: string, orgId: string, userId: string): Promise<StudioGeneration> {
  const result = await query(
    `SELECT * FROM studio_generations WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Generation');
  const row = result.rows[0];
  if (!['failed','cancelled'].includes(String(row.status))) return mapGenerationRow(row);
  const options = typeof row.options === 'string' ? JSON.parse(row.options) : row.options || {};
  const job = await generationQueue.add('studio-generate', {
    kind: 'studio', generationId: id, organizationId: orgId, userId,
    type: row.type, modelId: row.model, prompt: row.prompt,
    negativePrompt: row.negative_prompt, options,
  }, {
    jobId: `studio-${id}-retry-${Number(row.attempt_count || 0) + 1}`,
    attempts: 60, backoff: { type: 'fixed', delay: 30_000 },
    removeOnComplete: { age: 86400 }, removeOnFail: { age: 604800 },
  });
  await query(
    `UPDATE studio_generations SET status='pending',error_code=NULL,error_message=NULL,
       cancellation_requested_at=NULL,queue_job_id=$1,updated_at=NOW() WHERE id=$2`,
    [String(job.id), id]
  );
  return getGeneration(id, orgId);
}

export async function listGenerations(
  orgId: string,
  userId?: string,
  limit: number = 50
): Promise<StudioGeneration[]> {
  const safeLimit = Math.max(1, Math.min(limit, 200));
  let sql = 'SELECT * FROM studio_generations WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  if (userId) {
    sql += ' AND user_id = $2';
    params.push(userId);
  }
  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(safeLimit);
  const result = await query(sql, params);
  return result.rows.map(mapGenerationRow);
}

export async function cancelGeneration(id: string, orgId: string): Promise<void> {
  const generation = await getGeneration(id, orgId);
  if (['completed', 'failed', 'cancelled'].includes(generation.status)) {
    throw new AppError(400, 'Generation is already in a terminal state', 'CANNOT_CANCEL');
  }

  await query(
    `UPDATE studio_generations
     SET status = 'cancelled', cancellation_requested_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [id, orgId]
  );

  const row = await query(
    'SELECT queue_job_id, provider_job_id FROM studio_generations WHERE id = $1',
    [id]
  );
  const queueJobId = row.rows[0]?.queue_job_id as string | undefined;
  const providerJobId = row.rows[0]?.provider_job_id as string | undefined;

  if (queueJobId) {
    const job = await generationQueue.getJob(queueJobId);
    if (job && !(await job.isActive())) await job.remove().catch(() => undefined);
  }
  if (providerJobId) {
    await genxMultimodalProvider.cancelJob(providerJobId).catch((error) => {
      logger.warn(`Provider cancellation failed for ${providerJobId}: ${error}`);
    });
  }
}

export async function createAsset(
  orgId: string,
  userId: string,
  file: { filename: string; originalName: string; mimeType: string; size: number; path: string }
): Promise<StudioAsset> {
  const result = await query(
    `INSERT INTO studio_assets (
       organization_id, user_id, filename, original_name, mime_type,
       size_bytes, storage_path, url
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
     RETURNING *`,
    [orgId, userId, file.filename, file.originalName, file.mimeType, file.size, file.path]
  );
  const id = result.rows[0].id as string;
  const url = `/api/v1/studio/assets/${id}`;
  const updated = await query(
    'UPDATE studio_assets SET url = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
    [url, id]
  );
  return mapAssetRow(updated.rows[0]);
}

export async function getAsset(id: string): Promise<StudioAsset> {
  const result = await query(
    'SELECT * FROM studio_assets WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (result.rows.length === 0) throw new NotFoundError('Asset');
  return mapAssetRow(result.rows[0]);
}

export async function deleteAsset(id: string, orgId: string): Promise<void> {
  const result = await query(
    `UPDATE studio_assets SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
     RETURNING storage_path`,
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Asset');
  await fs.unlink(result.rows[0].storage_path as string).catch(() => undefined);
}

function mapAssetRow(row: Record<string, unknown>): StudioAsset {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    user_id: row.user_id as string | null,
    filename: row.filename as string,
    original_name: row.original_name as string | null,
    mime_type: row.mime_type as string,
    size_bytes: Number(row.size_bytes || 0),
    storage_path: row.storage_path as string,
    url: (row.url as string) || `/api/v1/studio/assets/${row.id as string}`,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as string,
  };
}

function mapGenerationRow(row: Record<string, unknown>): StudioGeneration {
  const outputUrls = typeof row.output_urls === 'string' ? JSON.parse(row.output_urls) : (row.output_urls as string[]) || [];
  const errorCode = row.error_code as string | null;
  const safeErrorMessage = errorCode === 'pending_control'
    ? 'Generation is paused by your workspace safety controls.'
    : row.error_message
      ? 'Generation could not be completed. Please try again or choose another model.'
      : null;
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    user_id: row.user_id as string,
    type: row.type as string,
    model: row.model as string | null,
    prompt: row.prompt as string | null,
    negative_prompt: row.negative_prompt as string | null,
    options: typeof row.options === 'string' ? JSON.parse(row.options) : (row.options as Record<string, unknown>) || {},
    provider: 'amarktai_network',
    provider_job_id: row.provider_job_id as string | null,
    status: row.status as string,
    progress: Number(row.progress || 0),
    output_urls: outputUrls,
    primary_output_url: outputUrls[0] || null,
    error_code: errorCode,
    error_message: safeErrorMessage,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_at: row.completed_at as string | null,
  };
}
