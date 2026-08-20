import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { Queue } from 'bullmq';
import { query } from '../config/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { safeFetch } from '../utils/safe-fetch';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';
import * as genxRegistry from './genx-model-registry.service';

const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const INTERNAL_ASSET_PREFIX = '/api/v1/studio/assets/';
const MAX_STUDIO_MEDIA_BYTES = 25 * 1024 * 1024;

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
  control_decision_id: string | null;
  control_status: string | null;
  requested_credits: number | null;
  policy_version: number | null;
  delivery_status: 'saved' | 'pending' | 'unavailable' | 'none';
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

function parseObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  try { return JSON.parse(String(value)) as Record<string, unknown>; }
  catch { return {}; }
}

function parseUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isInternalAssetUrl(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(INTERNAL_ASSET_PREFIX));
}

function detectMediaMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 12) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
    const ascii4 = String.fromCharCode(...bytes.slice(0, 4));
    const ascii8 = String.fromCharCode(...bytes.slice(8, 12));
    if (ascii4 === 'RIFF' && ascii8 === 'WEBP') return 'image/webp';
    if (ascii4 === 'RIFF' && ascii8 === 'WAVE') return 'audio/wav';
    if (ascii4 === 'OggS') return 'audio/ogg';
    if (String.fromCharCode(...bytes.slice(0, 3)) === 'GIF') return 'image/gif';
    if (String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return 'video/mp4';
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  if (bytes.length >= 3 && String.fromCharCode(...bytes.slice(0, 3)) === 'ID3') return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  return null;
}

function extensionForMime(mime: string): string {
  return ({
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
  } as Record<string, string>)[mime] || '.bin';
}

