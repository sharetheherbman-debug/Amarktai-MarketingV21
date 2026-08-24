import path from 'path';
import { promises as fs } from 'fs';
import { Job, Worker } from 'bullmq';
import { closePool, query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { safeFetch } from '../utils/safe-fetch';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';
import {
  beginGovernedGeneration,
  completeGovernedGeneration,
  failGovernedGeneration,
  markGovernedGenerationSubmitted,
  type GovernedGeneration,
} from '../services/governed-generation.service';
import { createStillMotionClip, type StillMotionStyle } from '../services/still-motion.service';

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

function assetIdFromUrl(url: string): string | null {
  const match = url.match(/\/studio\/assets\/([0-9a-f-]{36})(?:$|[?#/])/i);
  return match?.[1] || null;
}

async function createAsset(
  organizationId: string,
  userId: string,
  filename: string,
  mimeType: string,
  storagePath: string,
  metadata: Record<string, unknown>
): Promise<{ id: string; url: string }> {
  const stat = await fs.stat(storagePath);
  const result = await query(
    `INSERT INTO studio_assets (
       organization_id,user_id,filename,original_name,mime_type,
       size_bytes,storage_path,url,metadata
     ) VALUES ($1,$2,$3,$3,$4,$5,$6,NULL,$7) RETURNING id`,
    [organizationId, userId, filename, mimeType, stat.size, storagePath, JSON.stringify(metadata)]
  );
  const id = String(result.rows[0].id);
  const url = `/api/v1/studio/assets/${id}`;
  await query('UPDATE studio_assets SET url=$1 WHERE id=$2', [url, id]);
  return { id, url };
}

async function materializeImage(source: string, organizationId: string, destination: string): Promise<string> {
  const assetId = assetIdFromUrl(source);
  if (assetId) {
    const asset = await query(
      `SELECT storage_path FROM studio_assets
       WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`,
      [assetId, organizationId]
    );
    if (!asset.rows[0]?.storage_path) throw new Error('Still-image source asset was not found');
    await fs.copyFile(String(asset.rows[0].storage_path), destination);
    return destination;
  }
  const response = await safeFetch(source, {
    timeoutMs: 60_000,
    maxRedirects: 5,
    maxResponseBytes: 25 * 1024 * 1024,
    headers: { Accept: 'image/*' },
  });
  if (!response.ok) throw new Error(`Still-image download failed: HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Still-image provider returned unsupported content type: ${contentType}`);
  }
  await fs.writeFile(destination, Buffer.from(await response.bytes()));
  return destination;
}

async function isCancelled(sceneId: string): Promise<boolean> {
  const state = await query(
    'SELECT status,cancellation_requested_at FROM video_scenes WHERE id=$1',
    [sceneId]
  );
  return state.rows[0]?.status === 'cancelled' || Boolean(state.rows[0]?.cancellation_requested_at);
}

async function waitForProviderJob(providerJobId: string, sceneId: string): Promise<any> {
  const started = Date.now();
  const timeoutMs = 8 * 60_000;
  while (Date.now() - started < timeoutMs) {
    if (await isCancelled(sceneId)) {
      await genxMultimodalProvider.cancelJob(providerJobId).catch(() => undefined);
      return { status: 'cancelled' };
    }
    const state: any = await genxMultimodalProvider.getJob(providerJobId);
    await query('UPDATE video_scenes SET updated_at=NOW() WHERE id=$1', [sceneId]);
    if (['completed', 'failed', 'cancelled'].includes(state.status)) return state;
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw new Error('GenX still-image generation timed out');
}

function motionStyle(sceneNumber: number, metadata: Record<string, any>): StillMotionStyle {
  const explicit = String(metadata.motion_style || '').toLowerCase();
  if (['zoom_in', 'zoom_out', 'pan_left', 'pan_right'].includes(explicit)) return explicit as StillMotionStyle;
  const styles: StillMotionStyle[] = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'];
  return styles[Math.abs(sceneNumber || 0) % styles.length];
}

async function processStillMotion(job: Job): Promise<void> {
  const data = job.data as any;
  const sceneResult = await query(
    `SELECT scene.*,project.owner_id,project.aspect_ratio,project.resolution,
            project.frame_rate,project.metadata AS project_metadata
     FROM video_scenes scene
     JOIN video_projects project ON project.id=scene.project_id
     WHERE scene.id=$1 AND scene.organization_id=$2 AND project.organization_id=$2`,
    [data.sceneId, data.organizationId]
  );
  if (sceneResult.rows.length === 0) throw new Error('Long-form still-motion scene not found');
  const scene = sceneResult.rows[0] as Record<string, any>;
  if (String(scene.production_mode || '') !== 'still_motion') {
    throw new Error('Long-form still worker rejected a scene without persisted still_motion intent');
  }
  const sceneMetadata = asObject(scene.metadata);
  const projectMetadata = asObject(scene.project_metadata);
  const workerId = `still-motion-${process.pid}`;
  const outputDir = path.join(process.cwd(), 'uploads', 'studio', 'longform-stills', String(scene.id));
  await fs.mkdir(outputDir, { recursive: true });
  const imagePath = path.join(outputDir, 'source-image.png');
  const videoPath = path.join(outputDir, 'motion-clip.mp4');

  await query(
    `UPDATE video_scenes SET status='generating',worker_id=$1,error_message=NULL,updated_at=NOW()
     WHERE id=$2 AND organization_id=$3`,
    [workerId, scene.id, data.organizationId]
  );

  let governed: GovernedGeneration | null = null;
  let imageAssetUrl = String(scene.source_image_url || '');
  try {
    if (await isCancelled(String(scene.id))) throw new Error('Still-motion scene generation cancelled');

    if (imageAssetUrl && sceneMetadata.generated_still_asset === true) {
      await materializeImage(imageAssetUrl, data.organizationId, imagePath);
    } else {
      if (!scene.model_id) throw new Error('Still-motion scene has no selected image model');
      governed = await beginGovernedGeneration({
        organizationId: data.organizationId,
        userId: scene.owner_id,
        campaignId: projectMetadata.campaign_id ? String(projectMetadata.campaign_id) : null,
        generationJobId: String(scene.id),
        modelId: String(scene.model_id),
        operation: 'text_to_image',
        quantity: 1,
        // Stable across local FFmpeg retries: a successfully purchased still is
        // reused and its credit reservation cannot be duplicated by retry_count.
        idempotencyKey: `longform-still:${scene.id}:image:v1`,
        title: `Create long-form scene artwork ${Number(scene.scene_number || 0)}`,
        summary: String(scene.visual_prompt || '').slice(0, 500),
        requestedBy: 'system',
        payload: {
          project_id: scene.project_id,
          scene_id: scene.id,
          production_mode: 'still_motion',
          local_motion_render: true,
        },
      });

      const providerJob: any = await genxMultimodalProvider.generate({
        model: String(scene.model_id),
        params: {
          prompt: String(scene.visual_prompt || ''),
          aspect_ratio: String(scene.aspect_ratio || '16:9'),
        },
        metadata: {
          organization_id: data.organizationId,
          project_id: scene.project_id,
          scene_id: scene.id,
          type: 'text_to_image',
          purpose: 'longform_still_motion',
        },
        webhook_url: process.env.GENX_WEBHOOK_URL,
      });
      await markGovernedGenerationSubmitted(governed, providerJob.id);
      await query(
        `UPDATE video_scenes SET provider_job_id=$1,submitted_at=NOW(),updated_at=NOW() WHERE id=$2`,
        [providerJob.id, scene.id]
      );

      const finalState = await waitForProviderJob(providerJob.id, String(scene.id));
      if (finalState.status === 'cancelled') throw new Error('Still-motion scene generation cancelled');
      if (finalState.status === 'failed') throw new Error(finalState.error || 'GenX still-image generation failed');

      let providerUrl = String(finalState.result_url || '');
      let resultData: Record<string, unknown> = finalState.result_data || {};
      if (!providerUrl) {
        const result = await genxMultimodalProvider.getJobResult(providerJob.id);
        providerUrl = String(result.url || '');
        resultData = result.data || resultData;
      }
      if (!providerUrl) throw new Error('GenX still-image generation completed without an output URL');

      await materializeImage(providerUrl, data.organizationId, imagePath);
      const imageAsset = await createAsset(
        data.organizationId,
        String(scene.owner_id),
        `scene-${scene.id}-source.png`,
        'image/png',
        imagePath,
        { scene_id: scene.id, project_id: scene.project_id, asset_role: 'longform_still_source', provider_url: providerUrl }
      );
      imageAssetUrl = imageAsset.url;
      await query(
        `UPDATE video_scenes SET source_image_url=$1,provider_result_url=$2,production_mode='still_motion',
           metadata=COALESCE(metadata,'{}'::jsonb) || $3::jsonb,updated_at=NOW()
         WHERE id=$4 AND organization_id=$5`,
        [
          imageAsset.url,
          providerUrl,
          JSON.stringify({
            production_mode: 'still_motion',
            generated_still_asset: true,
            still_asset_id: imageAsset.id,
            provider_result: resultData,
            provider_usage: finalState.usage || null,
          }),
          scene.id,
          data.organizationId,
        ]
      );
      await completeGovernedGeneration(governed, providerJob.id, {
        usage: finalState.usage || null,
        project_id: scene.project_id,
        scene_id: scene.id,
        production_mode: 'still_motion',
      });
      governed = null;
      await query(
        `UPDATE genx_models SET verification_status='runtime_confirmed',last_verified=NOW() WHERE id=$1`,
        [scene.model_id]
      );
    }

    if (await isCancelled(String(scene.id))) throw new Error('Still-motion scene generation cancelled');
    if (!(await fs.stat(imagePath).catch(() => null))) {
      await materializeImage(imageAssetUrl, data.organizationId, imagePath);
    }

    const style = motionStyle(Number(scene.scene_number || 0), sceneMetadata);
    const rendered = await createStillMotionClip(imagePath, videoPath, {
      durationSeconds: Math.max(1, Number(scene.duration_seconds || 5)),
      resolution: String(scene.resolution || '1920x1080'),
      frameRate: Number(scene.frame_rate || 24),
      style,
    });
    const videoAsset = await createAsset(
      data.organizationId,
      String(scene.owner_id),
      `scene-${scene.id}-motion.mp4`,
      'video/mp4',
      videoPath,
      { scene_id: scene.id, project_id: scene.project_id, asset_role: 'longform_still_motion', motion_style: style }
    );

    await query(
      `UPDATE video_scenes
       SET status='completed',generated_clip_url=$1,completed_at=NOW(),error_message=NULL,
           metadata=COALESCE(metadata,'{}'::jsonb) || $2::jsonb,updated_at=NOW()
       WHERE id=$3 AND organization_id=$4`,
      [
        videoAsset.url,
        JSON.stringify({
          production_mode: 'still_motion',
          motion_style: style,
          local_motion_render: true,
          local_motion_size_bytes: rendered.sizeBytes,
          local_motion_duration_seconds: rendered.durationSeconds,
          provider_video_cost_avoided: true,
        }),
        scene.id,
        data.organizationId,
      ]
    );
  } catch (error) {
    if (governed) await failGovernedGeneration(governed, error);
    throw error;
  }
}

async function processJob(job: Job): Promise<void> {
  try {
    await processStillMotion(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const awaitingControl = error instanceof AppError && [
      'RELAUNCH_APPROVAL_REQUIRED',
      'RELAUNCH_ACTION_BLOCKED',
      'RELAUNCH_DECISION_STALE',
      'RELAUNCH_APPROVAL_EXPIRED',
    ].includes(error.code);
    await query(
      `UPDATE video_scenes
       SET status=$1,error_message=$2,
           retry_count=retry_count + CASE WHEN $3 THEN 0 ELSE 1 END,updated_at=NOW()
       WHERE id=$4 AND organization_id=$5`,
      [awaitingControl ? 'pending_control' : 'failed', message, awaitingControl, job.data.sceneId, job.data.organizationId]
    );
    throw error;
  }
}

const worker = new Worker('longform-still-motion', processJob, {
  connection,
  concurrency: Math.max(1, Number(process.env.LONGFORM_STILL_WORKER_CONCURRENCY || 1)),
  limiter: { max: Math.max(1, Number(process.env.GENX_REQUESTS_PER_MINUTE || 10)), duration: 60000 },
});

worker.on('completed', (job) => logger.info(`Long-form still-motion job completed: ${job.id}`));
worker.on('failed', (job, error) => logger.error(`Long-form still-motion job failed: ${job?.id}: ${error.message}`));
worker.on('error', (error) => logger.error('Long-form still-motion worker error', error));

async function shutdown(signal: string) {
  logger.info(`${signal}: closing long-form still-motion worker`);
  await worker.close();
  await closePool();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

logger.info('Long-form still-motion worker started');
