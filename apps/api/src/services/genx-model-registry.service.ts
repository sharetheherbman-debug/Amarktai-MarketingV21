import { query } from '../config/database';
import { logger } from '../utils/logger';
import { genxMultimodalProvider, type GenXModel as GenXBaseModel } from '../providers/genx-multimodal.provider';

// Extended model with database fields and verified operations
export interface GenXModel extends GenXBaseModel {
  operations?: string[];
  raw_metadata?: Record<string, unknown>;
  first_seen?: string;
  last_seen?: string;
  last_verified?: string;
  verification_status?: 'metadata_confirmed' | 'runtime_confirmed' | 'failed' | 'unverified';
  required_parameters?: string[];
  optional_parameters?: string[];
}

// Operation types
export type ModelOperation =
  | 'text_generation'
  | 'vision'
  | 'text_to_image'
  | 'image_to_image'
  | 'image_edit'
  | 'text_to_video'
  | 'image_to_video'
  | 'video_to_video'
  | 'video_extend'
  | 'first_frame_video'
  | 'first_last_frame_video'
  | 'reference_image_video'
  | 'reference_video'
  | 'text_to_speech'
  | 'speech_to_text'
  | 'voice_clone'
  | 'audio_generation'
  | 'music_generation'
  | 'sound_effects'
  | 'lip_sync';

// ─── Live Catalogue Retrieval ────────────────────────────────────────────────

export async function fetchLiveModelCatalogue(): Promise<GenXModel[]> {
  const timestamp = new Date().toISOString();
  const allModels: GenXModel[] = [];
  const categories = ['text', 'image', 'video', 'voice', 'audio'];

  for (const category of categories) {
    try {
      const models = await genxMultimodalProvider.listModels(category);
      for (const model of models) {
        const operations = classifyOperations(model);
        allModels.push({
          ...model,
          operations,
          raw_metadata: model.metadata || {},
          first_seen: timestamp,
          last_seen: timestamp,
          last_verified: timestamp,
          verification_status: 'metadata_confirmed',
          required_parameters: extractRequiredParams(model),
          optional_parameters: extractOptionalParams(model),
        });
      }
      logger.info(`Fetched ${models.length} ${category} models from GenX`);
    } catch (error) {
      logger.error('Failed to fetch ' + category + ' models: ' + error);
    }
  }

  logger.info('Fetched ' + allModels.length + ' total models from GenX');
  return allModels;
}

// ─── Operation Classification ────────────────────────────────────────────────

