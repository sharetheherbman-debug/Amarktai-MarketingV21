import path from 'path';
import { promises as fs } from 'fs';
import { Job, Worker } from 'bullmq';
import { closePool, query } from '../config/database';
import { logger } from '../utils/logger';
import * as ffmpegService from '../services/ffmpeg.service';
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

function assetIdFromUrl(url: string): string | null {
  const match = url.match(/\/studio\/assets\/([0-9a-f-]{36})(?:$|[?#/])/i);
  return match?.[1] || null;
}

async function materializeMedia(
  source: string | null | undefined,
  destination: string,
  organizationId: string,
  explicitAssetId?: string | null
): Promise<string | undefined> {
  if (!source && !explicitAssetId) return undefined;
  const assetId = explicitAssetId || (source ? assetIdFromUrl(source) : null);
  if (assetId) {
    const asset = await query(
      `SELECT storage_path FROM studio_assets
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [assetId, organizationId]
    );
    const storagePath = asset.rows[0]?.storage_path as string | undefined;
    if (!storagePath) throw new Error(`Asset ${assetId} was not found for this organization`);
    await fs.copyFile(storagePath, destination);
    return destination;
  }

  if (!source) return undefined;
  if (path.isAbsolute(source)) {
    throw new Error('Absolute host filesystem media paths are not accepted; use an organization-owned Studio asset');
  }
  const response = await safeFetch(source, { timeoutMs: 120000, maxResponseBytes: 25 * 1024 * 1024 });
  if (!response.ok) throw new Error(`Media download failed: ${response.status}`);
  await fs.writeFile(destination, Buffer.from(await response.bytes()));
  return destination;
}

function srtTimestamp(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const secs = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function vttTimestamp(seconds: number): string {
  return srtTimestamp(seconds).replace(',', '.');
}

async function writeCaptionTracks(
  scenes: Array<Record<string, any>>,
  srtDestination: string,
  vttDestination: string
): Promise<{ srt?: string; vtt?: string }> {
  const srt: string[] = [];
  const vtt: string[] = ['WEBVTT', ''];
  let cursor = 0;
  let cue = 1;
  for (const scene of scenes) {
    const duration = Math.max(0.1, Number(scene.duration_seconds || 0));
    const text = String(scene.caption_text || scene.narration || scene.dialogue || '').trim();
    if (text) {
      const safeText = text.replace(/\r?\n+/g, ' ').replace(/-->/g, '→');
      srt.push(String(cue));
      srt.push(`${srtTimestamp(cursor)} --> ${srtTimestamp(cursor + duration)}`);
      srt.push(safeText, '');
      vtt.push(String(cue));
      vtt.push(`${vttTimestamp(cursor)} --> ${vttTimestamp(cursor + duration)}`);
      vtt.push(safeText, '');
      cue += 1;
    }
    cursor += duration;
  }
  if (cue === 1) return {};
  await fs.writeFile(srtDestination, srt.join('\n'), 'utf8');
  await fs.writeFile(vttDestination, vtt.join('\n'), 'utf8');
  return { srt: srtDestination, vtt: vttDestination };
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
    const voiceSettings = asObject(project.voice_settings);
    const musicSettings = asObject(project.music_settings);
    const captionSettings = asObject(project.caption_settings);
    const projectMetadata = asObject(project.metadata);

    const scenesResult = await query(
      `SELECT * FROM video_scenes
       WHERE project_id = $1 AND organization_id = $2
         AND status IN ('completed', 'approved', 'locked')
         AND generated_clip_url IS NOT NULL
       ORDER BY scene_number`,
      [projectId, organizationId]
    );
    if (scenesResult.rows.length === 0) throw new Error('No completed scene clips');
    const scenes = scenesResult.rows as Array<Record<string, any>>;

    const clips: string[] = [];
    for (let index = 0; index < scenes.length; index += 1) {
      await assertNotCancelled(renderId);
      const scene = scenes[index];
      const destination = path.join(tempDir, `scene_${index}.mp4`);
      await materializeMedia(scene.generated_clip_url, destination, organizationId);
      clips.push(destination);
      await query(
        `UPDATE video_renders SET progress = $1, heartbeat_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [Math.round(((index + 1) / scenes.length) * 35), renderId]
      );
    }
    await logEvent(renderId, 'clips_ready', `${clips.length} scene clips downloaded`);

    const transitions = scenes.map((scene, index) => {
      const metadata = asObject(scene.metadata);
      return String(metadata.transition || (index === 0 ? 'cut' : 'crossfade'));
    });
    await assertNotCancelled(renderId);
    const assembledPath = path.join(tempDir, 'assembled.mp4');
    const assembly = await ffmpegService.concatenateVideos(clips, assembledPath, {
      resolution: project.resolution || '1920x1080',
      frameRate: Number(project.frame_rate || 24),
      transitions,
      transitionDuration: Number(projectMetadata.transition_duration_seconds || 0.5),
    });
    if (!assembly.success) throw new Error(assembly.error || 'FFmpeg scene assembly failed');
    await query(
      `UPDATE video_renders SET progress = 55, heartbeat_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [renderId]
    );
    await logEvent(renderId, 'scenes_assembled', 'Scene clips normalized and combined with selected transitions', {
      duration: assembly.duration,
      resolution: assembly.resolution,
      transitions,
    });

    let narrationPath: string | undefined;
    if (voiceSettings.enabled && (voiceSettings.asset_url || voiceSettings.asset_id)) {
      narrationPath = await materializeMedia(
        voiceSettings.asset_url,
        path.join(tempDir, 'narration.mp3'),
        organizationId,
        voiceSettings.asset_id
      );
      await logEvent(renderId, 'narration_ready', 'Project narration loaded');
    }

    let soundtrackPath: string | undefined;
    if (musicSettings.enabled && (musicSettings.asset_url || musicSettings.asset_id)) {
      soundtrackPath = await materializeMedia(
        musicSettings.asset_url,
        path.join(tempDir, 'soundtrack.mp3'),
        organizationId,
        musicSettings.asset_id
      );
      await logEvent(renderId, 'soundtrack_ready', 'Project soundtrack loaded');
    }

    let subtitlePath: string | undefined;
    let vttPath: string | undefined;
    if (captionSettings.enabled) {
      const tracks = await writeCaptionTracks(
        scenes,
        path.join(outputDir, 'captions.srt'),
        path.join(outputDir, 'captions.vtt')
      );
      subtitlePath = captionSettings.burn_in === false ? undefined : tracks.srt;
      vttPath = tracks.vtt;
      if (tracks.srt) await logEvent(renderId, 'captions_ready', 'SRT and VTT caption tracks prepared');
    }

    await assertNotCancelled(renderId);
    const finalPath = path.join(outputDir, 'final.mp4');
    const renderResult = await ffmpegService.composeFinalVideo(assembledPath, finalPath, {
      narrationPath,
      soundtrackPath,
      subtitlePath,
      durationSeconds: assembly.duration,
      narrationVolume: Number(voiceSettings.volume ?? 1),
      soundtrackVolume: Number(musicSettings.volume ?? 0.25),
      originalAudioVolume: Number(musicSettings.original_audio_volume ?? 1),
      duckMusic: musicSettings.duck_under_narration !== false,
      captionFontSize: Number(captionSettings.font_size || 42),
      captionColor: String(captionSettings.text_color || '#ffffff'),
      captionPosition: captionSettings.position || 'bottom',
      fadeInSeconds: Number(musicSettings.fade_in_seconds ?? 1),
      fadeOutSeconds: Number(musicSettings.fade_out_seconds ?? 2),
    });
    if (!renderResult.success) throw new Error(renderResult.error || 'Final FFmpeg composition failed');
    const visualContent = await ffmpegService.inspectVideoVisualContent(finalPath);
    if (!visualContent.visible) {
      throw new Error('Rendered video contains no visible picture content. Check the source scene clips, then retry the render.');
    }
    await query(
      `UPDATE video_renders SET progress = 88, heartbeat_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [renderId]
    );
    await logEvent(renderId, 'composition_complete', 'Narration, music and captions composed', {
      narration: Boolean(narrationPath),
      soundtrack: Boolean(soundtrackPath),
      captions: Boolean(subtitlePath),
    });

    const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
    await ffmpegService.generateThumbnail(finalPath, thumbnailPath);
    await assertNotCancelled(renderId);

    const outputAsset = await createAsset(
      organizationId, project.owner_id, `amarktai-${renderId}.mp4`, 'video/mp4', finalPath
    );
    const thumbnailAsset = await createAsset(
      organizationId, project.owner_id, `amarktai-${renderId}.jpg`, 'image/jpeg', thumbnailPath
    );
    const srtAsset = subtitlePath || vttPath
      ? await createAsset(
          organizationId,
          project.owner_id,
          `amarktai-${renderId}.srt`,
          'application/x-subrip',
          path.join(outputDir, 'captions.srt')
        )
      : null;
    const vttAsset = vttPath
      ? await createAsset(
          organizationId,
          project.owner_id,
          `amarktai-${renderId}.vtt`,
          'text/vtt',
          vttPath
        )
      : null;

    const renderEvidence = {
      video_codec: renderResult.videoCodec,
      audio_codec: renderResult.audioCodec,
      pixel_format: renderResult.pixelFormat,
      resolution: renderResult.resolution,
      narration: Boolean(narrationPath),
      soundtrack: Boolean(soundtrackPath),
      captions: Boolean(srtAsset),
      transitions,
      visual_content: visualContent,
      srt_asset_id: srtAsset?.id || null,
      srt_url: srtAsset?.url || null,
      vtt_asset_id: vttAsset?.id || null,
      vtt_url: vttAsset?.url || null,
    };

    await query(
      `UPDATE video_renders
       SET status = 'completed', progress = 100, output_url = $1, thumbnail_url = $2,
           output_asset_id = $3, thumbnail_asset_id = $4,
           duration_seconds = $5, file_size_bytes = $6,
           render_config = COALESCE(render_config, '{}'::jsonb) || $7::jsonb,
           completed_at = NOW(), heartbeat_at = NOW(), updated_at = NOW()
       WHERE id = $8 AND status <> 'cancelled'`,
      [
        outputAsset.url,
        thumbnailAsset.url,
        outputAsset.id,
        thumbnailAsset.id,
        Math.round(renderResult.duration),
        outputAsset.size,
        JSON.stringify(renderEvidence),
        renderId,
      ]
    );
    await query(
      `UPDATE video_projects
       SET status = 'completed', final_output_url = $1, thumbnail_url = $2,
           metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $4 AND organization_id = $5`,
      [
        outputAsset.url,
        thumbnailAsset.url,
        JSON.stringify({
          last_render_id: renderId,
          final_duration_seconds: renderResult.duration,
          final_asset_id: outputAsset.id,
          caption_assets: {
            srt_asset_id: srtAsset?.id || null,
            srt_url: srtAsset?.url || null,
            vtt_asset_id: vttAsset?.id || null,
            vtt_url: vttAsset?.url || null,
          },
        }),
        projectId,
        organizationId,
      ]
    );
    await logEvent(renderId, 'render_completed', 'Render completed and validated', {
      duration: renderResult.duration,
      size: outputAsset.size,
      videoCodec: renderResult.videoCodec,
      audioCodec: renderResult.audioCodec,
      pixelFormat: renderResult.pixelFormat,
      resolution: renderResult.resolution,
      outputAssetId: outputAsset.id,
      thumbnailAssetId: thumbnailAsset.id,
      srtAssetId: srtAsset?.id || null,
      vttAssetId: vttAsset?.id || null,
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
