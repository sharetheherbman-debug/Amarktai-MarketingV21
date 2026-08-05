import { query } from '../config/database';
import { logger } from '../utils/logger';
import { env } from '../config/env';

// Types
export interface GenXModel {
  id: string;
  name: string;
  vendor: string | null;
  inputs: string[];
  outputs: string[];
  operations: string[];
  endpoint: string | null;
  asynchronous: boolean;
  status: 'available' | 'unavailable' | 'deprecated';
  context_length: number | null;
  raw_metadata: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
  last_verified: string;
}

export interface GenXModelSyncResult {
  total_models: number;
  new_models: number;
  updated_models: number;
  removed_models: number;
  timestamp: string;
}

// ─── Model Classification ────────────────────────────────────────────────────

function classifyModel(raw: Record<string, unknown>): GenXModel {
  const id = raw.id as string || '';
  const name = (raw.name as string) || id;
  const vendor = id.split('/')[0] || raw.vendor as string || null;

  const inputs: string[] = [];
  const outputs: string[] = [];
  const operations: string[] = [];

  // Classify by model ID patterns and metadata
  const idLower = id.toLowerCase();
  const nameLower = name.toLowerCase();

  // Text models
  if (idLower.includes('gpt') || idLower.includes('claude') || idLower.includes('llama') ||
      idLower.includes('mistral') || idLower.includes('mixtral') || idLower.includes('gemini') ||
      idLower.includes('deepseek') || idLower.includes('qwen') || idLower.includes('command') ||
      idLower.includes('phi') || idLower.includes('gemma') || idLower.includes('yi-')) {
    inputs.push('text');
    outputs.push('text');
    operations.push('chat');
  }

  // Vision models
  if (idLower.includes('vision') || idLower.includes('-v') || idLower.includes('gpt-4o') ||
      idLower.includes('claude-3') || idLower.includes('gemini-pro-vision')) {
    if (!inputs.includes('image')) inputs.push('image');
    if (!operations.includes('vision')) operations.push('vision');
  }

  // Embedding models
  if (idLower.includes('embed') || idLower.includes('embedding')) {
    inputs.push('text');
    outputs.push('embedding');
    operations.push('embedding');
  }

  // Image generation models
  if (idLower.includes('dall-e') || idLower.includes('dalle') || idLower.includes('stable-diffusion') ||
      idLower.includes('sdxl') || idLower.includes('midjourney') || idLower.includes('flux') ||
      idLower.includes('imagen') || idLower.includes('kandinsky') || idLower.includes('playground')) {
    inputs.push('text');
    outputs.push('image');
    operations.push('text_to_image');
  }

  if (idLower.includes('inpaint') || idLower.includes('edit')) {
    inputs.push('text', 'image');
    outputs.push('image');
    operations.push('image_edit');
  }

  // Video generation models
  if (idLower.includes('video') || idLower.includes('sora') || idLower.includes('runway') ||
      idLower.includes('pika') || idLower.includes('kling') || idLower.includes('luma') ||
      idLower.includes('gen-') || idLower.includes('veo')) {
    inputs.push('text');
    outputs.push('video');
    operations.push('text_to_video');
  }

  // Audio models
  if (idLower.includes('whisper') || idLower.includes('tts') || idLower.includes('speech') ||
      idLower.includes('audio') || idLower.includes('bark') || idLower.includes('elevenlabs')) {
    if (idLower.includes('whisper') || idLower.includes('stt')) {
      inputs.push('audio');
      outputs.push('text');
      operations.push('speech_to_text');
    } else {
      inputs.push('text');
      outputs.push('audio');
      operations.push('text_to_speech');
    }
  }

  // Default to text if nothing classified
  if (inputs.length === 0) {
    inputs.push('text');
    outputs.push('text');
    operations.push('chat');
  }

  return {
    id,
    name,
    vendor,
    inputs,
    outputs,
    operations,
    endpoint: raw.endpoint as string || null,
    asynchronous: raw.async === true || idLower.includes('video') || idLower.includes('sora'),
    status: 'available',
    context_length: (raw.context_length as number) || (raw.max_context_length as number) || null,
    raw_metadata: raw,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    last_verified: new Date().toISOString(),
  };
}

// ─── Live Catalogue Retrieval ────────────────────────────────────────────────

export async function fetchLiveModelCatalogue(): Promise<GenXModel[]> {
  const baseUrl = env.GENX_BASE_URL;
  const apiKey = env.GENX_API_KEY;

  if (!apiKey) {
    logger.warn('GENX_API_KEY not configured');
    return [];
  }

  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error(`GenX models fetch failed: ${response.status} - ${error}`);
      return [];
    }

    const data = await response.json() as { data: Array<Record<string, unknown>> };
    const rawModels = data.data || [];

    logger.info(`Retrieved ${rawModels.length} models from GenX`);

    // Classify each model
    const models = rawModels.map(m => classifyModel(m));

    return models;
  } catch (error) {
    logger.error(`GenX model fetch error: ${error}`);
    return [];
  }
}

// ─── Database Sync ───────────────────────────────────────────────────────────

