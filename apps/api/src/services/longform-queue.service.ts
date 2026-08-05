import { Queue } from 'bullmq';
import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import * as genxRegistry from './genx-model-registry.service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const generationQueue = new Queue('studio-generations', { connection });

async function loadScene(sceneId: string, orgId: string) {
  const result = await query(
    `SELECT scene.*, project.id AS verified_project_id
     FROM video_scenes scene
     JOIN video_projects project ON project.id = scene.project_id
     WHERE scene.id = $1 AND scene.organization_id = $2 AND project.organization_id = $2`,
    [sceneId, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Video scene');
  return result.rows[0];
}

async function resolveModel(scene: Record<string, any>) {
  const operation = scene.source_image_url || scene.start_frame_url ? 'image_to_video' : 'text_to_video';
  if (scene.model_id) {
    const model = await genxRegistry.getModelById(scene.model_id);
    if (!model || model.available === false || !(model.operations || []).includes(operation)) {
      throw new AppError(400, `Selected model does not support ${operation}`, 'MODEL_UNAVAILABLE');
    }
    return model.id;
  }
  let models = await genxRegistry.getAvailableModels(operation);
  if (models.length === 0) {
    const live = await genxRegistry.fetchLiveModelCatalogue();
    await genxRegistry.syncModelsToDatabase(live);
    models = await genxRegistry.getAvailableModels(operation);
  }
  if (models.length === 0) throw new AppError(400, `No model available for ${operation}`, 'NO_MODEL');
  return models[0].id;
}

export async function enqueueSceneGeneration(sceneId: string, orgId: string) {
  const scene = await loadScene(sceneId, orgId);
  if (!scene.visual_prompt) throw new AppError(400, 'Scene requires a visual prompt', 'MISSING_PROMPT');
  if (['queued', 'generating'].includes(scene.status)) return scene;

  const modelId = await resolveModel(scene);
  const idempotencyKey = scene.idempotency_key || `scene:${sceneId}:${Number(scene.retry_count || 0)}`;
  const job = await generationQueue.add(
    'longform-scene',
    {
      kind: 'longform-scene',
      sceneId,
      organizationId: orgId,
      projectId: scene.project_id,
      modelId,
    },
    {
      jobId: idempotencyKey,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    }
  );

  const updated = await query(
    `UPDATE video_scenes
     SET status = 'queued', model_id = $1, queue_job_id = $2,
         idempotency_key = $3, error_message = NULL,
         cancellation_requested_at = NULL, submitted_at = NOW(), updated_at = NOW()
     WHERE id = $4 AND organization_id = $5 RETURNING *`,
    [modelId, String(job.id), idempotencyKey, sceneId, orgId]
  );
  return updated.rows[0];
}

export async function enqueueProjectGeneration(projectId: string, orgId: string) {
  const project = await query(
    'SELECT id FROM video_projects WHERE id = $1 AND organization_id = $2',
    [projectId, orgId]
  );
  if (project.rows.length === 0) throw new NotFoundError('Video project');

  const scenes = await query(
    `SELECT id FROM video_scenes
     WHERE project_id = $1 AND organization_id = $2
       AND status IN ('pending','failed','cancelled')
       AND retry_count < 3
     ORDER BY scene_number`,
    [projectId, orgId]
  );
  const results = [];
  for (const scene of scenes.rows) results.push(await enqueueSceneGeneration(scene.id, orgId));
  await query(
    `UPDATE video_projects SET status = CASE WHEN $1 > 0 THEN 'generating' ELSE status END, updated_at = NOW()
     WHERE id = $2 AND organization_id = $3`,
    [results.length, projectId, orgId]
  );
  return { queued: results.length, scenes: results };
}

export async function cancelProjectGeneration(projectId: string, orgId: string) {
  const scenes = await query(
    `UPDATE video_scenes
     SET status = 'cancelled', cancellation_requested_at = NOW(), updated_at = NOW()
     WHERE project_id = $1 AND organization_id = $2 AND status IN ('queued','generating')
     RETURNING id, queue_job_id`,
    [projectId, orgId]
  );
  for (const scene of scenes.rows) {
    if (!scene.queue_job_id) continue;
    const job = await generationQueue.getJob(scene.queue_job_id);
    if (job && (await job.getState()) !== 'active') await job.remove().catch(() => undefined);
  }
  await query(
    `UPDATE video_projects SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [projectId, orgId]
  );
  return { cancelled: scenes.rows.length };
}

export async function retryFailedScenes(projectId: string, orgId: string) {
  const failed = await query(
    `SELECT id FROM video_scenes
     WHERE project_id = $1 AND organization_id = $2 AND status = 'failed' AND retry_count < 3
     ORDER BY scene_number`,
    [projectId, orgId]
  );
  const results = [];
  for (const scene of failed.rows) results.push(await enqueueSceneGeneration(scene.id, orgId));
  return { queued: results.length };
}

export async function getProjectProgress(projectId: string, orgId: string) {
  const result = await query(
    `SELECT
       COUNT(*)::int AS total_scenes,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_scenes,
       COUNT(*) FILTER (WHERE status IN ('queued','generating'))::int AS active_scenes,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_scenes,
       COALESCE(SUM(duration_seconds), 0)::int AS planned_duration,
       CASE WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / COUNT(*)::numeric) * 100)::int
       END AS progress
     FROM video_scenes WHERE project_id = $1 AND organization_id = $2`,
    [projectId, orgId]
  );
  return result.rows[0];
}
