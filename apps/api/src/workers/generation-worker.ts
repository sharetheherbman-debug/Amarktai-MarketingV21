import path from 'path';
import { promises as fs } from 'fs';
import { Job, Worker } from 'bullmq';
import { closePool, query } from '../config/database';
import { logger } from '../utils/logger';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';
import * as ffmpegService from '../services/ffmpeg.service';
import { AppError } from '../middleware/errorHandler';
import {
  beginGovernedGeneration,
  completeGovernedGeneration,
  failGovernedGeneration,
  markGovernedGenerationSubmitted,
  type GovernedGeneration,
} from '../services/governed-generation.service';
import * as contentEngine from '../services/content-engine.service';
import { safeFetch } from '../utils/safe-fetch';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

function asObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  try { return JSON.parse(String(value)) as Record<string, any>; }
  catch { return {}; }
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function maxWaitMs(type: string): number {
  if (type.includes('video') || type === 'cinema') return 20 * 60 * 1000;
  if (type.includes('audio') || type === 'lip_sync' || type === 'text_to_speech') return 10 * 60 * 1000;
  return 5 * 60 * 1000;
}

async function waitForProviderJob(
  providerJobId: string,
  timeout: number,
  cancelled: () => Promise<boolean>,
  onProgress: (progress: number) => Promise<void>
): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await cancelled()) {
      await genxMultimodalProvider.cancelJob(providerJobId).catch(() => undefined);
      return { status: 'cancelled' };
    }
    const state: any = await genxMultimodalProvider.getJob(providerJobId);
    await onProgress(Number(state.progress || 0));
    if (['completed', 'failed', 'cancelled'].includes(state.status)) return state;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Provider job timed out');
}

async function resolveContinuationReference(
  organizationId: string,
  options: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const params = { ...options };
  const requestId = typeof params.request_id === 'string' ? params.request_id : null;
  if (!requestId) return params;

  const source = await query(
    `SELECT provider_job_id, output_urls
     FROM studio_generations
     WHERE id = $1 AND organization_id = $2`,
    [requestId, organizationId]
  );
  if (source.rows.length === 0) return params;

  const row = source.rows[0];
  if (row.provider_job_id) params.request_id = row.provider_job_id;
  const urls = typeof row.output_urls === 'string' ? JSON.parse(row.output_urls) : row.output_urls;
  if (Array.isArray(urls) && urls[0]) params.previous_video_url = urls[0];
  return params;
}