export async function syncModelsToDatabase(models: GenXModel[]): Promise<GenXModelSyncResult> {
  const timestamp = new Date().toISOString();

  // Get existing models
  const existing = await query('SELECT id FROM genx_models');
  const existingIds = new Set(existing.rows.map(r => r.id as string));
  const newIds = new Set(models.map(m => m.id));

  let newCount = 0;
  let updatedCount = 0;

  for (const model of models) {
    if (existingIds.has(model.id)) {
      // Update existing
      await query(
        `UPDATE genx_models SET
          name = $2, vendor = $3, inputs = $4, outputs = $5, operations = $6,
          endpoint = $7, asynchronous = $8, status = $9, context_length = $10,
          raw_metadata = $11, last_seen = $12, last_verified = $13
        WHERE id = $1`,
        [model.id, model.name, model.vendor, JSON.stringify(model.inputs),
         JSON.stringify(model.outputs), JSON.stringify(model.operations),
         model.endpoint, model.asynchronous, model.status, model.context_length,
         JSON.stringify(model.raw_metadata), timestamp, timestamp]
      );
      updatedCount++;
    } else {
      // Insert new
      await query(
        `INSERT INTO genx_models (id, name, vendor, inputs, outputs, operations, endpoint, asynchronous, status, context_length, raw_metadata, first_seen, last_seen, last_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [model.id, model.name, model.vendor, JSON.stringify(model.inputs),
         JSON.stringify(model.outputs), JSON.stringify(model.operations),
         model.endpoint, model.asynchronous, model.status, model.context_length,
         JSON.stringify(model.raw_metadata), timestamp, timestamp, timestamp]
      );
      newCount++;
    }
  }

  // Mark removed models
  const removedIds = [...existingIds].filter(id => !newIds.has(id));
  for (const id of removedIds) {
    await query("UPDATE genx_models SET status = 'unavailable', last_seen = $2 WHERE id = $1", [id, timestamp]);
  }

  // Log sync run
  await query(
    `INSERT INTO genx_model_sync_runs (total_models, new_models, updated_models, removed_models, completed_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [models.length, newCount, updatedCount, removedIds.length, timestamp]
  );

  logger.info(`GenX model sync: ${models.length} total, ${newCount} new, ${updatedCount} updated, ${removedIds.length} removed`);

  return {
    total_models: models.length,
    new_models: newCount,
    updated_models: updatedCount,
    removed_models: removedIds.length,
    timestamp,
  };
}

// ─── Model Queries ───────────────────────────────────────────────────────────

export async function getAvailableModels(operation?: string): Promise<GenXModel[]> {
  let sql = "SELECT * FROM genx_models WHERE status = 'available'";
  const params: unknown[] = [];

  if (operation) {
    sql += " AND operations ? $1";
    params.push(operation);
  }

  sql += ' ORDER BY name';
  const result = await query(sql, params);
  return result.rows.map(mapModelRow);
}

export async function getModelById(id: string): Promise<GenXModel | null> {
  const result = await query('SELECT * FROM genx_models WHERE id = $1', [id]);
  return result.rows.length > 0 ? mapModelRow(result.rows[0]) : null;
}

export async function getModelsByCapability(capability: string): Promise<GenXModel[]> {
  const result = await query(
    "SELECT * FROM genx_models WHERE status = 'available' AND operations ? $1 ORDER BY name",
    [capability]
  );
  return result.rows.map(mapModelRow);
}

export async function getModelStats(): Promise<Record<string, unknown>> {
  const result = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'available') as available,
      COUNT(DISTINCT vendor) as vendors,
      COUNT(*) FILTER (WHERE operations ? 'chat') as text_models,
      COUNT(*) FILTER (WHERE operations ? 'text_to_image') as image_models,
      COUNT(*) FILTER (WHERE operations ? 'text_to_video') as video_models,
      COUNT(*) FILTER (WHERE operations ? 'text_to_speech') as audio_models,
      COUNT(*) FILTER (WHERE operations ? 'embedding') as embedding_models
    FROM genx_models
  `);
  return result.rows[0];
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapModelRow(row: Record<string, unknown>): GenXModel {
  return {
    id: row.id as string,
    name: row.name as string,
    vendor: row.vendor as string | null,
    inputs: typeof row.inputs === 'string' ? JSON.parse(row.inputs) : (row.inputs as string[]) || [],
    outputs: typeof row.outputs === 'string' ? JSON.parse(row.outputs) : (row.outputs as string[]) || [],
    operations: typeof row.operations === 'string' ? JSON.parse(row.operations) : (row.operations as string[]) || [],
    endpoint: row.endpoint as string | null,
    asynchronous: row.asynchronous as boolean,
    status: row.status as GenXModel['status'],
    context_length: row.context_length ? parseInt(row.context_length as string) : null,
    raw_metadata: typeof row.raw_metadata === 'string' ? JSON.parse(row.raw_metadata) : (row.raw_metadata as Record<string, unknown>) || {},
    first_seen: row.first_seen as string,
    last_seen: row.last_seen as string,
    last_verified: row.last_verified as string,
  };
}
