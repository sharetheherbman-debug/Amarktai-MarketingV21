import { Queue } from 'bullmq';
import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import * as genxRegistry from './genx-model-registry.service';
import * as genxPricing from './genx-pricing.service';
import * as generationCredits from './generation-credit.service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const generationQueue = new Queue('studio-generations', { connection });
const stillMotionQueue = new Queue('longform-still-motion', { connection });

type ProductionMode = 'ai_video' | 'still_motion';
type ProductionStrategy = 'economy' | 'smart' | 'cinematic' | 'premium';

interface PlannedModel {
  id: string;
  estimatedCredits: number;
  retailChargeGbp: number;
  priceSnapshotId: string;
}

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

function strategyFor(scene: Record<string, any>): ProductionStrategy {
  const metadata = objectValue(scene.project_metadata);
  const raw = String(scene.production_strategy || metadata.production_strategy || metadata.longform_strategy || 'smart').toLowerCase();
  if (raw === 'economy' || raw === 'still_motion') return 'economy';
  if (raw === 'cinematic' || raw === 'all_video') return 'cinematic';
  if (raw === 'premium') return 'premium';
  return 'smart';
}

/** Production intent is durable. A generated source image is an asset, never an instruction to buy video. */
export function productionMode(scene: Record<string, any>): ProductionMode {
  const metadata = objectValue(scene.metadata);
  const explicit = String(scene.production_mode || metadata.production_mode || metadata.productionMode || '').toLowerCase();
  if (explicit === 'ai_video' || explicit === 'still_motion') return explicit;

  // Existing video/continuation sources imply video work. A source image does not:
  // the still-motion worker persists its paid image there for local-render retries.
  if (scene.source_video_url || scene.continuation_source_id) return 'ai_video';
  if (metadata.force_ai_video === true) return 'ai_video';

  const strategy = strategyFor(scene);
  if (strategy === 'economy') return 'still_motion';
  if (strategy === 'premium') return 'ai_video';

  const sceneType = String(scene.scene_type || '').toLowerCase();
  const prompt = String(scene.visual_prompt || '').toLowerCase();
  const motionCriticalType = /(?:action|hero|cinematic|demonstration|demo|movement|transition)/.test(sceneType);
  const motionCriticalPrompt = /\b(?:running|gallop|galloping|jumping|racing|flying|driving|spinning|dancing|walking|moving|motion|camera move|tracking shot|drone|timelapse|slow motion|slow-motion|explosion|splash|pouring|opening|closing)\b/.test(prompt);
  const openingHero = Number(scene.scene_number || 0) <= 1;
  if (strategy === 'cinematic') {
    return openingHero || Number(scene.scene_number || 0) % 2 === 0 || motionCriticalType || motionCriticalPrompt
      ? 'ai_video' : 'still_motion';
  }
  return openingHero || motionCriticalType || motionCriticalPrompt ? 'ai_video' : 'still_motion';
}

function operationFor(scene: Record<string, any>, mode: ProductionMode): string {
  if (mode === 'still_motion') return 'text_to_image';
  return scene.source_image_url || scene.start_frame_url ? 'image_to_video' : 'text_to_video';
}

