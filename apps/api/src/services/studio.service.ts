import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';
import * as genxRegistry from './genx-model-registry.service';

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

  // Execute generation asynchronously
  executeGeneration(generation.id, orgId, modelId, data).catch(err => {
    logger.error(`Generation failed: ${err}`);
  });

  return generation;
}

async function executeGeneration(
  generationId: string,
  orgId: string,
  modelId: string,
  data: { type: string; prompt?: string; negative_prompt?: string; options?: Record<string, unknown> }
): Promise<void> {
  try {
    // Build GenX request params
    const params: Record<string, unknown> = {};
    if (data.prompt) params.prompt = data.prompt;
    if (data.negative_prompt) params.negative_prompt = data.negative_prompt;
    if (data.options) {
      Object.assign(params, data.options);
    }

    // Submit to GenX
    const job = await genxMultimodalProvider.generate({
      model: modelId,
      params,
      metadata: { organization_id: orgId, generation_id: generationId, type: data.type },
    });

    // Update with provider job ID
    await query(
      'UPDATE studio_generations SET provider_job_id = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [job.id, job.status === 'queued' ? 'pending' : 'processing', generationId]
    );

    // Poll for completion
    const completedJob = await genxMultimodalProvider.waitForJob(job.id, {
      maxWaitMs: getMaxWaitMs(data.type),
      pollIntervalMs: 3000,
    });

    // Get result
    let outputUrls: string[] = [];
    if (completedJob.result_url) {
      outputUrls = [completedJob.result_url];
    } else if (completedJob.status === 'completed') {
      const result = await genxMultimodalProvider.getJobResult(job.id);
      if (result.url) outputUrls = [result.url];
    }

    if (completedJob.status === 'completed' && outputUrls.length > 0) {
      await query(
        `UPDATE studio_generations SET status = 'completed', output_urls = $1, progress = 100, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(outputUrls), generationId]
      );
      logger.info(`Generation completed: ${generationId}`);
    } else if (completedJob.status === 'failed') {
      await query(
        `UPDATE studio_generations SET status = 'failed', error_code = 'GENERATION_FAILED', error_message = $1, updated_at = NOW() WHERE id = $2`,
        [completedJob.error || 'Unknown error', generationId]
      );
    } else {
      await query(
        `UPDATE studio_generations SET status = 'failed', error_code = 'GENERATION_TIMEOUT', error_message = 'Generation did not complete in time', updated_at = NOW() WHERE id = $1`,
        [generationId]
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await query(
      `UPDATE studio_generations SET status = 'failed', error_code = 'GENERATION_ERROR', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message, generationId]
    );
    logger.error(`Generation error: ${generationId} - ${message}`);
  }
}

function getMaxWaitMs(type: string): number {
  const waits: Record<string, number> = {
    text_generation: 120000,
    text_to_image: 300000,
    image_to_image: 300000,
    image_edit: 300000,
    text_to_video: 1200000,
    image_to_video: 1200000,
    video_to_video: 1200000,
    text_to_speech: 600000,
    speech_to_text: 300000,
    lip_sync: 600000,
  };
  return waits[type] || 300000;
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
