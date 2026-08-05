import path from 'path';
import { promises as fs } from 'fs';
import { Job, Worker } from 'bullmq';
import { closePool, query } from '../config/database';
import { logger } from '../utils/logger';
import * as ffmpegService from '../services/ffmpeg.service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

async function assertNotCancelled(renderId: string): Promise<void> {
  const state = await query(
    'SELECT status, cancellation_requested_at FROM video_renders WHERE id = $1',
    [renderId]
  );
  if (state.rows[0]?.status === 'cancelled' || Boolean(state.rows[0]?.cancellation_requested_at)) {
    throw new Error('RENDER_CANCELLED');
  }
}

async function logEvent(renderId: string, type: string, message: string, metadata = {}) {
  await query(
    `INSERT INTO video_render_events (render_id, event_type, message, metadata)
     VALUES ($1, $2, $3, $4)`,
    [renderId, type, message, JSON.stringify(metadata)]
  );
}

async function createAsset(
  organizationId: string,
  userId: string,
  filename: string,
  mime: string,
  storagePath: string
) {
  const stat = await fs.stat(storagePath);
  const result = await query(
    `INSERT INTO studio_assets (
       organization_id, user_id, filename, original_name, mime_type,
       size_bytes, storage_path, url
     )
     VALUES ($1, $2, $3, $3, $4, $5, $6, NULL)
     RETURNING id`,
    [organizationId, userId, filename, mime, stat.size, storagePath]
  );
  const id = result.rows[0].id as string;
  const url = `/api/v1/studio/assets/${id}`;
  await query('UPDATE studio_assets SET url = $1 WHERE id = $2', [url, id]);
  return { id, url, size: stat.size };
}

async function processRender(job: Job): Promise<void> {
  const { renderId, projectId, organizationId } = job.data as any;
  const workerId = `render-${process.pid}`;
  const tempDir = path.join('/tmp', `render_${renderId}`);
  const outputDir = path.join(process.cwd(), 'uploads', 'studio', 'renders', renderId);

  try {
    await query(
      `UPDATE video_renders
       SET status = 'processing', worker_id = $1, queue_job_id = $2,
           started_at = COALESCE(started_at, NOW()), attempt_count = attempt_count + 1,
           heartbeat_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND organization_id = $4`,
      [workerId, String(job.id), renderId, organizationId]
    );
    await logEvent(renderId, 'render_started', `Worker ${workerId}`);
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    await assertNotCancelled(renderId);

    const projectResult = await query(
      'SELECT * FROM video_projects WHERE id = $1 AND organization_id = $2',
      [projectId, organizationId]
    );
    if (projectResult.rows.length === 0) throw new Error('Project not found');
    const project = projectResult.rows[0];

    const scenesResult = await query(
      `SELECT * FROM video_scenes
       WHERE project_id = $1 AND organization_id = $2
         AND status = 'completed' AND generated_clip_url IS NOT NULL
       ORDER BY scene_number`,
      [projectId, organizationId]
    );
    if (scenesResult.rows.length === 0) throw new Error('No completed scene clips');

    const clips: string[] = [];
    for (let index = 0; index < scenesResult.rows.length; index += 1) {
      await assertNotCancelled(renderId);
      const scene = scenesResult.rows[index];
      const destination = path.join(tempDir, `scene_${index}.mp4`);
      const response = await fetch(scene.generated_clip_url);
      if (!response.ok) throw new Error(`Scene ${scene.scene_number} download failed: ${response.status}`);
      await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
      clips.push(destination);
      await query(
        `UPDATE video_renders SET progress = $1, heartbeat_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [Math.round(((index + 1) / scenesResult.rows.length) * 35), renderId]
      );
    }

    await assertNotCancelled(renderId);
    const finalPath = path.join(outputDir, 'final.mp4');
    const renderResult = await ffmpegService.concatenateVideos(clips, finalPath, {
      resolution: project.resolution || '1920x1080',
      frameRate: Number(project.frame_rate || 24),
    });
    if (!renderResult.success) throw new Error(renderResult.error || 'FFmpeg render failed');

    const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
    await ffmpegService.generateThumbnail(finalPath, thumbnailPath);
    await assertNotCancelled(renderId);

    const outputAsset = await createAsset(
      organizationId, project.owner_id, `amarktai-${renderId}.mp4`, 'video/mp4', finalPath
    );
    const thumbnailAsset = await createAsset(
      organizationId, project.owner_id, `amarktai-${renderId}.jpg`, 'image/jpeg', thumbnailPath
    );

    await query(
      `UPDATE video_renders
       SET status = 'completed', progress = 100, output_url = $1, thumbnail_url = $2,
           output_asset_id = $3, thumbnail_asset_id = $4,
           duration_seconds = $5, file_size_bytes = $6,
           completed_at = NOW(), heartbeat_at = NOW(), updated_at = NOW()
       WHERE id = $7 AND status <> 'cancelled'`,
      [
        outputAsset.url, thumbnailAsset.url, outputAsset.id, thumbnailAsset.id,
        Math.round(renderResult.duration), outputAsset.size, renderId,
      ]
    );
    await query(
      `UPDATE video_projects
       SET status = 'completed', final_output_url = $1, thumbnail_url = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4`,
      [outputAsset.url, thumbnailAsset.url, projectId, organizationId]
    );
    await logEvent(renderId, 'render_completed', 'Render completed', {
      duration: renderResult.duration,
      size: outputAsset.size,
      videoCodec: renderResult.videoCodec,
      audioCodec: renderResult.audioCodec,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'RENDER_CANCELLED') {
      await query(`UPDATE video_renders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [renderId]);
      await logEvent(renderId, 'render_cancelled', 'Render cancelled');
      return;
    }
    await query(
      `UPDATE video_renders
       SET status = 'failed', error_message = $1, updated_at = NOW()
       WHERE id = $2 AND status <> 'cancelled'`,
      [message, renderId]
    );
    await logEvent(renderId, 'render_failed', message);
    throw error;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const worker = new Worker('video-renders', processRender, {
  connection,
  concurrency: Number(process.env.RENDER_WORKER_CONCURRENCY || 1),
});

worker.on('completed', (job) => logger.info(`Render queue job completed: ${job.id}`));
worker.on('failed', (job, error) => logger.error(`Render queue job failed: ${job?.id}: ${error.message}`));
worker.on('error', (error) => logger.error('Render worker error', error));

async function shutdown(signal: string) {
  logger.info(`${signal}: closing render worker`);
  await worker.close();
  await closePool();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

logger.info('Render worker started');