async function resolveModel(scene: Record<string, any>, operation: string, quantityOverride?: number): Promise<PlannedModel> {
  const quantity = quantityOverride || (operation.includes('video') ? Math.max(1, Number(scene.duration_seconds || 1)) : 1);
  if (scene.model_id) {
    const model = await genxRegistry.getModelById(scene.model_id);
    if (model && model.available !== false && (model.operations || []).includes(operation)) {
      const quote = await genxPricing.quoteGeneration({
        modelId: model.id,
        operation,
        quantity,
      });
      return { id: model.id, estimatedCredits: quote.reservation_credits, retailChargeGbp: quote.retail_charge_gbp, priceSnapshotId: quote.price_snapshot_id };
    }
  }

  let models = await genxRegistry.getAvailableModels(operation);
  if (models.length === 0) {
    const live = await genxRegistry.fetchLiveModelCatalogue();
    await genxRegistry.syncModelsToDatabase(live);
    models = await genxRegistry.getAvailableModels(operation);
  }
  if (models.length === 0) throw new AppError(400, `No model available for ${operation}`, 'NO_MODEL');

  const priced: Array<PlannedModel & { runtimeConfirmed: boolean }> = [];
  for (const model of models) {
    try {
      const quote = await genxPricing.quoteGeneration({ modelId: model.id, operation, quantity });
      priced.push({
        id: model.id,
        estimatedCredits: quote.reservation_credits,
        retailChargeGbp: quote.retail_charge_gbp,
        priceSnapshotId: quote.price_snapshot_id,
        runtimeConfirmed: model.verification_status === 'runtime_confirmed',
      });
    } catch {
      // Fail closed for unpriced/stale models by excluding them from automatic selection.
    }
  }
  if (priced.length === 0) throw new AppError(503, `No priced runtime model available for ${operation}`, 'NO_PRICED_MODEL');
  priced.sort((left, right) => left.estimatedCredits - right.estimatedCredits || left.id.localeCompare(right.id));
  const strategy = strategyFor(scene);
  const verified = priced.filter((candidate) => candidate.runtimeConfirmed);
  const candidates = strategy === 'economy' || verified.length === 0 ? priced : verified;
  let index = 0;
  if (strategy === 'smart') index = Math.floor((candidates.length - 1) * 0.33);
  if (strategy === 'cinematic') index = operation.includes('video')
    ? Math.floor((candidates.length - 1) * 0.66)
    : Math.floor((candidates.length - 1) * 0.33);
  if (strategy === 'premium') index = candidates.length - 1;
  const selected = candidates[index];
  return {
    id: selected.id,
    estimatedCredits: selected.estimatedCredits,
    retailChargeGbp: selected.retailChargeGbp,
    priceSnapshotId: selected.priceSnapshotId,
  };
}

async function quoteOptionalAudio(
  settings: Record<string, any>,
  operation: 'text_to_speech' | 'music_generation',
  quantity: number,
  project: Record<string, any>
): Promise<PlannedModel | null> {
  if (settings.enabled !== true && !settings.model_id) return null;
  return resolveModel({ ...project, model_id: settings.model_id || null }, operation, quantity);
}