async function readTrustedGenxMedia(value: string): Promise<Uint8Array> {
  const trustedOrigin = new URL(env.GENX_BASE_URL).origin;
  let current = new URL(value);

  if (current.origin !== trustedOrigin) {
    const response = await safeFetch(current.toString(), {
      timeoutMs: 120000,
      maxRedirects: 5,
      maxResponseBytes: MAX_STUDIO_MEDIA_BYTES,
    });
    if (!response.ok) throw new Error(`Provider media download failed with HTTP ${response.status}`);
    return response.bytes();
  }

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Authorization: `Bearer ${env.GENX_API_KEY}`,
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(120000),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Provider media redirect did not include a location');
      const next = new URL(location, current);
      if (next.origin !== trustedOrigin) {
        const external = await safeFetch(next.toString(), {
          timeoutMs: 120000,
          maxRedirects: 5,
          maxResponseBytes: MAX_STUDIO_MEDIA_BYTES,
        });
        if (!external.ok) throw new Error(`Provider media redirect failed with HTTP ${external.status}`);
        return external.bytes();
      }
      current = next;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Provider media download failed with HTTP ${response.status}`);
    }

    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > MAX_STUDIO_MEDIA_BYTES) {
      await response.body?.cancel();
      throw new Error('Provider media exceeds the Studio delivery limit');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_STUDIO_MEDIA_BYTES) throw new Error('Provider media exceeds the Studio delivery limit');
    return bytes;
  }

  throw new Error('Provider media exceeded the redirect limit');
}

async function downloadGenerationMedia(row: Record<string, unknown>): Promise<{ bytes: Uint8Array; mime: string; filename: string }> {
  const providerJobId = String(row.provider_job_id || '');
  const candidates: Array<{ url: string; filename?: string }> = [];

  if (providerJobId) {
    try {
      const file = await genxMultimodalProvider.downloadJobFile(providerJobId);
      if (file?.url) candidates.push({ url: String(file.url), filename: file.filename });
    } catch (error) {
      logger.warn(`Studio provider file lookup failed for ${row.id}: ${error}`);
    }
    try {
      const result = await genxMultimodalProvider.getJobResult(providerJobId);
      if (result?.url) candidates.push({ url: String(result.url) });
    } catch (error) {
      logger.warn(`Studio provider result lookup failed for ${row.id}: ${error}`);
    }
  }

  for (const output of parseUrls(row.output_urls)) candidates.push({ url: output });

  const seen = new Set<string>();
  let lastError: unknown = null;
  for (const candidate of candidates) {
    if (!candidate.url || seen.has(candidate.url) || isInternalAssetUrl(candidate.url)) continue;
    seen.add(candidate.url);
    try {
      const bytes = await readTrustedGenxMedia(candidate.url);
      const mime = detectMediaMime(bytes);
      if (!mime) throw new Error('Downloaded provider result is not a supported media file');
      const providerName = candidate.filename ? path.basename(candidate.filename).replace(/[^a-zA-Z0-9._-]/g, '-') : '';
      const filename = providerName || `generation-${row.id}${extensionForMime(mime)}`;
      return { bytes, mime, filename };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No downloadable provider media was available');
}

async function ensureDurableCompletedOutput(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (String(row.status) !== 'completed') return row;

  const urls = parseUrls(row.output_urls);
  const internal = urls.find(isInternalAssetUrl);
  if (internal) {
    if (row.error_code || row.error_message) {
      await query(
        `UPDATE studio_generations
         SET error_code=NULL, error_message=NULL, updated_at=NOW()
         WHERE id=$1 AND organization_id=$2`,
        [row.id, row.organization_id]
      );
      return { ...row, error_code: null, error_message: null };
    }
    return row;
  }

  const existing = await query(
    `SELECT id, url FROM studio_assets
     WHERE organization_id=$1
       AND deleted_at IS NULL
       AND metadata->>'generation_id'=$2
     ORDER BY created_at DESC
     LIMIT 1`,
    [row.organization_id, row.id]
  );
  if (existing.rows[0]?.url) {
    const assetUrl = String(existing.rows[0].url);
    await query(
      `UPDATE studio_generations
       SET output_urls=$1::jsonb,
           error_code=NULL, error_message=NULL,
           metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb,
           updated_at=NOW()
       WHERE id=$3 AND organization_id=$4`,
      [
        JSON.stringify([assetUrl]),
        JSON.stringify({ studio_asset_id: existing.rows[0].id, delivery_status: 'saved' }),
        row.id,
        row.organization_id,
      ]
    );
    return {
      ...row,
      output_urls: [assetUrl],
      error_code: null,
      error_message: null,
      metadata: { ...parseObject(row.metadata), studio_asset_id: existing.rows[0].id, delivery_status: 'saved' },
    };
  }

  if (!row.provider_job_id) return row;

  const media = await downloadGenerationMedia(row);
  const directory = path.join(
    process.cwd(),
    'uploads', 'studio', 'generated',
    String(row.organization_id),
    String(row.id)
  );
  await fs.mkdir(directory, { recursive: true });
  const filename = `${crypto.randomUUID()}${extensionForMime(media.mime)}`;
  const storagePath = path.join(directory, filename);
  await fs.writeFile(storagePath, media.bytes, { mode: 0o600 });

  try {
    const asset = await createAsset(
      String(row.organization_id),
      String(row.user_id),
      {
        filename,
        originalName: media.filename,
        mimeType: media.mime,
        size: media.bytes.byteLength,
        path: storagePath,
      }
    );
    await query(
      `UPDATE studio_assets
       SET metadata=COALESCE(metadata,'{}'::jsonb) || $1::jsonb, updated_at=NOW()
       WHERE id=$2`,
      [
        JSON.stringify({
          generation_id: row.id,
          provider_job_id: row.provider_job_id,
          asset_role: 'generated_output',
          persisted_at: new Date().toISOString(),
        }),
        asset.id,
      ]
    );
    await query(
      `UPDATE studio_generations
       SET output_urls=$1::jsonb,
           error_code=NULL, error_message=NULL,
           metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb,
           updated_at=NOW()
       WHERE id=$3 AND organization_id=$4`,
      [
        JSON.stringify([asset.url]),
        JSON.stringify({
          studio_asset_id: asset.id,
          delivery_status: 'saved',
          persisted_at: new Date().toISOString(),
        }),
        row.id,
        row.organization_id,
      ]
    );
    return {
      ...row,
      output_urls: [asset.url],
      error_code: null,
      error_message: null,
      metadata: { ...parseObject(row.metadata), studio_asset_id: asset.id, delivery_status: 'saved' },
    };
  } catch (error) {
    await fs.unlink(storagePath).catch(() => undefined);
    throw error;
  }
}

async function attachControlDecision(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const status = String(row.status || '');
  if (!['pending', 'queued', 'pending_control', 'processing'].includes(status)) {
    return {
      ...row,
      control_decision_id: null,
      control_status: null,
      requested_credits: null,
      policy_version: null,
    };
  }
  const decision = await query(
    `SELECT id,status,requested_credits,policy_version
     FROM relaunch_action_decisions
     WHERE organization_id=$1
       AND action_type='generation'
       AND (
         payload->>'generation_job_id'=$2
         OR payload->>'generation_id'=$2
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [row.organization_id, row.id]
  );
  const control = decision.rows[0];
  return {
    ...row,
    control_decision_id: control?.id || null,
    control_status: control?.status || null,
    requested_credits: control ? Number(control.requested_credits || 0) : null,
    policy_version: control ? Number(control.policy_version || 0) : null,
  };
}

