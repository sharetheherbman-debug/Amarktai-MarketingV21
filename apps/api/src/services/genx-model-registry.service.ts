import { query, transaction } from '../config/database';
import { logger } from '../utils/logger';
import { genxMultimodalProvider, type GenXModel as GenXBaseModel } from '../providers/genx-multimodal.provider';

export interface GenXModel extends GenXBaseModel {
  raw_metadata?: Record<string, unknown>;
  first_seen?: string;
  last_seen?: string;
  last_verified?: string;
  verification_status?: 'metadata_confirmed' | 'runtime_confirmed' | 'failed' | 'unverified';
  required_parameters?: string[];
  optional_parameters?: string[];
}

export type ModelOperation =
  | 'text_generation' | 'vision'
  | 'text_to_image' | 'image_to_image' | 'image_edit'
  | 'text_to_video' | 'image_to_video' | 'video_to_video' | 'video_extend'
  | 'first_frame_video' | 'first_last_frame_video' | 'reference_image_video' | 'reference_video'
  | 'text_to_speech' | 'speech_to_text' | 'voice_clone'
  | 'audio_generation' | 'music_generation' | 'sound_effects' | 'lip_sync';

let lastCatalogueComplete = false;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export async function fetchLiveModelCatalogue(): Promise<GenXModel[]> {
  const timestamp = new Date().toISOString();
  const categories = ['text', 'image', 'video', 'voice', 'audio'];
  const byId = new Map<string, GenXModel>();
  let successfulCategories = 0;

  for (const category of categories) {
    try {
      const models = await genxMultimodalProvider.listModels(category);
      successfulCategories++;
      for (const model of models) {
        if (!model.id) continue;
        const operations = classifyOperations(model);
        byId.set(model.id, {
          ...model,
          category: model.category || category,
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
      logger.error(`Failed to fetch ${category} models: ${error}`);
    }
  }

  lastCatalogueComplete = successfulCategories === categories.length;
  const models = [...byId.values()];
  logger.info(`Fetched ${models.length} unique GenX models; complete=${lastCatalogueComplete}`);
  return models;
}

function classifyOperations(model: GenXBaseModel): string[] {
  const explicit = stringArray(model.operations);
  if (explicit.length > 0) return [...new Set(explicit)];

  const operations: string[] = [];
  const category = String(model.category || '').toLowerCase();
  const id = String(model.id || '').toLowerCase();
  const name = String(model.name || '').toLowerCase();
  const params = objectValue(model.parameters);
  const properties = objectValue(params.properties);
  const inputs = stringArray(model.inputs).map((input) => input.toLowerCase());
  const has = (name: string) => name in params || name in properties;

  if (category === 'text') {
    operations.push('text_generation');
    if (inputs.includes('image') || id.includes('vision') || name.includes('vision')) operations.push('vision');
  }
  if (category === 'image') {
    operations.push('text_to_image');
    if (inputs.includes('image') || has('image') || has('input_image') || has('reference_image')) operations.push('image_to_image');
    if (has('mask') || has('edit') || id.includes('edit') || id.includes('inpaint')) operations.push('image_edit');
  }
  if (category === 'video') {
    operations.push('text_to_video');
    if (inputs.includes('image') || has('image') || has('input_image') || has('start_frame')) operations.push('image_to_video');
    if (inputs.includes('video') || has('video') || has('input_video') || has('continuation')) operations.push('video_to_video');
    if (has('extend') || has('continuation_id') || id.includes('extend')) operations.push('video_extend');
    if (has('first_frame') || has('start_frame')) operations.push('first_frame_video');
    if (has('last_frame') || has('end_frame')) operations.push('first_last_frame_video');
    if (has('reference_image') || has('character_reference')) operations.push('reference_image_video');
    if (has('reference_video')) operations.push('reference_video');
  }
  if (category === 'voice') {
    if (id.includes('stt') || id.includes('transcri') || name.includes('speech-to-text')) operations.push('speech_to_text');
    if (id.includes('clone') || name.includes('clone')) operations.push('voice_clone');
    if (id.includes('tts') || id.includes('speech') || name.includes('text-to-speech') || operations.length === 0) operations.push('text_to_speech');
  }
  if (category === 'audio') {
    if (id.includes('music') || name.includes('music')) operations.push('music_generation');
    else if (id.includes('sfx') || id.includes('sound') || name.includes('effect')) operations.push('sound_effects');
    else operations.push('audio_generation');
  }
  if (id.includes('lip') || id.includes('sync') || name.includes('lip sync')) operations.push('lip_sync');
  return [...new Set(operations.length > 0 ? operations : ['text_generation'])];
}

function parameterSchema(model: GenXBaseModel): Record<string, unknown> {
  const parameters = objectValue(model.parameters);
  const nested = objectValue(parameters.schema || parameters.input_schema);
  return Object.keys(nested).length > 0 ? nested : parameters;
}

function extractRequiredParams(model: GenXBaseModel): string[] {
  const schema = parameterSchema(model);
  const required = stringArray(schema.required);
  if (required.length > 0) return required;
  const properties = objectValue(schema.properties);
  const inferred: string[] = [];
  if ('prompt' in properties || 'prompt' in schema) inferred.push('prompt');
  else if ('input' in properties || 'input' in schema) inferred.push('input');
  return inferred;
}

function extractOptionalParams(model: GenXBaseModel): string[] {
  const schema = parameterSchema(model);
  const required = new Set(stringArray(schema.required));
  const properties = objectValue(schema.properties);
  return Object.keys(properties).filter((key) => !required.has(key));
}

export async function syncModelsToDatabase(models: GenXModel[]): Promise<{ total: number; new: number; updated: number; removed: number; complete: boolean }> {
  if (models.length === 0) return { total: 0, new: 0, updated: 0, removed: 0, complete: false };
  const timestamp = new Date().toISOString();

  return transaction(async (client) => {
    const existing = await client.query('SELECT id FROM genx_models');
    const existingIds = new Set(existing.rows.map((row) => String(row.id)));
    const incomingIds = new Set(models.map((model) => model.id));
    let newCount = 0;
    let updatedCount = 0;

    for (const model of models) {
      if (existingIds.has(model.id)) {
        await client.query(
          `UPDATE genx_models SET
             name=$2, category=$3, vendor=$4, inputs=$5, outputs=$6, operations=$7,
             parameters=$8, available=$9, deprecated=$10, raw_metadata=$11,
             last_seen=$12, last_verified=$13,
             verification_status=CASE WHEN verification_status='runtime_confirmed' THEN verification_status ELSE $14 END,
             required_parameters=$15, optional_parameters=$16
           WHERE id=$1`,
          [
            model.id, model.name, model.category, model.vendor || null,
            JSON.stringify(model.inputs || []), JSON.stringify(model.outputs || []), JSON.stringify(model.operations || []),
            JSON.stringify(model.parameters || {}), model.available !== false, model.deprecated === true,
            JSON.stringify(model.raw_metadata || {}), timestamp, timestamp,
            model.verification_status || 'metadata_confirmed',
            JSON.stringify(model.required_parameters || []), JSON.stringify(model.optional_parameters || []),
          ]
        );
        updatedCount++;
      } else {
        await client.query(
          `INSERT INTO genx_models
             (id,name,category,vendor,inputs,outputs,operations,parameters,available,deprecated,
              raw_metadata,first_seen,last_seen,last_verified,verification_status,required_parameters,optional_parameters)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            model.id, model.name, model.category, model.vendor || null,
            JSON.stringify(model.inputs || []), JSON.stringify(model.outputs || []), JSON.stringify(model.operations || []),
            JSON.stringify(model.parameters || {}), model.available !== false, model.deprecated === true,
            JSON.stringify(model.raw_metadata || {}), timestamp, timestamp, timestamp,
            model.verification_status || 'metadata_confirmed',
            JSON.stringify(model.required_parameters || []), JSON.stringify(model.optional_parameters || []),
          ]
        );
        newCount++;
      }
    }

    const removedIds = lastCatalogueComplete ? [...existingIds].filter((id) => !incomingIds.has(id)) : [];
    if (removedIds.length > 0) {
      await client.query('UPDATE genx_models SET available=FALSE, last_seen=$2 WHERE id=ANY($1::text[])', [removedIds, timestamp]);
    }
    await client.query(
      'INSERT INTO genx_model_sync_runs (total_models,new_models,updated_models,removed_models,completed_at) VALUES ($1,$2,$3,$4,$5)',
      [models.length, newCount, updatedCount, removedIds.length, timestamp]
    );
    return { total: models.length, new: newCount, updated: updatedCount, removed: removedIds.length, complete: lastCatalogueComplete };
  });
}

export async function getAvailableModels(operation?: string): Promise<GenXModel[]> {
  let sql = 'SELECT * FROM genx_models WHERE available=TRUE AND deprecated=FALSE';
  const params: unknown[] = [];
  if (operation) { sql += ' AND operations ? $1'; params.push(operation); }
  sql += ' ORDER BY category,name';
  const result = await query(sql, params);
  return result.rows.map(mapModelRow);
}

export async function getModelsByCategory(category: string): Promise<GenXModel[]> {
  const result = await query(
    'SELECT * FROM genx_models WHERE available=TRUE AND deprecated=FALSE AND category=$1 ORDER BY name',
    [category]
  );
  return result.rows.map(mapModelRow);
}

export async function getModelById(id: string): Promise<GenXModel | null> {
  const result = await query('SELECT * FROM genx_models WHERE id=$1', [id]);
  return result.rows.length > 0 ? mapModelRow(result.rows[0]) : null;
}

export async function getModelStats(): Promise<Record<string, number>> {
  const result = await query(`SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE available=TRUE AND deprecated=FALSE) AS available,
    COUNT(DISTINCT vendor) AS vendors,
    COUNT(*) FILTER (WHERE category='text') AS text_models,
    COUNT(*) FILTER (WHERE category='image') AS image_models,
    COUNT(*) FILTER (WHERE category='video') AS video_models,
    COUNT(*) FILTER (WHERE category='voice') AS voice_models,
    COUNT(*) FILTER (WHERE category='audio') AS audio_models,
    COUNT(*) FILTER (WHERE verification_status='runtime_confirmed') AS runtime_confirmed
    FROM genx_models`);
  const row = result.rows[0];
  return {
    total: Number(row.total || 0), available: Number(row.available || 0), vendors: Number(row.vendors || 0),
    text: Number(row.text_models || 0), image: Number(row.image_models || 0), video: Number(row.video_models || 0),
    voice: Number(row.voice_models || 0), audio: Number(row.audio_models || 0), runtime_confirmed: Number(row.runtime_confirmed || 0),
  };
}

function mapModelRow(row: Record<string, unknown>): GenXModel {
  const parse = <T>(value: unknown, fallback: T): T => {
    if (typeof value === 'string') {
      try { return JSON.parse(value) as T; } catch { return fallback; }
    }
    return (value as T) ?? fallback;
  };
  return {
    id: String(row.id), name: String(row.name), category: String(row.category),
    vendor: row.vendor ? String(row.vendor) : undefined,
    inputs: parse(row.inputs, []), outputs: parse(row.outputs, []), operations: parse(row.operations, []),
    parameters: parse(row.parameters, {}), available: row.available !== false, deprecated: row.deprecated === true,
    raw_metadata: parse(row.raw_metadata, {}),
    first_seen: row.first_seen ? String(row.first_seen) : undefined,
    last_seen: row.last_seen ? String(row.last_seen) : undefined,
    last_verified: row.last_verified ? String(row.last_verified) : undefined,
    verification_status: (row.verification_status as GenXModel['verification_status']) || 'unverified',
    required_parameters: parse(row.required_parameters, []), optional_parameters: parse(row.optional_parameters, []),
  };
}