export async function quoteProjectGeneration(projectId: string, orgId: string) {
  const projectResult = await query(
    'SELECT * FROM video_projects WHERE id=$1 AND organization_id=$2',
    [projectId, orgId]
  );
  if (projectResult.rows.length === 0) throw new NotFoundError('Video project');
  const project = projectResult.rows[0] as Record<string, any>;
  const scenesResult = await query(
    `SELECT scene.*,project.metadata AS project_metadata,project.production_strategy
       FROM video_scenes scene JOIN video_projects project ON project.id=scene.project_id
      WHERE scene.project_id=$1 AND scene.organization_id=$2 ORDER BY scene.scene_number`,
    [projectId, orgId]
  );
  if (scenesResult.rows.length === 0) throw new AppError(400, 'Project requires at least one scene', 'LONGFORM_SCENES_REQUIRED');

  const plans: Array<Record<string, unknown>> = [];
  let imageCredits = 0;
  let videoCredits = 0;
  let visualRetailGbp = 0;
  for (const scene of scenesResult.rows as Array<Record<string, any>>) {
    if (!scene.visual_prompt) throw new AppError(400, `Scene ${scene.scene_number} requires a visual prompt`, 'MISSING_PROMPT');
    const mode = productionMode(scene);
    const operation = operationFor(scene, mode);
    const model = await resolveModel(scene, operation);
    if (mode === 'still_motion') imageCredits += model.estimatedCredits;
    else videoCredits += model.estimatedCredits;
    visualRetailGbp += model.retailChargeGbp;
    plans.push({
      scene_id: scene.id,
      scene_number: Number(scene.scene_number),
      duration_seconds: Number(scene.duration_seconds || 0),
      production_mode: mode,
      operation,
      model_id: model.id,
      estimated_credits: model.estimatedCredits,
      price_snapshot_id: model.priceSnapshotId,
      reuses_generated_still: mode === 'still_motion' && Boolean(scene.source_image_url && objectValue(scene.metadata).generated_still_asset === true),
    });
  }

  const duration = Math.max(1, Number(project.target_duration_seconds || 1));
  const voice = await quoteOptionalAudio(objectValue(project.voice_settings), 'text_to_speech', duration, project);
  const music = await quoteOptionalAudio(objectValue(project.music_settings), 'music_generation', duration, project);
  const narrationCredits = voice?.estimatedCredits || 0;
  const musicCredits = music?.estimatedCredits || 0;
  const totalCredits = imageCredits + videoCredits + narrationCredits + musicCredits;
  const maxProjectCredits = Number(project.max_project_credits || 0);
  const quote = {
    version: 1,
    project_id: projectId,
    strategy: strategyFor(project),
    scene_count: plans.length,
    planned_duration_seconds: plans.reduce((sum, plan) => sum + Number(plan.duration_seconds || 0), 0),
    still_motion_scenes: plans.filter((plan) => plan.production_mode === 'still_motion').length,
    ai_video_scenes: plans.filter((plan) => plan.production_mode === 'ai_video').length,
    image_generation_credits: imageCredits,
    ai_video_credits: videoCredits,
    narration_credits: narrationCredits,
    music_audio_credits: musicCredits,
    total_estimated_credits: totalCredits,
    approximate_billing_value: { currency: 'GBP', amount: Number((visualRetailGbp + (voice?.retailChargeGbp || 0) + (music?.retailChargeGbp || 0)).toFixed(4)) },
    maximum_allowed_project_credits: maxProjectCredits || null,
    within_budget: maxProjectCredits > 0 && totalCredits <= maxProjectCredits,
    scenes: plans,
    audio: { voice, music },
    quoted_at: new Date().toISOString(),
  };

  for (const plan of plans) {
    await query(
      `UPDATE video_scenes SET production_mode=$1,planned_operation=$2,model_id=$3,
        estimated_credits=$4,production_plan_locked_at=NOW(),updated_at=NOW()
       WHERE id=$5 AND organization_id=$6`,
      [plan.production_mode, plan.operation, plan.model_id, plan.estimated_credits, plan.scene_id, orgId]
    );
  }
  await query(
    `UPDATE video_projects SET cost_quote=$1::jsonb,cost_quote_created_at=NOW(),updated_at=NOW()
     WHERE id=$2 AND organization_id=$3`,
    [JSON.stringify(quote), projectId, orgId]
  );
  return quote;
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
         production_mode=$4,planned_operation=$5,estimated_credits=$6,
         production_plan_locked_at=COALESCE(production_plan_locked_at,NOW()),
         metadata=COALESCE(metadata,'{}'::jsonb) || $7::jsonb,
         error_message=NULL,cancellation_requested_at=NULL,submitted_at=NOW(),updated_at=NOW()
     WHERE id=$8 AND organization_id=$9 RETURNING *`,
    [
      model.id,
      String(job.id),
      idempotencyKey,
      mode,
      operation,
      model.estimatedCredits,
      JSON.stringify({
        production_mode: mode,
        production_operation: operation,
        model_selection: scene.model_id === model.id ? 'explicit_or_compatible' : 'lowest_priced_runtime_confirmed',
        estimated_reservation_credits: model.estimatedCredits,
        longform_cost_strategy: strategyFor(scene),
      }),
      sceneId,
      orgId,
    ]
  );
  return updated.rows[0];
}

export async function enqueueProjectGeneration(projectId: string, orgId: string) {
  const project = await query('SELECT * FROM video_projects WHERE id=$1 AND organization_id=$2', [projectId, orgId]);
  if (project.rows.length === 0) throw new NotFoundError('Video project');
  const quote = await quoteProjectGeneration(projectId, orgId);
  const budget = Number(project.rows[0].max_project_credits || 0);
  if (budget <= 0) throw new AppError(409, 'Set an explicit maximum project credit budget before generation', 'LONGFORM_BUDGET_REQUIRED');
  if (quote.total_estimated_credits > budget) {
    throw new AppError(409, `Project quote of ${quote.total_estimated_credits} credits exceeds the ${budget} credit budget`, 'LONGFORM_BUDGET_EXCEEDED');
  }
  const wallet = await generationCredits.getWallet(orgId);
  if (wallet.available_credits < quote.total_estimated_credits) {
    throw new AppError(402, 'Generation Credit wallet cannot cover the project estimate', 'INSUFFICIENT_GENERATION_CREDITS');
  }
  const safety = await query('SELECT emergency_stop FROM relaunch_control_policies WHERE organization_id=$1', [orgId]);
  if (safety.rows[0]?.emergency_stop === true) {
    throw new AppError(409, 'Emergency Stop is active', 'EMERGENCY_STOP_ACTIVE');
  }

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
