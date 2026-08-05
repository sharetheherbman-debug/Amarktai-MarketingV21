import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';
import * as genxRegistry from './genx-model-registry.service';

// Types
export interface VideoProject {
  id: string;
  organization_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  target_duration_seconds: number;
  aspect_ratio: string;
  resolution: string;
  frame_rate: number;
  brand_config: Record<string, unknown>;
  campaign_id: string | null;
  script: string | null;
  storyboard: unknown[];
  voice_settings: Record<string, unknown>;
  music_settings: Record<string, unknown>;
  caption_settings: Record<string, unknown>;
  status: string;
  final_output_url: string | null;
  thumbnail_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface VideoScene {
  id: string;
  project_id: string;
  organization_id: string;
  scene_number: number;
  title: string | null;
  narration: string | null;
  dialogue: string | null;
  visual_prompt: string | null;
  negative_prompt: string | null;
  model_id: string | null;
  duration_seconds: number;
  camera_instructions: string | null;
  source_image_url: string | null;
  source_video_url: string | null;
  start_frame_url: string | null;
  end_frame_url: string | null;
  continuation_source_id: string | null;
  generated_clip_url: string | null;
  audio_clip_url: string | null;
  caption_text: string | null;
  status: string;
  provider_job_id: string | null;
  error_message: string | null;
  retry_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Project CRUD ────────────────────────────────────────────────────────────

export async function listProjects(orgId: string): Promise<VideoProject[]> {
  const result = await query(
    'SELECT * FROM video_projects WHERE organization_id = $1 ORDER BY updated_at DESC',
    [orgId]
  );
  return result.rows.map(mapProjectRow);
}

export async function getProject(id: string, orgId: string): Promise<VideoProject> {
  const result = await query(
    'SELECT * FROM video_projects WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Video project');
  return mapProjectRow(result.rows[0]);
}

export async function createProject(orgId: string, userId: string, data: {
  name: string;
  description?: string;
  target_duration_seconds?: number;
  aspect_ratio?: string;
  resolution?: string;
  frame_rate?: number;
  script?: string;
}): Promise<VideoProject> {
  const result = await query(
    `INSERT INTO video_projects (organization_id, owner_id, name, description, target_duration_seconds, aspect_ratio, resolution, frame_rate, script)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [orgId, userId, data.name, data.description || null, data.target_duration_seconds || 60,
     data.aspect_ratio || '16:9', data.resolution || '1920x1080', data.frame_rate || 24, data.script || null]
  );
  logger.info(`Video project created: ${data.name}`);
  return mapProjectRow(result.rows[0]);
}

export async function updateProject(id: string, orgId: string, data: Partial<VideoProject>): Promise<VideoProject> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) { updates.push(`name = $${idx++}`); values.push(data.name); }
  if (data.description !== undefined) { updates.push(`description = $${idx++}`); values.push(data.description); }
  if (data.script !== undefined) { updates.push(`script = $${idx++}`); values.push(data.script); }
  if (data.storyboard !== undefined) { updates.push(`storyboard = $${idx++}`); values.push(JSON.stringify(data.storyboard)); }
  if (data.status !== undefined) { updates.push(`status = $${idx++}`); values.push(data.status); }
  if (data.final_output_url !== undefined) { updates.push(`final_output_url = $${idx++}`); values.push(data.final_output_url); }

  if (updates.length === 0) return getProject(id, orgId);
  updates.push('updated_at = NOW()');
  values.push(id, orgId);

  const result = await query(
    `UPDATE video_projects SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new NotFoundError('Video project');
  return mapProjectRow(result.rows[0]);
}

export async function deleteProject(id: string, orgId: string): Promise<void> {
  await query('DELETE FROM video_projects WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

// ─── Scene Management ────────────────────────────────────────────────────────

export async function listScenes(projectId: string, orgId: string): Promise<VideoScene[]> {
  const result = await query(
    'SELECT * FROM video_scenes WHERE project_id = $1 AND organization_id = $2 ORDER BY scene_number ASC',
    [projectId, orgId]
  );
  return result.rows.map(mapSceneRow);
}

export async function getScene(id: string, orgId: string): Promise<VideoScene> {
  const result = await query(
    'SELECT * FROM video_scenes WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Video scene');
  return mapSceneRow(result.rows[0]);
}

export async function addScene(projectId: string, orgId: string, data: {
  scene_number?: number;
  title?: string;
  narration?: string;
  visual_prompt?: string;
  negative_prompt?: string;
  model_id?: string;
  duration_seconds?: number;
  camera_instructions?: string;
}): Promise<VideoScene> {
  // Get next scene number if not provided
  let sceneNumber = data.scene_number;
  if (!sceneNumber) {
    const maxResult = await query(
      'SELECT MAX(scene_number) as max FROM video_scenes WHERE project_id = $1',
      [projectId]
    );
    sceneNumber = (parseInt(maxResult.rows[0]?.max as string) || 0) + 1;
  }

  const result = await query(
    `INSERT INTO video_scenes (project_id, organization_id, scene_number, title, narration, visual_prompt, negative_prompt, model_id, duration_seconds, camera_instructions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [projectId, orgId, sceneNumber, data.title || null, data.narration || null,
     data.visual_prompt || null, data.negative_prompt || null, data.model_id || null,
     data.duration_seconds || 5, data.camera_instructions || null]
  );
  return mapSceneRow(result.rows[0]);
}

export async function updateScene(id: string, orgId: string, data: Partial<VideoScene>): Promise<VideoScene> {
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.title !== undefined) { updates.push(`title = $${idx++}`); values.push(data.title); }
  if (data.narration !== undefined) { updates.push(`narration = $${idx++}`); values.push(data.narration); }
  if (data.visual_prompt !== undefined) { updates.push(`visual_prompt = $${idx++}`); values.push(data.visual_prompt); }
  if (data.model_id !== undefined) { updates.push(`model_id = $${idx++}`); values.push(data.model_id); }
  if (data.duration_seconds !== undefined) { updates.push(`duration_seconds = $${idx++}`); values.push(data.duration_seconds); }
  if (data.status !== undefined) { updates.push(`status = $${idx++}`); values.push(data.status); }
  if (data.generated_clip_url !== undefined) { updates.push(`generated_clip_url = $${idx++}`); values.push(data.generated_clip_url); }
  if (data.provider_job_id !== undefined) { updates.push(`provider_job_id = $${idx++}`); values.push(data.provider_job_id); }

  if (updates.length === 0) return getScene(id, orgId);
  updates.push('updated_at = NOW()');
  values.push(id, orgId);

  const result = await query(
    `UPDATE video_scenes SET ${updates.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
    values
  );
  if (result.rows.length === 0) throw new NotFoundError('Video scene');
  return mapSceneRow(result.rows[0]);
}

export async function deleteScene(id: string, orgId: string): Promise<void> {
  await query('DELETE FROM video_scenes WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

export async function reorderScenes(projectId: string, orgId: string, sceneIds: string[]): Promise<void> {
  for (let i = 0; i < sceneIds.length; i++) {
    await query(
      'UPDATE video_scenes SET scene_number = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3',
      [i + 1, sceneIds[i], orgId]
    );
  }
}

// ─── Scene Generation ────────────────────────────────────────────────────────

export async function generateScene(sceneId: string, orgId: string): Promise<VideoScene> {
  const scene = await getScene(sceneId, orgId);
  if (!scene.visual_prompt) {
    throw new AppError(400, 'Scene requires a visual prompt', 'MISSING_PROMPT');
  }

  // Mark as generating
  await query(
    "UPDATE video_scenes SET status = 'generating', error_message = NULL, updated_at = NOW() WHERE id = $1",
    [sceneId]
  );

  // Execute generation asynchronously
  executeSceneGeneration(sceneId, orgId, scene).catch(err => {
    logger.error(`Scene generation failed: ${sceneId} - ${err}`);
  });

  return { ...scene, status: 'generating' };
}

async function executeSceneGeneration(sceneId: string, orgId: string, scene: VideoScene): Promise<void> {
  try {
    // Find appropriate model
    let modelId = scene.model_id;
    if (!modelId) {
      const models = await genxRegistry.getAvailableModels('text_to_video');
      if (models.length === 0) {
        throw new AppError(400, 'No video generation model available', 'NO_MODEL');
      }
      modelId = models[0].id;
    }

    // Build GenX parameters
    const params: Record<string, unknown> = {
      prompt: scene.visual_prompt,
    };
    if (scene.negative_prompt) params.negative_prompt = scene.negative_prompt;
    if (scene.duration_seconds) params.duration = scene.duration_seconds;
    if (scene.source_image_url) params.image = scene.source_image_url;
    if (scene.start_frame_url) params.first_frame = scene.start_frame_url;
    if (scene.end_frame_url) params.last_frame = scene.end_frame_url;

    // Submit to GenX
    const job = await genxMultimodalProvider.generate({
      model: modelId,
      params,
      metadata: {
        organization_id: orgId,
        scene_id: sceneId,
        project_id: scene.project_id,
        type: 'text_to_video',
      },
    });

    // Update with provider job ID
    await query(
      'UPDATE video_scenes SET provider_job_id = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [job.id, 'generating', sceneId]
    );

    // Poll for completion
    const completedJob = await genxMultimodalProvider.waitForJob(job.id, {
      maxWaitMs: 1200000, // 20 minutes for video
      pollIntervalMs: 5000,
    });

    // Get result
    let clipUrl: string | null = null;
    if (completedJob.result_url) {
      clipUrl = completedJob.result_url;
    } else if (completedJob.status === 'completed') {
      const result = await genxMultimodalProvider.getJobResult(job.id);
      if (result.url) clipUrl = result.url;
    }

    if (completedJob.status === 'completed' && clipUrl) {
      await query(
        `UPDATE video_scenes SET status = 'completed', generated_clip_url = $1, error_message = NULL, updated_at = NOW() WHERE id = $2`,
        [clipUrl, sceneId]
      );
      logger.info(`Scene generation completed: ${sceneId}`);
    } else if (completedJob.status === 'failed') {
      await query(
        `UPDATE video_scenes SET status = 'failed', error_message = $1, retry_count = retry_count + 1, updated_at = NOW() WHERE id = $2`,
        [completedJob.error || 'Generation failed', sceneId]
      );
    } else {
      await query(
        `UPDATE video_scenes SET status = 'failed', error_message = 'Generation timeout', retry_count = retry_count + 1, updated_at = NOW() WHERE id = $1`,
        [sceneId]
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await query(
      `UPDATE video_scenes SET status = 'failed', error_message = $1, retry_count = retry_count + 1, updated_at = NOW() WHERE id = $2`,
      [message, sceneId]
    );
    logger.error(`Scene generation error: ${sceneId} - ${message}`);
  }
}

// ─── Project Statistics ──────────────────────────────────────────────────────

export async function getProjectStats(projectId: string, orgId: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT
       COUNT(*) as total_scenes,
       COUNT(*) FILTER (WHERE status = 'completed') as completed_scenes,
       COUNT(*) FILTER (WHERE status = 'generating') as generating_scenes,
       COUNT(*) FILTER (WHERE status = 'pending') as pending_scenes,
       COUNT(*) FILTER (WHERE status = 'failed') as failed_scenes,
       SUM(duration_seconds) as total_duration
     FROM video_scenes WHERE project_id = $1 AND organization_id = $2`,
    [projectId, orgId]
  );
  return result.rows[0];
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapProjectRow(row: Record<string, unknown>): VideoProject {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    owner_id: row.owner_id as string,
    name: row.name as string,
    description: row.description as string | null,
    target_duration_seconds: parseInt(row.target_duration_seconds as string) || 60,
    aspect_ratio: row.aspect_ratio as string,
    resolution: row.resolution as string,
    frame_rate: parseInt(row.frame_rate as string) || 24,
    brand_config: typeof row.brand_config === 'string' ? JSON.parse(row.brand_config) : (row.brand_config as Record<string, unknown>) || {},
    campaign_id: row.campaign_id as string | null,
    script: row.script as string | null,
    storyboard: typeof row.storyboard === 'string' ? JSON.parse(row.storyboard) : (row.storyboard as unknown[]) || [],
    voice_settings: typeof row.voice_settings === 'string' ? JSON.parse(row.voice_settings) : (row.voice_settings as Record<string, unknown>) || {},
    music_settings: typeof row.music_settings === 'string' ? JSON.parse(row.music_settings) : (row.music_settings as Record<string, unknown>) || {},
    caption_settings: typeof row.caption_settings === 'string' ? JSON.parse(row.caption_settings) : (row.caption_settings as Record<string, unknown>) || {},
    status: row.status as string,
    final_output_url: row.final_output_url as string | null,
    thumbnail_url: row.thumbnail_url as string | null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapSceneRow(row: Record<string, unknown>): VideoScene {
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    organization_id: row.organization_id as string,
    scene_number: parseInt(row.scene_number as string),
    title: row.title as string | null,
    narration: row.narration as string | null,
    dialogue: row.dialogue as string | null,
    visual_prompt: row.visual_prompt as string | null,
    negative_prompt: row.negative_prompt as string | null,
    model_id: row.model_id as string | null,
    duration_seconds: parseInt(row.duration_seconds as string) || 5,
    camera_instructions: row.camera_instructions as string | null,
    source_image_url: row.source_image_url as string | null,
    source_video_url: row.source_video_url as string | null,
    start_frame_url: row.start_frame_url as string | null,
    end_frame_url: row.end_frame_url as string | null,
    continuation_source_id: row.continuation_source_id as string | null,
    generated_clip_url: row.generated_clip_url as string | null,
    audio_clip_url: row.audio_clip_url as string | null,
    caption_text: row.caption_text as string | null,
    status: row.status as string,
    provider_job_id: row.provider_job_id as string | null,
    error_message: row.error_message as string | null,
    retry_count: parseInt(row.retry_count as string) || 0,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as Record<string, unknown>) || {},
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}
