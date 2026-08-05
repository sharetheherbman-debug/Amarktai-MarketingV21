import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { providerRouter } from '../providers/provider-router';

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
  // GenX only has confirmed text/chat capabilities
  // Media generation models are NOT available through GenX
  return [
    {
      id: 'genx-text',
      name: 'GenX Text Generation',
      type: 'text_generation',
      provider: 'genx',
      status: 'available',
      description: 'Text generation via GenX (confirmed)',
    },
    // Media models - marked as pending since GenX doesn't have confirmed endpoints
    {
      id: 'genx-t2i-pending',
      name: 'GenX Text-to-Image',
      type: 'text_to_image',
      provider: 'genx',
      status: 'pending',
      description: 'GenX mapping pending - no confirmed endpoint',
    },
    {
      id: 'genx-i2i-pending',
      name: 'GenX Image-to-Image',
      type: 'image_to_image',
      provider: 'genx',
      status: 'pending',
      description: 'GenX mapping pending - no confirmed endpoint',
    },
    {
      id: 'genx-t2v-pending',
      name: 'GenX Text-to-Video',
      type: 'text_to_video',
      provider: 'genx',
      status: 'pending',
      description: 'GenX mapping pending - no confirmed endpoint',
    },
    {
      id: 'genx-i2v-pending',
      name: 'GenX Image-to-Video',
      type: 'image_to_video',
      provider: 'genx',
      status: 'pending',
      description: 'GenX mapping pending - no confirmed endpoint',
    },
    {
      id: 'genx-lipsync-pending',
      name: 'GenX Lip Sync',
      type: 'lip_sync',
      provider: 'genx',
      status: 'pending',
      description: 'GenX mapping pending - no confirmed endpoint',
    },
  ];
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
  // Check if the model is available
  const models = getAvailableModels();
  const model = models.find(m => m.id === data.model || m.type === data.type);

  if (!model || model.status !== 'available') {
    // Store the attempt but mark as failed
    const result = await query(
      `INSERT INTO studio_generations (organization_id, user_id, type, model, prompt, negative_prompt, options, provider, status, error_code, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'genx', 'failed', 'GENX_MODALITY_NOT_AVAILABLE', 'This generation type is not yet available through GenX')
       RETURNING *`,
      [orgId, userId, data.type, data.model || null, data.prompt || null, data.negative_prompt || null, JSON.stringify(data.options || {})]
    );
    return mapGenerationRow(result.rows[0]);
  }

  // For text generation, use the existing GenX provider
  if (data.type === 'text_generation' && data.prompt) {
    const result = await query(
      `INSERT INTO studio_generations (organization_id, user_id, type, model, prompt, options, provider, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'genx', 'processing')
       RETURNING *`,
      [orgId, userId, data.type, data.model || 'gpt-4o', data.prompt, JSON.stringify(data.options || {})]
    );

    const generation = mapGenerationRow(result.rows[0]);

    // Execute text generation asynchronously
    executeTextGeneration(generation.id, orgId, data.prompt, data.model || 'gpt-4o').catch(err => {
      logger.error(`Text generation failed: ${err}`);
    });

    return generation;
  }

  // For media types, return honest failure
  const result = await query(
    `INSERT INTO studio_generations (organization_id, user_id, type, model, prompt, negative_prompt, options, provider, status, error_code, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'genx', 'failed', 'GENX_MODALITY_NOT_AVAILABLE', 'Media generation is not yet available through GenX')
     RETURNING *`,
    [orgId, userId, data.type, data.model || null, data.prompt || null, data.negative_prompt || null, JSON.stringify(data.options || {})]
  );
  return mapGenerationRow(result.rows[0]);
}

async function executeTextGeneration(generationId: string, orgId: string, prompt: string, model: string): Promise<void> {
  try {
    const result = await providerRouter.routeRequest(
      [{ role: 'user', content: prompt }],
      model,
      { max_tokens: 2000, temperature: 0.7 },
      { organizationId: orgId }
    );

    await query(
      `UPDATE studio_generations SET status = 'completed', output_urls = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [JSON.stringify([{ type: 'text', content: result.content }]), generationId]
    );

    logger.info(`Text generation completed: ${generationId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await query(
      `UPDATE studio_generations SET status = 'failed', error_code = 'GENERATION_FAILED', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message, generationId]
    );
    logger.error(`Text generation failed: ${generationId} - ${message}`);
  }
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
    output_urls: typeof row.output_urls === 'string' ? JSON.parse(row.output_urls) : (row.output_urls as string[]) || [],
    error_code: row.error_code as string | null,
    error_message: row.error_message as string | null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_at: row.completed_at as string | null,
  };
}