async function prepareGenerationRow(row: Record<string, unknown>): Promise<Record<string, unknown>> {
  let prepared = row;
  if (String(row.status) === 'completed') {
    try {
      prepared = await ensureDurableCompletedOutput(row);
    } catch (error) {
      logger.warn(`Studio output persistence unavailable for generation ${row.id}: ${error}`);
      prepared = { ...row, delivery_status: 'unavailable' };
    }
  }
  return attachControlDecision(prepared);
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

async function failQueueSubmission(
  generationId: string,
  orgId: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error || 'Queue submission failed');
  await query(
    `UPDATE studio_generations
     SET status='failed',
         error_code='queue_submission_failed',
         error_message=$1,
         completed_at=NOW(),
         updated_at=NOW()
     WHERE id=$2 AND organization_id=$3
       AND status='pending'
       AND provider_job_id IS NULL`,
    [message.slice(0, 2000), generationId, orgId]
  );
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
  if (existing.rows.length > 0) return getGeneration(String(existing.rows[0].id), orgId);

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
  let job;
  try {
    job = await generationQueue.add(
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
        attempts: 60,
        backoff: { type: 'fixed', delay: 30_000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      }
    );
  } catch (error) {
    await failQueueSubmission(generation.id, orgId, error).catch((cleanupError) => {
      logger.error(`Failed to close Studio queue-submission row ${generation.id}: ${cleanupError}`);
    });
    throw error;
  }

  try {
    await query(
      'UPDATE studio_generations SET queue_job_id = $1, updated_at = NOW() WHERE id = $2',
      [String(job.id), generation.id]
    );
  } catch (error) {
    await job.remove().catch(() => undefined);
    await failQueueSubmission(generation.id, orgId, error).catch((cleanupError) => {
      logger.error(`Failed to close Studio queue-registration row ${generation.id}: ${cleanupError}`);
    });
    throw error;
  }

  logger.info(`Generation queued: ${generation.id}`);
  return getGeneration(generation.id, orgId);
}

export async function getGeneration(id: string, orgId: string): Promise<StudioGeneration> {
  const result = await query(
    'SELECT * FROM studio_generations WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Generation');
  return mapGenerationRow(await prepareGenerationRow(result.rows[0]));
}

export async function retryGeneration(id: string, orgId: string, userId: string): Promise<StudioGeneration> {
  const result = await query(
    `SELECT * FROM studio_generations WHERE id=$1 AND organization_id=$2 FOR UPDATE`,
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Generation');
  const row = result.rows[0];
  if (!['failed','cancelled'].includes(String(row.status))) return mapGenerationRow(await prepareGenerationRow(row));
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
  const output: StudioGeneration[] = [];
  for (const row of result.rows) output.push(mapGenerationRow(await prepareGenerationRow(row)));
  return output;
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
  const url = `${INTERNAL_ASSET_PREFIX}${id}`;
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
    url: (row.url as string) || `${INTERNAL_ASSET_PREFIX}${row.id as string}`,
    metadata: parseObject(row.metadata),
    created_at: row.created_at as string,
  };
}

function mapGenerationRow(row: Record<string, unknown>): StudioGeneration {
  const status = String(row.status || 'pending');
  const rawUrls = parseUrls(row.output_urls);
  const outputUrls = rawUrls.filter(isInternalAssetUrl);
  const rawErrorCode = row.error_code as string | null;
  const completed = status === 'completed';
  const pendingControl = status === 'pending_control';
  const failed = status === 'failed';
  const errorCode = completed ? null : rawErrorCode;
  const safeErrorMessage = completed
    ? null
    : pendingControl
      ? 'Manual approval required before Generation Credits are reserved or external generation begins.'
      : failed
        ? 'Generation could not be completed. Please try again or choose another model.'
        : null;
  const metadata = parseObject(row.metadata);
  const deliveryStatus = outputUrls.length > 0
    ? 'saved'
    : completed
      ? (row.delivery_status === 'unavailable' ? 'unavailable' : 'pending')
      : 'none';

  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    user_id: row.user_id as string,
    type: row.type as string,
    model: row.model as string | null,
    prompt: row.prompt as string | null,
    negative_prompt: row.negative_prompt as string | null,
    options: parseObject(row.options),
    provider: 'amarktai_network',
    provider_job_id: row.provider_job_id as string | null,
    status,
    progress: Number(row.progress || 0),
    output_urls: outputUrls,
    primary_output_url: outputUrls[0] || null,
    error_code: errorCode,
    error_message: safeErrorMessage,
    metadata,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    completed_at: row.completed_at as string | null,
    control_decision_id: row.control_decision_id as string | null || null,
    control_status: row.control_status as string | null || null,
    requested_credits: row.requested_credits === null || row.requested_credits === undefined ? null : Number(row.requested_credits),
    policy_version: row.policy_version === null || row.policy_version === undefined ? null : Number(row.policy_version),
    delivery_status: deliveryStatus,
  };
}
