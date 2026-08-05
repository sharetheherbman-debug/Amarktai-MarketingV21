import { Queue } from 'bullmq';
import { promises as fs } from 'fs';
import path from 'path';
import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import * as ffmpegService from './ffmpeg.service';
import * as longformService from './longform-video.service';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';

const renderQueue = new Queue('video-renders', {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

// Types
export interface VideoRender {
  id: string;
  project_id: string;
  organization_id: string;
  status: string;
  progress: number;
  output_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  render_config: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface RenderEvent {
  id: string;
  render_id: string;
  event_type: string;
  message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ─── Render Management ───────────────────────────────────────────────────────

export async function createRender(projectId: string, orgId: string): Promise<VideoRender> {
  // Get project and scenes
  const project = await longformService.getProject(projectId, orgId);
  const scenes = await longformService.listScenes(projectId, orgId);

  const completedScenes = scenes.filter(s => s.status === 'completed' && s.generated_clip_url);
  if (completedScenes.length === 0) {
    throw new AppError(400, 'No completed scenes to render', 'NO_SCENES');
  }

  // Create render record
  const result = await query(
    `INSERT INTO video_renders (project_id, organization_id, status, progress, render_config)
     VALUES ($1, $2, 'pending', 0, $3) RETURNING *`,
    [projectId, orgId, JSON.stringify({
      resolution: project.resolution,
      frame_rate: project.frame_rate,
      aspect_ratio: project.aspect_ratio,
    })]
  );

  const render = mapRenderRow(result.rows[0]);

  // Enqueue render job
  await renderQueue.add('render', {
    renderId: render.id,
    projectId,
    organizationId: orgId,
  }, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });

  logger.info(`Render queued: ${render.id}`);
  return render;
}

// ─── Render Queries ──────────────────────────────────────────────────────────

export async function getRender(id: string, orgId: string): Promise<VideoRender> {
  const result = await query(
    'SELECT * FROM video_renders WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Render');
  return mapRenderRow(result.rows[0]);
}

export async function listRenders(projectId: string, orgId: string): Promise<VideoRender[]> {
  const result = await query(
    'SELECT * FROM video_renders WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC',
    [projectId, orgId]
  );
  return result.rows.map(mapRenderRow);
}

export async function cancelRender(id: string, orgId: string): Promise<void> {
  await query(
    "UPDATE video_renders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND organization_id = $2",
    [id, orgId]
  );
  await logRenderEvent(id, 'render_cancelled', 'Render cancelled by user');
}

export async function getRenderEvents(renderId: string, orgId: string): Promise<RenderEvent[]> {
  const result = await query(
    'SELECT * FROM video_render_events WHERE render_id = $1 ORDER BY created_at ASC',
    [renderId]
  );
  return result.rows.map(row => ({
    id: row.id as string,
    render_id: row.render_id as string,
    event_type: row.event_type as string,
    message: row.message as string | null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as string,
  }));
}

async function logRenderEvent(renderId: string, eventType: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
  await query(
    'INSERT INTO video_render_events (render_id, event_type, message, metadata) VALUES ($1, $2, $3, $4)',
    [renderId, eventType, message, JSON.stringify(metadata || {})]
  );
}

function mapRenderRow(row: Record<string, unknown>): VideoRender {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    organization_id: row.organization_id as string,
    status: row.status as string,
    progress: parseInt(row.progress as string) || 0,
    output_url: row.output_url as string | null,
    thumbnail_url: row.thumbnail_url as string | null,
    duration_seconds: row.duration_seconds ? parseInt(row.duration_seconds as string) : null,
    file_size_bytes: row.file_size_bytes ? parseInt(row.file_size_bytes as string) : null,
    render_config: typeof row.render_config === 'string' ? JSON.parse(row.render_config) : (row.render_config as Record<string, unknown>) || {},
    error_message: row.error_message as string | null,
    started_at: row.started_at as string | null,
    completed_at: row.completed_at as string | null,
    created_at: row.created_at as string,
  };
}
