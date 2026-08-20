import { Queue } from 'bullmq';
import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import * as genxRegistry from './genx-model-registry.service';
import * as genxPricing from './genx-pricing.service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const generationQueue = new Queue('studio-generations', { connection });
const stillMotionQueue = new Queue('longform-still-motion', { connection });

type ProductionMode = 'ai_video' | 'still_motion';

function objectValue(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  try { return JSON.parse(String(value)) as Record<string, any>; }
  catch { return {}; }
}

async function loadScene(sceneId: string, orgId: string) {
  const result = await query(
    `SELECT scene.*,project.id AS verified_project_id,project.metadata AS project_metadata
     FROM video_scenes scene
     JOIN video_projects project ON project.id = scene.project_id
     WHERE scene.id = $1 AND scene.organization_id = $2 AND project.organization_id = $2`,
    [sceneId, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Video scene');
  return result.rows[0];
}

function productionMode(scene: Record<string, any>): ProductionMode {
  const metadata = objectValue(scene.metadata);
  const projectMetadata = objectValue(scene.project_metadata);
  const explicit = String(metadata.production_mode || metadata.productionMode || '').toLowerCase();
  if (explicit === 'ai_video' || explicit === 'still_motion') return explicit;

  if (scene.source_video_url || scene.source_image_url || scene.continuation_source_id) return 'ai_video';
  if (metadata.force_ai_video === true) return 'ai_video';

  const strategy = String(projectMetadata.longform_strategy || projectMetadata.production_strategy || 'quality_hybrid').toLowerCase();
  if (strategy === 'cinematic' || strategy === 'all_video') return 'ai_video';
  if (strategy === 'economy' || strategy === 'still_motion') return 'still_motion';

  const sceneType = String(scene.scene_type || '').toLowerCase();
  const prompt = String(scene.visual_prompt || '').toLowerCase();
  const motionCriticalType = /(?:action|hero|cinematic|demonstration|demo|movement|transition)/.test(sceneType);
  const motionCriticalPrompt = /\b(?:running|gallop|galloping|jumping|racing|flying|driving|spinning|dancing|walking|moving|motion|camera move|tracking shot|drone|timelapse|slow motion|slow-motion|explosion|splash|pouring|opening|closing)\b/.test(prompt);
  const openingHero = Number(scene.scene_number || 0) <= 1;
  return openingHero || motionCriticalType || motionCriticalPrompt ? 'ai_video' : 'still_motion';
}

function operationFor(scene: Record<string, any>, mode: ProductionMode): string {
  if (mode === 'still_motion') return 'text_to_image';
  return scene.source_image_url || scene.start_frame_url ? 'image_to_video' : 'text_to_video';
}

async function resolveModel(scene: Record<string, any>, operation: string): Promise<{ id: string; estimatedCredits: number | null }> {
  if (scene.model_id) {
    const model = await genxRegistry.getModelById(scene.model_id);
    if (model && model.available !== false && (model.operations || []).includes(operation)) {
      const quote = await genxPricing.quoteGeneration({
        modelId: model.id,
        operation,
        quantity: operation.includes('video') ? Math.max(1, Number(scene.duration_seconds || 1)) : 1,
      });
      return { id: model.id, estimatedCredits: quote.reservation_credits };
    }
  }

  let models = await genxRegistry.getAvailableModels(operation);
  if (models.length === 0) {
    const live = await genxRegistry.fetchLiveModelCatalogue();
    await genxRegistry.syncModelsToDatabase(live);
    models = await genxRegistry.getAvailableModels(operation);
  }
  if (models.length === 0) throw new AppError(400, `No model available for ${operation}`, 'NO_MODEL');

  const quantity = operation.includes('video') ? Math.max(1, Number(scene.duration_seconds || 1)) : 1;
  const priced: Array<{ id: string; credits: number }> = [];
  for (const model of models) {
    try {
      const quote = await genxPricing.quoteGeneration({ modelId: model.id, operation, quantity });
      priced.push({ id: model.id, credits: quote.reservation_credits });
    } catch {
      // Fail closed for unpriced/stale models by excluding them from automatic selection.
    }
  }
  if (priced.length === 0) throw new AppError(503, `No priced runtime model available for ${operation}`, 'NO_PRICED_MODEL');
  priced.sort((left, right) => left.credits - right.credits || left.id.localeCompare(right.id));
  return { id: priced[0].id, estimatedCredits: priced[0].credits };
}

export async function enqueueSceneGeneration(sceneId: string, orgId: string) {
  const scene = await loadScene(sceneId, orgId);
  if (!scene.visual_prompt) throw new AppError(400, 'Scene requires a visual prompt', 'MISSING_PROMPT');
  if (['queued', 'generating'].includes(scene.status)) return scene;

  const mode = productionMode(scene);
  const operation = operationFor(scene, mode);
  const model = await resolveModel(scene, operation);
  const idempotencyKey = scene.idempotency_key || `scene:${sceneId}:${Number(scene.retry_count || 0)}:${mode}`;
  const queueJobId = `scene-${sceneId}-${Number(scene.retry_count || 0)}-${mode}`;
  const queue = mode === 'still_motion' ? stillMotionQueue : generationQueue;
  const job = await queue.add(
    mode === 'still_motion' ? 'longform-still-motion' : 'longform-scene',
    {
      kind: mode === 'still_motion' ? 'longform-still-motion' : 'longform-scene',
      sceneId,
      organizationId: orgId,
      projectId: scene.project_id,
      modelId: model.id,
      productionMode: mode,
    },
    {
      jobId: queueJobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    }
  );

  const updated = await query(
    `UPDATE video_scenes
     SET status='queued',model_id=$1,queue_job_id=$2,idempotency_key=$3,
         metadata=COALESCE(metadata,'{}'::jsonb) || $4::jsonb,
         error_message=NULL,cancellation_requested_at=NULL,submitted_at=NOW(),updated_at=NOW()
     WHERE id=$5 AND organization_id=$6 RETURNING *`,
    [
      model.id,
      String(job.id),
      idempotencyKey,
      JSON.stringify({
        production_mode: mode,
        production_operation: operation,
        model_selection: scene.model_id === model.id ? 'explicit_or_compatible' : 'lowest_priced_runtime_confirmed',
        estimated_reservation_credits: model.estimatedCredits,
        longform_cost_strategy: 'quality_hybrid',
      }),
      sceneId,
      orgId,
    ]
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
     WHERE project_id=$1 AND organization_id=$2
       AND status IN ('pending','failed','cancelled','pending_control')
       AND retry_count < 3
     ORDER BY scene_number`,
    [projectId, orgId]
  );
  const results = [];
  for (const scene of scenes.rows) results.push(await enqueueSceneGeneration(scene.id, orgId));
  await query(
    `UPDATE video_projects SET status=CASE WHEN $1 > 0 THEN 'generating' ELSE status END,updated_at=NOW()
     WHERE id=$2 AND organization_id=$3`,
    [results.length, projectId, orgId]
  );
  return { queued: results.length, scenes: results };
}

export async function cancelProjectGeneration(projectId: string, orgId: string) {
  const scenes = await query(
    `UPDATE video_scenes
     SET status='cancelled',cancellation_requested_at=NOW(),updated_at=NOW()
     WHERE project_id=$1 AND organization_id=$2 AND status IN ('queued','generating','pending_control')
     RETURNING id,queue_job_id`,
    [projectId, orgId]
  );
  for (const scene of scenes.rows) {
    if (!scene.queue_job_id) continue;
    for (const queue of [generationQueue, stillMotionQueue]) {
      const job = await queue.getJob(scene.queue_job_id);
      if (job && (await job.getState()) !== 'active') await job.remove().catch(() => undefined);
    }
  }
  await query(
    `UPDATE video_projects SET status='cancelled',updated_at=NOW()
     WHERE id=$1 AND organization_id=$2`,
    [projectId, orgId]
  );
  return { cancelled: scenes.rows.length };
}

export async function retryFailedScenes(projectId: string, orgId: string) {
  const failed = await query(
    `SELECT id FROM video_scenes
     WHERE project_id=$1 AND organization_id=$2 AND status IN ('failed','pending_control') AND retry_count < 3
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
       COUNT(*) FILTER (WHERE status='completed')::int AS completed_scenes,
       COUNT(*) FILTER (WHERE status IN ('queued','generating','pending_control'))::int AS active_scenes,
       COUNT(*) FILTER (WHERE status='failed')::int AS failed_scenes,
       COALESCE(SUM(duration_seconds),0)::int AS planned_duration,
       CASE WHEN COUNT(*)=0 THEN 0
            ELSE ROUND((COUNT(*) FILTER (WHERE status='completed')::numeric / COUNT(*)::numeric) * 100)::int
       END AS progress
     FROM video_scenes WHERE project_id=$1 AND organization_id=$2`,
    [projectId, orgId]
  );
  return result.rows[0];
}