function classifyOperations(model: GenXBaseModel): string[] {
  const ops: string[] = [];
  const category = model.category?.toLowerCase() || '';
  const id = (model.id || '').toLowerCase();
  const name = (model.name || '').toLowerCase();
  const params = model.parameters as Record<string, unknown> || {};
  const inputs = model.inputs || [];
  const outputs = model.outputs || [];

  // Text models
  if (category === 'text') {
    ops.push('text_generation');
    // Check for vision capability (image input)
    if (inputs.includes('image') || id.includes('vision') || id.includes('gpt-4o')) {
      ops.push('vision');
    }
  }

  // Image models
  if (category === 'image') {
    // Text-to-image is the default for image category
    ops.push('text_to_image');

    // Check for image-to-image capability
    if (inputs.includes('image') || params.image || params.input_image || params.reference_image) {
      ops.push('image_to_image');
    }

    // Check for image edit capability
    if (params.mask || params.edit || id.includes('edit') || id.includes('inpaint')) {
      ops.push('image_edit');
    }
  }

  // Video models
  if (category === 'video') {
    // Text-to-video is the default
    ops.push('text_to_video');

    // Check for image-to-video
    if (inputs.includes('image') || params.image || params.input_image || params.start_frame) {
      ops.push('image_to_video');
    }

    // Check for video-to-video / continuation
    if (inputs.includes('video') || params.video || params.input_video || params.continuation) {
      ops.push('video_to_video');
    }

    // Check for video extension
    if (params.extend || params.continuation_id || id.includes('extend')) {
      ops.push('video_extend');
    }

    // Check for first-frame support
    if (params.first_frame || params.start_frame) {
      ops.push('first_frame_video');
    }

    // Check for first+last frame support
    if (params.last_frame || params.end_frame) {
      ops.push('first_last_frame_video');
    }

    // Check for reference image support
    if (params.reference_image || params.character_reference) {
      ops.push('reference_image_video');
    }
  }

  // Voice models
  if (category === 'voice') {
    if (id.includes('tts') || id.includes('speech') || name.includes('text-to-speech')) {
      ops.push('text_to_speech');
    }
    if (id.includes('stt') || id.includes('transcri') || name.includes('speech-to-text')) {
      ops.push('speech_to_text');
    }
    if (id.includes('clone') || name.includes('clone')) {
      ops.push('voice_clone');
    }
    if (ops.length === 0) ops.push('text_to_speech');
  }

  // Audio models
  if (category === 'audio') {
    if (id.includes('music') || name.includes('music')) {
      ops.push('music_generation');
    } else if (id.includes('sfx') || id.includes('sound') || name.includes('effect')) {
      ops.push('sound_effects');
    } else {
      ops.push('audio_generation');
    }
  }

  // Lip sync detection
  if (id.includes('lip') || id.includes('sync') || name.includes('lip sync')) {
    ops.push('lip_sync');
  }

  return ops.length > 0 ? ops : ['text_generation'];
}

function extractRequiredParams(model: GenXBaseModel): string[] {
  const params = model.parameters as Record<string, unknown> || {};
  const required: string[] = [];
  const schema = params.required as string[] || [];
  if (schema.length > 0) return schema;

  // Infer from parameter names
  if (params.prompt) required.push('prompt');
  if (params.input && !params.prompt) required.push('input');
  return required;
}

function extractOptionalParams(model: GenXBaseModel): string[] {
  const params = model.parameters as Record<string, unknown> || {};
  const properties = params.properties as Record<string, unknown> || {};
  return Object.keys(properties).filter(k => !(params.required as string[] || []).includes(k));
}

// ─── Database Sync ───────────────────────────────────────────────────────────

