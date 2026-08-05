import { Worker, Job } from 'bullmq';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import * as ffmpegService from '../services/ffmpeg.service';

interface RenderJobData {
  renderId: string;
  projectId: string;
  organizationId: string;
}

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

async function processRender(job: Job): Promise<void> {
  const data = job.data as RenderJobData;
  const { renderId, projectId, organizationId } = data;
  const workerId = `render-${process.pid}`;
  const tempDir = `/tmp/render_${renderId}`;

  logger.info(`Processing render ${renderId} on ${workerId}`);

  try {
    // Mark as processing with worker info
    await query(
      `UPDATE video_renders SET status = 'processing', worker_id = $1, started_at = NOW(), 
       attempt_count = attempt_count + 1, updated_at = NOW() WHERE id = $2`,
      [workerId, renderId]
    );
    await logRenderEvent(renderId, 'render_started', `Worker: ${workerId}`);

    // Create temp directory
    const fs = await import('fs/promises');
    await fs.mkdir(tempDir, { recursive: true });

    // Get project and scenes
    const projectResult = await query('SELECT * FROM video_projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) throw new Error('Project not found');
    const project = projectResult.rows[0];

    const scenesResult = await query(
      `SELECT * FROM video_scenes WHERE project_id = $1 AND status = 'completed' 
       AND generated_clip_url IS NOT NULL ORDER BY scene_number ASC`,
      [projectId]
    );

    if (scenesResult.rows.length === 0) {
      throw new Error('No completed scenes with clips');
    }

    const scenes = scenesResult.rows;
    await logRenderEvent(renderId, 'scenes_loaded', `${scenes.length} scenes found`);

    // Download scene clips
    const clipPaths: string[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const clipPath = path.join(tempDir, `scene_${i}.mp4`);

      // Update progress
      const progress = Math.round(((i + 1) / scenes.length) * 30);
      await query('UPDATE video_renders SET progress = $1, updated_at = NOW() WHERE id = $2', [progress, renderId]);

      if (scene.generated_clip_url) {
        await logRenderEvent(renderId, 'downloading_clip', `Scene ${scene.scene_number}`);
        const response = await fetch(scene.generated_clip_url);
        if (!response.ok) throw new Error(`Failed to download scene ${scene.scene_number}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(clipPath, buffer);
        clipPaths.push(clipPath);
      }
    }

    await logRenderEvent(renderId, 'clips_downloaded', `${clipPaths.length} clips ready`);

    // Concatenate clips
    await logRenderEvent(renderId, 'concatenating', 'Starting video concatenation');
    const concatPath = path.join(tempDir, 'concat.mp4');
    const concatResult = await ffmpegService.concatenateVideos(clipPaths, concatPath, {
      resolution: project.resolution || '1920x1080',
      frameRate: project.frame_rate || 24,
    });

    if (!concatResult.success) {
      throw new Error(concatResult.error || 'Concatenation failed');
    }

    await query('UPDATE video_renders SET progress = 60, updated_at = NOW() WHERE id = $1', [renderId]);

    // Generate thumbnail
    const thumbnailPath = path.join(tempDir, 'thumbnail.jpg');
    await ffmpegService.generateThumbnail(concatPath, thumbnailPath);

    await query('UPDATE video_renders SET progress = 80, updated_at = NOW() WHERE id = $1', [renderId]);

    // Copy to final location
    const outputDir = path.join(process.cwd(), 'uploads', 'renders', renderId);
    await fs.mkdir(outputDir, { recursive: true });
    const finalPath = path.join(outputDir, 'final.mp4');
    const finalThumbPath = path.join(outputDir, 'thumbnail.jpg');
    await fs.copyFile(concatPath, finalPath);
    await fs.copyFile(thumbnailPath, finalThumbPath);

    const stat = await fs.stat(finalPath);
    const info = await ffmpegService.getVideoInfo(finalPath);
    const duration = parseFloat((info.format as Record<string, unknown>).duration as string) || 0;

    // Update render record
    await query(
      `UPDATE video_renders SET status = 'completed', progress = 100, 
       output_url = $1, thumbnail_url = $2, duration_seconds = $3, file_size_bytes = $4,
       completed_at = NOW(), updated_at = NOW() WHERE id = $5`,
      [`/renders/${renderId}/final.mp4`, `/renders/${renderId}/thumbnail.jpg`, Math.round(duration), stat.size, renderId]
    );

    // Update project
    await query(
      `UPDATE video_projects SET status = 'completed', final_output_url = $1, thumbnail_url = $2, updated_at = NOW() WHERE id = $3`,
      [`/renders/${renderId}/final.mp4`, `/renders/${renderId}/thumbnail.jpg`, projectId]
    );

    await logRenderEvent(renderId, 'render_completed', `Duration: ${Math.round(duration)}s, Size: ${stat.size} bytes`);
    logger.info(`Render completed: ${renderId}`);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await query(
      `UPDATE video_renders SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2`,
      [message, renderId]
    );
    await logRenderEvent(renderId, 'render_failed', message);
    logger.error(`Render failed: ${renderId} - ${message}`);
    throw error;
  } finally {
    // Cleanup temp
    try {
      const fs = await import('fs/promises');
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

async function logRenderEvent(renderId: string, eventType: string, message: string): Promise<void> {
  await query(
    'INSERT INTO video_render_events (render_id, event_type, message) VALUES ($1, $2, $3)',
    [renderId, eventType, message]
  );
}

import path from 'path';

const worker = new Worker('video-renders', processRender, {
  connection,
  concurrency: 1,
});

worker.on('completed', (job) => {
  logger.info(`Render job ${job.data.renderId} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Render job ${job?.data?.renderId} failed: ${err.message}`);
});

logger.info('Render worker started');

export default worker;