async function processStudio(job: Job): Promise<void> {
  const data = job.data as any;
  const generationId = data.generationId as string;
  const workerId = `generation-${process.pid}`;
  const generation = await query(
    `SELECT campaign_id, user_id, type, model, prompt, options, attempt_count,
            status, cancellation_requested_at
     FROM studio_generations WHERE id=$1 AND organization_id=$2`,
    [generationId, data.organizationId]
  );
  if (generation.rows.length === 0) throw new Error('Studio generation not found');
  if (String(generation.rows[0].status) === 'cancelled' || generation.rows[0].cancellation_requested_at) {
    await query(
      `UPDATE campaign_asset_runs SET status='cancelled',updated_at=NOW()
       WHERE studio_generation_id=$1`,
      [generationId]
    );
    return;
  }
  const generationOptions = asObject(generation.rows[0].options);

  let governed: GovernedGeneration | null = null;
  try {
    governed = await beginGovernedGeneration({
      organizationId: data.organizationId,
      userId: data.userId,
      campaignId: generation.rows[0].campaign_id || null,
      generationJobId: generationId,
      modelId: data.modelId,
      operation: data.type === 'cinema' ? 'text_to_video' : data.type,
      quantity: Number(data.options?.quantity || 1),
      idempotencyKey: `studio:${generationId}:attempt:${Number(generation.rows[0].attempt_count || 0) + 1}`,
      title: `Generate ${String(data.type).replaceAll('_', ' ')}`,
      summary: String(data.prompt || '').slice(0, 500),
      requestedBy: 'user',
      payload: {
        generation_id: generationId,
        campaign_plan_id: generationOptions.campaign_plan_id || null,
        brief_id: generationOptions.brief_id || null,
        variant_number: generationOptions.variant_number || null,
      },
      onAuthorized: async () => {
        await query(
          `UPDATE studio_generations
           SET status = 'processing', worker_id = $1, attempt_count = attempt_count + 1,
               heartbeat_at = NOW(), updated_at = NOW()
           WHERE id = $2`,
          [workerId, generationId]
        );
      },
    });

    const params = await resolveContinuationReference(data.organizationId, data.options || {});
    if (data.prompt) params.prompt = data.prompt;
    if (data.negativePrompt) params.negative_prompt = data.negativePrompt;
    delete params.idempotency_key;

    const providerJob: any = await genxMultimodalProvider.generate({
      model: data.modelId,
      params,
      metadata: {
        organization_id: data.organizationId,
        generation_id: generationId,
        type: data.type,
      },
      webhook_url: process.env.GENX_WEBHOOK_URL,
    } as any);

    await markGovernedGenerationSubmitted(governed, providerJob.id);

    await query(
    `UPDATE studio_generations
     SET provider_job_id = $1, heartbeat_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [providerJob.id, generationId]
  );

    const finalState = await waitForProviderJob(
    providerJob.id,
    maxWaitMs(data.type),
    async () => {
      const current = await query(
        'SELECT status, cancellation_requested_at FROM studio_generations WHERE id = $1',
        [generationId]
      );
      return current.rows[0]?.status === 'cancelled' || Boolean(current.rows[0]?.cancellation_requested_at);
    },
    async (progress) => {
      await query(
        `UPDATE studio_generations
         SET progress = $1, heartbeat_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [progress, generationId]
      );
    }
  );

    if (finalState.status === 'cancelled') throw new Error('Generation cancelled');
    if (finalState.status === 'failed') throw new Error(finalState.error || 'GenX generation failed');

    let outputUrl = finalState.result_url;
    let resultData = finalState.result_data || {};
    if (!outputUrl) {
      const result: any = await genxMultimodalProvider.getJobResult(providerJob.id);
      outputUrl = result.url;
      resultData = result.data || resultData;
    }
    if (!outputUrl) throw new Error('GenX completed without a result URL');

    await query(
    `UPDATE studio_generations
     SET status = 'completed', progress = 100, output_urls = $1,
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         completed_at = NOW(), heartbeat_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [
      JSON.stringify([outputUrl]),
      JSON.stringify({
        provider_result: resultData,
        usage: finalState.usage || null,
        runtime_confirmed_at: new Date().toISOString(),
      }),
      generationId,
    ]
  );
    await completeGovernedGeneration(governed, providerJob.id, {
      usage: finalState.usage || null,
      generation_id: generationId,
    });
    await query(
      `UPDATE campaign_asset_runs SET status='completed',resolution_status='pending_review',
           completed_at=NOW(),updated_at=NOW()
       WHERE studio_generation_id=$1`,
      [generationId]
    );
    await query(
    `UPDATE genx_models SET verification_status = 'runtime_confirmed', last_verified = NOW()
     WHERE id = $1`,
      [data.modelId]
    );
  } catch (error) {
    if (governed) await failGovernedGeneration(governed, error);
    throw error;
  }
}

function sceneMetadataCampaignId(value: unknown): string | null {
  const metadata = asObject(value);
  return metadata.campaign_id ? String(metadata.campaign_id) : null;
}

async function createContinuityAsset(
  organizationId: string,
  userId: string,
  sceneId: string,
  filePath: string
): Promise<{ id: string; url: string }> {
  const stat = await fs.stat(filePath);
  const filename = `scene-${sceneId}-final-frame.jpg`;
  const result = await query(
    `INSERT INTO studio_assets (
       organization_id, user_id, filename, original_name, mime_type,
       size_bytes, storage_path, url, metadata
     ) VALUES ($1,$2,$3,$3,'image/jpeg',$4,$5,NULL,$6)
     RETURNING id`,
    [
      organizationId,
      userId,
      filename,
      stat.size,
      filePath,
      JSON.stringify({ scene_id: sceneId, asset_role: 'continuity_final_frame' }),
    ]
  );
  const id = String(result.rows[0].id);
  const url = `/api/v1/studio/assets/${id}`;
  await query('UPDATE studio_assets SET url = $1 WHERE id = $2', [url, id]);
  return { id, url };
}

function assetIdFromUrl(url: string): string | null {
  const match = url.match(/\/studio\/assets\/([0-9a-f-]{36})(?:$|[?#/])/i);
  return match?.[1] || null;
}

async function materializeVideo(
  sourceUrl: string,
  organizationId: string,
  destination: string
): Promise<string> {
  const assetId = assetIdFromUrl(sourceUrl);
  if (assetId) {
    const asset = await query(
      `SELECT storage_path FROM studio_assets
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [assetId, organizationId]
    );
    if (!asset.rows[0]?.storage_path) throw new Error('Continuity source asset not found');
    await fs.copyFile(String(asset.rows[0].storage_path), destination);
    return destination;
  }
  const response = await safeFetch(sourceUrl, { timeoutMs: 120000, maxResponseBytes: 25 * 1024 * 1024 });
  if (!response.ok) throw new Error(`Continuity source download failed: ${response.status}`);
  await fs.writeFile(destination, Buffer.from(await response.bytes()));
  return destination;
}

