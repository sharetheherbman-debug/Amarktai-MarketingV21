import { Job, Worker } from 'bullmq';
import { closePool, query } from '../config/database';
import { logger } from '../utils/logger';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

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

  await query(
    `UPDATE studio_generations
     SET status = 'processing', worker_id = $1, attempt_count = attempt_count + 1,
         heartbeat_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [workerId, generationId]
  );

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

  if (finalState.status === 'cancelled') return;
  if (finalState.status === 'failed') throw new Error(finalState.error || 'GenX generation failed');

  let outputUrl = finalState.result_url;
  if (!outputUrl) {
    const result: any = await genxMultimodalProvider.getJobResult(providerJob.id);
    outputUrl = result.url;
  }
  if (!outputUrl) throw new Error('GenX completed without a result URL');

  await query(
    `UPDATE studio_generations
     SET status = 'completed', progress = 100, output_urls = $1,
         completed_at = NOW(), heartbeat_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [JSON.stringify([outputUrl]), generationId]
  );
}

async function processLongformScene(job: Job): Promise<void> {
  const data = job.data as any;
  const workerId = `generation-${process.pid}`;
  const sceneResult = await query(
    `SELECT scene.*, project.aspect_ratio, project.resolution
     FROM video_scenes scene
     JOIN video_projects project ON project.id = scene.project_id
     WHERE scene.id = $1 AND scene.organization_id = $2`,
    [data.sceneId, data.organizationId]
  );
  if (sceneResult.rows.length === 0) throw new Error('Long-form scene not found');
  const scene = sceneResult.rows[0];

  await query(
    `UPDATE video_scenes
     SET status = 'generating', worker_id = $1, updated_at = NOW()
     WHERE id = $2`,
    [workerId, scene.id]
  );

  const params: Record<string, unknown> = {
    prompt: scene.visual_prompt,
    duration: scene.duration_seconds,
    aspect_ratio: scene.aspect_ratio,
    resolution: scene.resolution,
  };
  if (scene.negative_prompt) params.negative_prompt = scene.negative_prompt;
  if (scene.source_image_url) params.image_url = scene.source_image_url;
  if (scene.source_video_url) params.video_url = scene.source_video_url;
  if (scene.start_frame_url) params.first_frame = scene.start_frame_url;
  if (scene.end_frame_url) params.last_frame = scene.end_frame_url;
  if (scene.provider_continuation_token) params.continuation_token = scene.provider_continuation_token;
  else if (scene.continuation_source_id) {
    const source = await query(
      `SELECT provider_job_id, provider_continuation_token, provider_result_url,
              generated_clip_url, final_frame_asset_id
       FROM video_scenes WHERE id = $1 AND organization_id = $2`,
      [scene.continuation_source_id, data.organizationId]
    );
    if (source.rows[0]?.provider_continuation_token) params.continuation_token = source.rows[0].provider_continuation_token;
    else if (source.rows[0]?.provider_job_id) params.request_id = source.rows[0].provider_job_id;
    else if (source.rows[0]?.provider_result_url) params.video_url = source.rows[0].provider_result_url;
  }

  const providerJob: any = await genxMultimodalProvider.generate({
    model: data.modelId,
    params,
    metadata: {
      organization_id: data.organizationId,
      project_id: data.projectId,
      scene_id: data.sceneId,
      type: scene.source_image_url ? 'image_to_video' : 'text_to_video',
    },
    webhook_url: process.env.GENX_WEBHOOK_URL,
  } as any);

  await query(
    `UPDATE video_scenes
     SET provider_job_id = $1, submitted_at = NOW(), updated_at = NOW()
     WHERE id = $2`,
    [providerJob.id, scene.id]
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

  if (finalState.status === 'cancelled') return;
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
         error_message = NULL, updated_at = NOW()
     WHERE id = $3`,
    [
      outputUrl,
      (resultData.continuation_token || resultData.continuation_id || null) as string | null,
      scene.id,
    ]
  );
}

async function processJob(job: Job): Promise<void> {
  try {
    if (job.name === 'longform-scene' || job.data?.kind === 'longform-scene') await processLongformScene(job);
    else await processStudio(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (job.name === 'longform-scene' || job.data?.kind === 'longform-scene') {
      await query(
        `UPDATE video_scenes
         SET status = 'failed', error_message = $1, retry_count = retry_count + 1, updated_at = NOW()
         WHERE id = $2`,
        [message, job.data.sceneId]
      );
    } else {
      await query(
        `UPDATE studio_generations
         SET status = 'failed', error_code = 'WORKER_ERROR', error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [message, job.data.generationId]
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