export async function syncModelsToDatabase(models: GenXModel[]): Promise<{ total: number; new: number; updated: number; removed: number }> {
  const timestamp = new Date().toISOString();
  const existing = await query('SELECT id FROM genx_models');
  const existingIds = new Set(existing.rows.map(r => r.id as string));
  const newIds = new Set(models.map(m => m.id));

  let newCount = 0;
  let updatedCount = 0;

  for (const model of models) {
    if (existingIds.has(model.id)) {
      await query(
        `UPDATE genx_models SET name = $2, category = $3, vendor = $4, inputs = $5, outputs = $6,
         operations = $7, parameters = $8, available = $9, deprecated = $10, raw_metadata = $11,
         last_seen = $12, last_verified = $13 WHERE id = $1`,
        [model.id, model.name, model.category, model.vendor || null, JSON.stringify(model.inputs || []),
         JSON.stringify(model.outputs || []), JSON.stringify(model.operations || []), JSON.stringify(model.parameters || {}),
         model.available !== false, model.deprecated === true, JSON.stringify(model.raw_metadata || {}),
         timestamp, timestamp]
      );
      updatedCount++;
    } else {
      await query(
        `INSERT INTO genx_models (id, name, category, vendor, inputs, outputs, operations, parameters, available, deprecated, raw_metadata, first_seen, last_seen, last_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [model.id, model.name, model.category, model.vendor || null, JSON.stringify(model.inputs || []),
         JSON.stringify(model.outputs || []), JSON.stringify(model.operations || []), JSON.stringify(model.parameters || {}),
         model.available !== false, model.deprecated === true, JSON.stringify(model.raw_metadata || {}),
         timestamp, timestamp, timestamp]
      );
      newCount++;
    }
  }

  const removedIds = [...existingIds].filter(id => !newIds.has(id));
  for (const id of removedIds) {
    await query("UPDATE genx_models SET available = FALSE, last_seen = $2 WHERE id = $1", [id, timestamp]);
  }

  await query(
    'INSERT INTO genx_model_sync_runs (total_models, new_models, updated_models, removed_models, completed_at) VALUES ($1, $2, $3, $4, $5)',
    [models.length, newCount, updatedCount, removedIds.length, timestamp]
  );

  return { total: models.length, new: newCount, updated: updatedCount, removed: removedIds.length };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getAvailableModels(operation?: string): Promise<GenXModel[]> {
  let sql = 'SELECT * FROM genx_models WHERE available = TRUE';
  const params: unknown[] = [];
  if (operation) { sql += ' AND operations ? $1'; params.push(operation); }
  sql += ' ORDER BY category, name';
  const result = await query(sql, params);
  return result.rows.map(mapModelRow);
}

export async function getModelsByCategory(category: string): Promise<GenXModel[]> {
  const result = await query('SELECT * FROM genx_models WHERE available = TRUE AND category = $1 ORDER BY name', [category]);
  return result.rows.map(mapModelRow);
}

export async function getModelById(id: string): Promise<GenXModel | null> {
  const result = await query('SELECT * FROM genx_models WHERE id = $1', [id]);
  return result.rows.length > 0 ? mapModelRow(result.rows[0]) : null;
}

export async function getModelStats(): Promise<Record<string, number>> {
  const result = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE available = TRUE) as available,
      COUNT(DISTINCT vendor) as vendors,
      COUNT(*) FILTER (WHERE category = 'text') as text_models,
      COUNT(*) FILTER (WHERE category = 'image') as image_models,
      COUNT(*) FILTER (WHERE category = 'video') as video_models,
      COUNT(*) FILTER (WHERE category = 'voice') as voice_models,
      COUNT(*) FILTER (WHERE category = 'audio') as audio_models
    FROM genx_models
  `);
  const row = result.rows[0];
  return {
    total: parseInt(row.total as string),
    available: parseInt(row.available as string),
    vendors: parseInt(row.vendors as string),
    text: parseInt(row.text_models as string),
    image: parseInt(row.image_models as string),
    video: parseInt(row.video_models as string),
    voice: parseInt(row.voice_models as string),
    audio: parseInt(row.audio_models as string),
  };
}

// ─── Mapper ──────────────────────────────────────────────────────────────────

function mapModelRow(row: Record<string, unknown>): GenXModel {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    vendor: (row.vendor as string) || undefined,
    inputs: typeof row.inputs === 'string' ? JSON.parse(row.inputs) : (row.inputs as string[]) || [],
    outputs: typeof row.outputs === 'string' ? JSON.parse(row.outputs) : (row.outputs as string[]) || [],
    operations: typeof row.operations === 'string' ? JSON.parse(row.operations) : (row.operations as string[]) || [],
    parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : (row.parameters as Record<string, unknown>) || {},
    available: row.available as boolean,
    deprecated: row.deprecated as boolean,
    raw_metadata: typeof row.raw_metadata === 'string' ? JSON.parse(row.raw_metadata) : (row.raw_metadata as Record<string, unknown>) || {},
    first_seen: row.first_seen as string,
    last_seen: row.last_seen as string,
    last_verified: row.last_verified as string,
    verification_status: (row.verification_status as GenXModel['verification_status']) || 'unverified',
    required_parameters: typeof row.required_parameters === 'string' ? JSON.parse(row.required_parameters) : (row.required_parameters as string[]) || [],
    optional_parameters: typeof row.optional_parameters === 'string' ? JSON.parse(row.optional_parameters) : (row.optional_parameters as string[]) || [],
  };
}