async function ensureFinalFrameAsset(
  sourceScene: Record<string, any>,
  organizationId: string,
  ownerId: string
): Promise<{ id: string; url: string } | null> {
  if (sourceScene.final_frame_asset_id) {
    const existing = await query(
      `SELECT id, url FROM studio_assets
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [sourceScene.final_frame_asset_id, organizationId]
    );
    if (existing.rows[0]) return { id: String(existing.rows[0].id), url: String(existing.rows[0].url) };
  }
  const sourceUrl = String(sourceScene.generated_clip_url || sourceScene.provider_result_url || '');
  if (!sourceUrl) return null;

  const continuityDir = path.join(process.cwd(), 'uploads', 'studio', 'continuity', sourceScene.id);
  await fs.mkdir(continuityDir, { recursive: true });
  const sourcePath = path.join(continuityDir, 'source.mp4');
  const framePath = path.join(continuityDir, 'final-frame.jpg');
  await materializeVideo(sourceUrl, organizationId, sourcePath);
  await ffmpegService.extractLastFrame(sourcePath, framePath);
  await fs.unlink(sourcePath).catch(() => undefined);
  const asset = await createContinuityAsset(organizationId, ownerId, String(sourceScene.id), framePath);
  await query(
    `UPDATE video_scenes
     SET final_frame_asset_id = $1,
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $3 AND organization_id = $4`,
    [
      asset.id,
      JSON.stringify({ continuity_output: { method: 'final_frame', asset_id: asset.id, url: asset.url } }),
      sourceScene.id,
      organizationId,
    ]
  );
  return asset;
}

function supportedParameterNames(model: Record<string, any>): Set<string> {
  const names = new Set<string>([
    ...asArray(model.required_parameters),
    ...asArray(model.optional_parameters),
  ]);
  const parameters = asObject(model.parameters);
  const properties = asObject(parameters.properties);
  Object.keys(properties).forEach((name) => names.add(name));
  Object.keys(parameters)
    .filter((name) => !['required', 'properties', 'type', 'title', 'description'].includes(name))
    .forEach((name) => names.add(name));
  return names;
}

function assignSupported(
  params: Record<string, unknown>,
  supported: Set<string>,
  candidates: string[],
  value: unknown,
  required = false
): string | null {
  if (value === undefined || value === null || value === '') return null;
  const selected = candidates.find((name) => supported.has(name));
  if (selected) {
    params[selected] = value;
    return selected;
  }
  if (required && supported.size === 0) {
    params[candidates[0]] = value;
    return candidates[0];
  }
  return null;
}

async function processLongformScene(job: Job): Promise<void> {
  const data = job.data as any;
  const workerId = `generation-${process.pid}`;
  const sceneResult = await query(
    `SELECT scene.*, project.aspect_ratio, project.resolution, project.owner_id,
            project.brand_config, project.metadata AS project_metadata,
            model.operations, model.parameters, model.required_parameters,
            model.optional_parameters, model.verification_status
     FROM video_scenes scene
     JOIN video_projects project ON project.id = scene.project_id
     LEFT JOIN genx_models model ON model.id = scene.model_id
     WHERE scene.id = $1 AND scene.organization_id = $2`,
    [data.sceneId, data.organizationId]
  );
  if (sceneResult.rows.length === 0) throw new Error('Long-form scene not found');
  const scene = sceneResult.rows[0] as Record<string, any>;
  if (!scene.model_id) throw new Error('Long-form scene has no selected model');

  let governed: GovernedGeneration | null = null;
  try {
    const operation = scene.source_image_url ? 'image_to_video' : 'text_to_video';
    governed = await beginGovernedGeneration({
      organizationId: data.organizationId,
      userId: scene.owner_id,
      campaignId: sceneMetadataCampaignId(scene.project_metadata),
      generationJobId: String(scene.id),
      modelId: String(scene.model_id),
      operation,
      quantity: Math.max(1, Number(scene.duration_seconds || 1)),
      idempotencyKey: `longform-scene:${scene.id}:attempt:${Number(scene.retry_count || 0) + 1}`,
      title: `Generate long-form scene ${Number(scene.scene_number || 0)}`,
      summary: String(scene.visual_prompt || '').slice(0, 500),
      requestedBy: 'system',
      payload: { project_id: data.projectId, scene_id: data.sceneId },
    });

  await query(
    `UPDATE video_scenes
     SET status = 'generating', worker_id = $1, error_message = NULL, updated_at = NOW()
     WHERE id = $2`,
    [workerId, scene.id]
  );

  const supported = supportedParameterNames(scene);
  const sceneMetadata = asObject(scene.metadata);
  const params: Record<string, unknown> = {};
  const promptPrefix = String(sceneMetadata.shared_prompt_prefix || '').trim();
  const prompt = [promptPrefix, String(scene.visual_prompt || '').trim()].filter(Boolean).join('\n\n');
  assignSupported(params, supported, ['prompt', 'text', 'input'], prompt, true);
  assignSupported(params, supported, ['negative_prompt', 'negative'], scene.negative_prompt);
  assignSupported(params, supported, ['duration', 'duration_seconds', 'seconds'], scene.duration_seconds);
  assignSupported(params, supported, ['aspect_ratio', 'ratio'], scene.aspect_ratio);
  assignSupported(params, supported, ['resolution', 'size'], scene.resolution);
  assignSupported(params, supported, ['image_url', 'image', 'input_image', 'start_frame', 'first_frame'], scene.source_image_url);
  assignSupported(params, supported, ['video_url', 'video', 'input_video'], scene.source_video_url);
  assignSupported(params, supported, ['first_frame', 'start_frame'], scene.start_frame_url);
  assignSupported(params, supported, ['last_frame', 'end_frame'], scene.end_frame_url);
  assignSupported(params, supported, ['reference_image', 'character_reference'], sceneMetadata.character_reference_url || sceneMetadata.style_reference_url);
  assignSupported(params, supported, ['seed'], sceneMetadata.shared_seed);

  let continuityMethod = 'none';
  if (scene.continuation_source_id) {
    const sourceResult = await query(
      `SELECT provider_job_id, provider_continuation_token, provider_result_url,
              generated_clip_url, final_frame_asset_id, id
       FROM video_scenes WHERE id = $1 AND organization_id = $2`,
      [scene.continuation_source_id, data.organizationId]
    );
    const source = sourceResult.rows[0] as Record<string, any> | undefined;
    if (source) {
      const operations = new Set(asArray(scene.operations));
      const nativeContinuation = operations.has('video_extend') || operations.has('video_to_video');
      if (nativeContinuation && source.provider_continuation_token && assignSupported(
        params,
        supported,
        ['continuation_token', 'continuation_id', 'token'],
        source.provider_continuation_token
      )) {
        continuityMethod = 'native_continuation_token';
      } else if (nativeContinuation && source.provider_job_id && assignSupported(
        params,
        supported,
        ['request_id', 'previous_request_id', 'job_id'],
        source.provider_job_id
      )) {
        continuityMethod = 'native_provider_job';
      } else if (nativeContinuation && source.provider_result_url && assignSupported(
        params,
        supported,
        ['previous_video_url', 'video_url', 'input_video'],
        source.provider_result_url
      )) {
        continuityMethod = 'native_previous_output';
      } else {
        const finalFrame = await ensureFinalFrameAsset(source, data.organizationId, scene.owner_id);
        if (finalFrame && assignSupported(
          params,
          supported,
          ['first_frame', 'start_frame', 'image_url', 'image', 'input_image'],
          finalFrame.url
        )) {
          continuityMethod = 'final_frame';
        } else {
          continuityMethod = promptPrefix ? 'prompt_only' : 'none';
        }
      }
    }
  }

  const providerJob: any = await genxMultimodalProvider.generate({
    model: scene.model_id,
    params,
    metadata: {
      organization_id: data.organizationId,
      project_id: data.projectId,
      scene_id: data.sceneId,
      type: scene.source_image_url || continuityMethod === 'final_frame' ? 'image_to_video' : 'text_to_video',
      continuity_method: continuityMethod,
    },
    webhook_url: process.env.GENX_WEBHOOK_URL,
  } as any);

  await markGovernedGenerationSubmitted(governed, providerJob.id);

  await query(
    `UPDATE video_scenes
     SET provider_job_id = $1, submitted_at = NOW(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $3`,
    [
      providerJob.id,
      JSON.stringify({ submitted_params: params, continuity_method: continuityMethod }),
      scene.id,
    ]
  );

  const finalState = await waitForProviderJob(
    providerJob.id,
    20 * 60 * 1000,
    async () => {
      const current = await query(
        'SELECT status, cancellation_requested_at FROM video_scenes WHERE id = $1',
        [scene.id]
      );
      return current.rows[0]?.status === 'cancelled' || Boolean(current.rows[0]?.cancellation_requested_at);
    },
    async () => {
      await query('UPDATE video_scenes SET updated_at = NOW() WHERE id = $1', [scene.id]);
    }
  );

  if (finalState.status === 'cancelled') throw new Error('Long-form scene generation cancelled');
  if (finalState.status === 'failed') throw new Error(finalState.error || 'GenX scene generation failed');

  let outputUrl = finalState.result_url;
  let resultData: Record<string, unknown> = finalState.result_data || {};
  if (!outputUrl) {
    const result: any = await genxMultimodalProvider.getJobResult(providerJob.id);
    outputUrl = result.url;
    resultData = result.data || {};
  }
  if (!outputUrl) throw new Error('GenX scene completed without a result URL');

  await query(
    `UPDATE video_scenes
     SET status = 'completed', generated_clip_url = $1, provider_result_url = $1,
         provider_continuation_token = $2, completed_at = NOW(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
         error_message = NULL, updated_at = NOW()
     WHERE id = $4`,
    [
      outputUrl,
      (resultData.continuation_token || resultData.continuation_id || null) as string | null,
      JSON.stringify({
        continuity_method: continuityMethod,
        provider_result: resultData,
        usage: finalState.usage || null,
        runtime_confirmed_at: new Date().toISOString(),
      }),
      scene.id,
    ]
  );
  await query(
    `UPDATE genx_models SET verification_status = 'runtime_confirmed', last_verified = NOW()
     WHERE id = $1`,
    [scene.model_id]
  );

  await completeGovernedGeneration(governed, providerJob.id, {
    usage: finalState.usage || null,
    project_id: data.projectId,
    scene_id: data.sceneId,
  });

  await ensureFinalFrameAsset(
    { ...scene, generated_clip_url: outputUrl, provider_result_url: outputUrl, final_frame_asset_id: null },
    data.organizationId,
    scene.owner_id
  ).catch((error) => logger.warn(`Final-frame extraction skipped for scene ${scene.id}: ${error}`));
  } catch (error) {
    if (governed) await failGovernedGeneration(governed, error);
    throw error;
  }
}

async function processCampaignText(job: Job): Promise<void> {
  const data = job.data as any;
  await query(
    `UPDATE campaign_asset_runs SET status='processing',error_message=NULL,updated_at=NOW()
     WHERE id=$1 AND organization_id=$2`,
    [data.runId, data.organizationId]
  );
  const result = await contentEngine.generateContent(data.organizationId, data.request, data.userId);
  await query(
    `UPDATE campaign_asset_runs
     SET status='completed',content_id=$1,resolution_status='pending_review',
         completed_at=NOW(),updated_at=NOW()
     WHERE id=$2 AND organization_id=$3`,
    [result.content.id, data.runId, data.organizationId]
  );
}

async function processJob(job: Job): Promise<void> {
  try {
    if (job.name === 'campaign-text' || job.data?.kind === 'campaign-text') await processCampaignText(job);
    else if (job.name === 'longform-scene' || job.data?.kind === 'longform-scene') await processLongformScene(job);
    else await processStudio(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const awaitingControl = error instanceof AppError && [
      'RELAUNCH_APPROVAL_REQUIRED',
      'RELAUNCH_ACTION_BLOCKED',
      'RELAUNCH_DECISION_STALE',
      'RELAUNCH_APPROVAL_EXPIRED',
    ].includes(error.code);
    if (job.name === 'campaign-text' || job.data?.kind === 'campaign-text') {
      await query(
        `UPDATE campaign_asset_runs SET status=$1,error_message=$2,updated_at=NOW()
         WHERE id=$3 AND organization_id=$4`,
        [awaitingControl ? 'pending_control' : 'failed', message, job.data.runId, job.data.organizationId]
      );
    } else if (job.name === 'longform-scene' || job.data?.kind === 'longform-scene') {
      await query(
        `UPDATE video_scenes
         SET status = $1, error_message = $2,
             retry_count = retry_count + CASE WHEN $3 THEN 0 ELSE 1 END,
             updated_at = NOW()
         WHERE id = $4`,
        [awaitingControl ? 'pending_control' : 'failed', message, awaitingControl, job.data.sceneId]
      );
    } else {
      await query(
        `UPDATE studio_generations
         SET status = $1, error_code = $2, error_message = $3, updated_at = NOW()
         WHERE id = $4`,
        [
          awaitingControl ? 'pending_control' : 'failed',
          awaitingControl ? error.code : 'WORKER_ERROR',
          message,
          job.data.generationId,
        ]
      );
      await query(
        `UPDATE campaign_asset_runs SET status=$1,error_message=$2,updated_at=NOW()
         WHERE studio_generation_id=$3`,
        [awaitingControl ? 'pending_control' : 'failed', message, job.data.generationId]
      );
    }
    throw error;
  }
}

const worker = new Worker('studio-generations', processJob, {
  connection,
  concurrency: Number(process.env.GENERATION_WORKER_CONCURRENCY || 2),
  limiter: { max: Number(process.env.GENX_REQUESTS_PER_MINUTE || 10), duration: 60000 },
});

worker.on('completed', (job) => logger.info(`Generation queue job completed: ${job.id}`));
worker.on('failed', (job, error) => logger.error(`Generation queue job failed: ${job?.id}: ${error.message}`));
worker.on('error', (error) => logger.error('Generation worker error', error));

async function shutdown(signal: string) {
  logger.info(`${signal}: closing generation worker`);
  await worker.close();
  await closePool();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

logger.info('Generation worker started');
