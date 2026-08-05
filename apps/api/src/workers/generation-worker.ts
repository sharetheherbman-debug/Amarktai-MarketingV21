import { Worker, Job } from 'bullmq';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';

interface GenerationJobData {
  generationId: string;
  organizationId: string;
  userId: string;
  type: string;
  modelId: string;
  prompt?: string;
  negativePrompt?: string;
  options?: Record<string, unknown>;
  idempotencyKey?: string;
}

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

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
    music_generation: 600000,
    audio_generation: 600000,
  };
  return waits[type] || 300000;
}

async function processGeneration(job: Job): Promise<void> {
  const data = job.data as GenerationJobData;
  const { generationId, organizationId, modelId, type, prompt, negativePrompt, options } = data;
  const workerId = `worker-${process.pid}`;

  logger.info(`Processing generation ${generationId} on ${workerId}`);

  try {
    // Mark as processing
    await query(
      `UPDATE studio_generations SET status = 'processing', worker_id = $1, updated_at = NOW() WHERE id = $2`,
      [workerId, generationId]
    );

    // Build params
    const params: Record<string, unknown> = {};
    if (prompt) params.prompt = prompt;
    if (negativePrompt) params.negative_prompt = negativePrompt;
    if (options) Object.assign(params, options);

    // Submit to GenX
    const genxJob = await genxMultimodalProvider.generate({
      model: modelId,
      params,
      metadata: { organization_id: organizationId, generation_id: generationId, type },
    });

    // Store provider job ID
    await query(
      `UPDATE studio_generations SET provider_job_id = $1, status = 'processing', updated_at = NOW() WHERE id = $2`,
      [genxJob.id, generationId]
    );

    // Poll for completion with heartbeat
    const startTime = Date.now();
    const maxWait = getMaxWaitMs(type);
    let lastStatus = '';

    while (Date.now() - startTime < maxWait) {
      // Check for cancellation
      const current = await query('SELECT status FROM studio_generations WHERE id = $1', [generationId]);
      if (current.rows[0]?.status === 'cancelled') {
        await genxMultimodalProvider.cancelJob(genxJob.id);
        return;
      }

      // Update heartbeat
      await query('UPDATE studio_generations SET updated_at = NOW() WHERE id = $1', [generationId]);

      // Poll GenX
      const status = await genxMultimodalProvider.getJob(genxJob.id);

      if (status.status !== lastStatus) {
        lastStatus = status.status;
        await query(
          `UPDATE studio_generations SET status = 'processing', progress = $1, updated_at = NOW() WHERE id = $2`,
          [status.progress || 0, generationId]
        );
      }

      if (status.status === 'completed') {
        // Get result
        let outputUrls: string[] = [];
        if (status.result_url) {
          outputUrls = [status.result_url];
        } else {
          const result = await genxMultimodalProvider.getJobResult(genxJob.id);
          if (result.url) outputUrls = [result.url];
        }

        if (outputUrls.length > 0) {
          await query(
            `UPDATE studio_generations SET status = 'completed', output_urls = $1, progress = 100, 
             provider_job_id = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3`,
            [JSON.stringify(outputUrls), genxJob.id, generationId]
          );
          logger.info(`Generation completed: ${generationId}`);
          return;
        }
      }

      if (status.status === 'failed') {
        await query(
          `UPDATE studio_generations SET status = 'failed', error_code = 'GENERATION_FAILED', 
           error_message = $1, provider_job_id = $2, updated_at = NOW() WHERE id = $3`,
          [status.error || 'Unknown error', genxJob.id, generationId]
        );
        return;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Timeout
    await query(
      `UPDATE studio_generations SET status = 'failed', error_code = 'TIMEOUT', 
       error_message = 'Generation timed out', provider_job_id = $1, updated_at = NOW() WHERE id = $2`,
      [genxJob.id, generationId]
    );

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Generation failed: ${generationId} - ${message}`);
    await query(
      `UPDATE studio_generations SET status = 'failed', error_code = 'WORKER_ERROR', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message, generationId]
    );
    throw error;
  }
}

const worker = new Worker('studio-generations', processGeneration, {
  connection,
  concurrency: 3,
  limiter: { max: 10, duration: 60000 },
});

worker.on('completed', (job) => {
  logger.info(`Generation job ${job.data.generationId} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Generation job ${job?.data?.generationId} failed: ${err.message}`);
});

logger.info('Generation worker started');

export default worker;
