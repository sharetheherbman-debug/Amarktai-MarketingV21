import { Queue } from 'bullmq';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';
import * as genxRegistry from './genx-model-registry.service';

const generationQueue = new Queue('studio-generations', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

// Types
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

export interface StudioModel {
  id: string;
  name: string;
  type: string; // 'text_to_image', 'image_to_image', 'text_to_video', etc.
  provider: string;
  status: 'available' | 'pending' | 'unsupported';
  description: string;
}

// ─── Model Catalogue ─────────────────────────────────────────────────────────

export function getAvailableModels(): StudioModel[] {
  // This is a sync function for backward compatibility
  // In production, models come from the genx_models database table
  // For now, return models that will be populated by the sync process
  return [
    {
      id: 'genx-sync-required',
      name: 'Sync GenX Models',
      type: 'text_generation',
      provider: 'genx',
      status: 'available',
      description: 'Run model sync from admin panel to discover available models',
    },
  ];
}

export async function getAvailableModelsAsync(): Promise<StudioModel[]> {
  // Get models from the live GenX registry
  const genxModels = await genxRegistry.getAvailableModels();

  if (genxModels.length === 0) {
    return getAvailableModels();
  }

  // Map GenX models to Studio models
  return genxModels.map(model => ({
    id: model.id,
    name: model.name,
    type: getPrimaryOperation(model.operations || []),
    provider: 'genx',
    status: model.available ? 'available' : 'pending',
    description: `${model.vendor ? model.vendor + ' - ' : ''}${(model.operations || []).join(', ')}`,
  }));
}

function getPrimaryOperation(operations: string[]): string {
  if (operations.includes('text_to_image')) return 'text_to_image';
  if (operations.includes('image_to_image')) return 'image_to_image';
  if (operations.includes('text_to_video')) return 'text_to_video';
  if (operations.includes('image_to_video')) return 'image_to_video';
  if (operations.includes('lip_sync')) return 'lip_sync';
  if (operations.includes('text_to_speech')) return 'text_to_speech';
  if (operations.includes('speech_to_text')) return 'speech_to_text';
  if (operations.includes('vision')) return 'vision';
  if (operations.includes('embedding')) return 'embedding';
  return 'chat';
}

// ─── Generation Requests ─────────────────────────────────────────────────────

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
  // Find an appropriate model for this generation type
  let modelId = data.model;
  if (!modelId) {
    const models = await genxRegistry.getAvailableModels(data.type);
    if (models.length === 0) {
      const result = await query(
        `INSERT INTO studio_generations (organization_id, user_id, type, model, prompt, negative_prompt, options, provider, status, error_code, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'genx', 'failed', 'NO_MODEL_AVAILABLE', 'No GenX model available for this generation type')
         RETURNING *`,
        [orgId, userId, data.type, null, data.prompt || null, data.negative_prompt || null, JSON.stringify(data.options || {})]
      );
      return mapGenerationRow(result.rows[0]);
    }
    modelId = models[0].id;
  }

  // Create the generation record
  const result = await query(
    `INSERT INTO studio_generations (organization_id, user_id, type, model, prompt, negative_prompt, options, provider, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'genx', 'pending')
     RETURNING *`,
    [orgId, userId, data.type, modelId, data.prompt || null, data.negative_prompt || null, JSON.stringify(data.options || {})]
  );

  const generation = mapGenerationRow(result.rows[0]);

  // Enqueue generation job
  await generationQueue.add('generate', {
    generationId: generation.id,
    organizationId: orgId,
    userId,
    type: data.type,
    modelId,
    prompt: data.prompt,
    negativePrompt: data.negative_prompt,
    options: data.options,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });

  logger.info(`Generation queued: ${generation.id}`);
  return generation;
}

export async function getGeneration(id: string, orgId: string): Promise<StudioGeneration> {
  const result = await query(
    'SELECT * FROM studio_generations WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Generation');
  return mapGenerationRow(result.rows[0]);
}

export async function listGenerations(orgId: string, userId?: string, limit: number = 50): Promise<StudioGeneration[]> {
  let sql = 'SELECT * FROM studio_generations WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  if (userId) { sql += ' AND user_id = $2'; params.push(userId); }
  sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
  params.push(limit);

  const result = await query(sql, params);
  return result.rows.map(mapGenerationRow);
}

export async function cancelGeneration(id: string, orgId: string): Promise<void> {
  const gen = await getGeneration(id, orgId);
  if (['completed', 'failed', 'cancelled'].includes(gen.status)) {
    throw new AppError(400, 'Cannot cancel a completed generation', 'CANNOT_CANCEL');
  }
  await query(
    "UPDATE studio_generations SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
    [id]
  );
}

// ─── Uploads ─────────────────────────────────────────────────────────────────

export async function createUpload(
  orgId: string,
  userId: string,
  file: { filename: string; originalName: string; mimeType: string; size: number; path: string }
): Promise<{ id: string; url: string }> {
  const result = await query(
    `INSERT INTO studio_uploads (organization_id, user_id, filename, original_name, mime_type, size_bytes, storage_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [orgId, userId, file.filename, file.originalName, file.mimeType, file.size, file.path]
  );

  return {
    id: result.rows[0].id as string,
    url: `/uploads/${file.filename}`,
  };
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapGenerationRow(row: Record<string, unknown>): StudioGeneration {
  const outputUrls = typeof row.output_urls === 'string' ? JSON.parse(row.output_urls) : (row.output_urls as string[]) || [];
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    user_id: row.user_id as string,
    type: row.type as string,
    model: row.model as string | null,
    prompt: row.prompt as string | null,
    negative_prompt: row.negative_prompt as string | null,
    options: typeof row.options === 'string' ? JSON.parse(row.options) : (row.options as Record<string, unknown>) || {},
    provider: row.provider as string,
    provider_job_id: row.provider_job_id as string | null,
    status: row.status as string,
    progress: parseInt(row.progress as string) || 0,
    output_urls: outputUrls,
    primary_output_url: outputUrls[0] || null,
    error_code: row.error_code as string | null,
    error_message: row.error_message as string | null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_at: row.completed_at as string | null,
  };
}
