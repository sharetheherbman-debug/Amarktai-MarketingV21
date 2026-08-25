import { Queue } from 'bullmq';
import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import * as genxRegistry from './genx-model-registry.service';
import * as genxPricing from './genx-pricing.service';
import * as generationCredits from './generation-credit.service';
import * as studioService from './studio.service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const generationQueue = new Queue('studio-generations', { connection });
const stillMotionQueue = new Queue('longform-still-motion', { connection });

type ProductionMode = 'ai_video' | 'still_motion';
type ProductionStrategy = 'economy' | 'smart' | 'cinematic' | 'premium';
type AudioOperation = 'text_to_speech' | 'music_generation';

interface PlannedModel {
  id: string;
  estimatedCredits: number;
  retailChargeGbp: number;
  priceSnapshotId: string;
  pricingLastSyncedAt: string;
  billingQuantity?: number;
  billableUnit?: string;
}

interface AudioPlan extends PlannedModel {
  billingQuantity: number;
  billableUnit: string;
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
    if (
      model &&
      model.available !== false &&
      model.verification_status !== 'failed' &&
      (model.operations || []).includes(operation)
    ) {
      const quote = await genxPricing.quoteGeneration({
        modelId: model.id,
        operation,
        quantity,
      });
      return {
        id: model.id,
        estimatedCredits: quote.reservation_credits,
        retailChargeGbp: quote.retail_charge_gbp,
        priceSnapshotId: quote.price_snapshot_id,
        pricingLastSyncedAt: quote.pricing_last_synced_at,
      };
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
    if (model.verification_status === 'failed') continue;
    try {
      const quote = await genxPricing.quoteGeneration({ modelId: model.id, operation, quantity });
      priced.push({
        id: model.id,
        estimatedCredits: quote.reservation_credits,
        retailChargeGbp: quote.retail_charge_gbp,
        priceSnapshotId: quote.price_snapshot_id,
        pricingLastSyncedAt: quote.pricing_last_synced_at,
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
    pricingLastSyncedAt: selected.pricingLastSyncedAt,
  };
}

function characterQuantityForBillingUnit(characters: number, billableUnit: string): number {
  const normalized = billableUnit.trim().toLowerCase();
  if (!Number.isFinite(characters) || characters <= 0) {
    throw new AppError(400, 'Narration text is required for text-to-speech', 'LONGFORM_NARRATION_TEXT_REQUIRED');
  }
  if (normalized === 'character') return characters;
  if (normalized === 'thousand_characters' || normalized === '1k_characters') return characters / 1_000;
  if (normalized === 'million_characters' || normalized === '1m_characters') return characters / 1_000_000;
  if (normalized === 'request' || normalized.endsWith('_requests')) return 1;
  const explicit = normalized.match(/^(\d+)_characters$/);
  if (explicit) return characters / Number(explicit[1]);
  throw new AppError(503, `Unsupported voice billing unit: ${billableUnit}`, 'GENX_VOICE_BILLING_UNIT_UNSUPPORTED');
}

async function currentBillableUnit(modelId: string, operation: AudioOperation): Promise<string> {
  const result = await query(
    `SELECT billable_unit
     FROM genx_price_snapshots
     WHERE model_id=$1 AND operation=$2 AND effective_to IS NULL
     ORDER BY effective_from DESC
     LIMIT 1`,
    [modelId, operation]
  );
  const unit = String(result.rows[0]?.billable_unit || '');
  if (!unit) throw new AppError(503, `No active price for ${modelId}/${operation}`, 'NO_PRICED_MODEL');
  return unit;
}

async function refreshAudioCatalogueAndPricing(): Promise<void> {
  const live = await genxRegistry.fetchLiveModelCatalogue();
  if (live.length === 0) throw new AppError(503, 'Amarktai Network catalogue is unavailable', 'GENX_CATALOGUE_UNAVAILABLE');
  await genxRegistry.syncModelsToDatabase(live);
  await genxPricing.syncPricingFromModels(
    live.filter((model) => ['voice', 'audio'].includes(String(model.category || '').toLowerCase()))
  );
}

async function resolveAudioModel(
  settings: Record<string, any>,
  operation: AudioOperation,
  rawQuantity: number,
  project: Record<string, any>
): Promise<AudioPlan | null> {
  if (settings.enabled !== true && !settings.model_id) return null;

  let models = await genxRegistry.getAvailableModels(operation);
  if (models.length === 0 || (settings.model_id && !models.some((model) => model.id === settings.model_id))) {
    await refreshAudioCatalogueAndPricing();
    models = await genxRegistry.getAvailableModels(operation);
  }

  if (settings.model_id) {
    models = models.filter((model) => model.id === settings.model_id);
    if (models.length === 0) {
      throw new AppError(400, `Selected model does not support ${operation}`, 'MODEL_OPERATION_UNSUPPORTED');
    }
  }
  if (models.length === 0) throw new AppError(400, `No model available for ${operation}`, 'NO_MODEL');

  const priced: Array<AudioPlan & { runtimeConfirmed: boolean }> = [];
  for (const model of models) {
    if (model.available === false || model.deprecated === true || model.verification_status === 'failed') continue;
    try {
      const billableUnit = await currentBillableUnit(model.id, operation);
      const billingQuantity = operation === 'text_to_speech'
        ? characterQuantityForBillingUnit(rawQuantity, billableUnit)
        : 1;
      const quote = await genxPricing.quoteGeneration({
        modelId: model.id,
        operation,
        quantity: billingQuantity,
      });
      priced.push({
        id: model.id,
        estimatedCredits: quote.reservation_credits,
        retailChargeGbp: quote.retail_charge_gbp,
        priceSnapshotId: quote.price_snapshot_id,
        pricingLastSyncedAt: quote.pricing_last_synced_at,
        billingQuantity,
        billableUnit: quote.billable_unit,
        runtimeConfirmed: model.verification_status === 'runtime_confirmed',
      });
    } catch {
      // Fail closed: automatic long-form audio never selects stale/unpriced models.
    }
  }

  if (priced.length === 0) {
    await refreshAudioCatalogueAndPricing();
    const refreshed = await genxRegistry.getAvailableModels(operation);
    for (const model of refreshed) {
      if (settings.model_id && model.id !== settings.model_id) continue;
      if (model.available === false || model.deprecated === true || model.verification_status === 'failed') continue;
      try {
        const billableUnit = await currentBillableUnit(model.id, operation);
        const billingQuantity = operation === 'text_to_speech'
          ? characterQuantityForBillingUnit(rawQuantity, billableUnit)
          : 1;
        const quote = await genxPricing.quoteGeneration({ modelId: model.id, operation, quantity: billingQuantity });
        priced.push({
          id: model.id,
          estimatedCredits: quote.reservation_credits,
          retailChargeGbp: quote.retail_charge_gbp,
          priceSnapshotId: quote.price_snapshot_id,
          pricingLastSyncedAt: quote.pricing_last_synced_at,
          billingQuantity,
          billableUnit: quote.billable_unit,
          runtimeConfirmed: model.verification_status === 'runtime_confirmed',
        });
      } catch {
        // Continue to next candidate.
      }
    }
  }

  if (priced.length === 0) throw new AppError(503, `No priced runtime model available for ${operation}`, 'NO_PRICED_MODEL');
  priced.sort((left, right) => left.estimatedCredits - right.estimatedCredits || left.id.localeCompare(right.id));
  if (settings.model_id) return priced[0];

  const verified = priced.filter((candidate) => candidate.runtimeConfirmed);
  const candidates = verified.length > 0 ? verified : priced;
  const strategy = strategyFor(project);
  let index = 0;
  if (strategy === 'smart') index = Math.floor((candidates.length - 1) * 0.33);
  if (strategy === 'cinematic') index = Math.floor((candidates.length - 1) * 0.66);
  if (strategy === 'premium') index = candidates.length - 1;
  return candidates[index];
}

function narrationText(project: Record<string, any>, scenes: Array<Record<string, any>>): string {
  const settings = objectValue(project.voice_settings);
  const explicit = String(settings.text || '').trim();
  if (explicit) return explicit;
  const script = String(project.script || '').trim();
  if (script) return script;
  return scenes
    .map((scene) => String(scene.narration || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function musicPrompt(project: Record<string, any>): string {
  return String(objectValue(project.music_settings).prompt || '').trim();
}

function providerOptionsForVoice(modelId: string, settings: Record<string, any>, billingQuantity: number): Record<string, unknown> {
  if (modelId === 'aura-2') {
    return {
      quantity: billingQuantity,
      voice: String(settings.voice || settings.voice_id || 'aura-2-thalia-en'),
    };
  }
  if (modelId === 'grok-tts') {
    return {
      quantity: billingQuantity,
      language: String(settings.language || 'en'),
      format: String(settings.format || 'mp3'),
    };
  }
  return { quantity: billingQuantity };
}

async function enqueueAudioStudioGeneration(input: {
  project: Record<string, any>;
  orgId: string;
  role: 'voice' | 'music';
  operation: AudioOperation;
  model: AudioPlan;
  prompt: string;
  settings: Record<string, any>;
  idempotencyKey: string;
}): Promise<{ generationId: string; queueJobId: string | null; replayed: boolean }> {
  const existing = await query(
    `SELECT id,queue_job_id,status
     FROM studio_generations
     WHERE organization_id=$1 AND idempotency_key=$2
     LIMIT 1`,
    [input.orgId, input.idempotencyKey]
  );
  if (existing.rows[0]) {
    return {
      generationId: String(existing.rows[0].id),
      queueJobId: existing.rows[0].queue_job_id ? String(existing.rows[0].queue_job_id) : null,
      replayed: true,
    };
  }

  const providerOptions = input.role === 'voice'
    ? providerOptionsForVoice(input.model.id, input.settings, input.model.billingQuantity)
    : { quantity: input.model.billingQuantity };

  const inserted = await query(
    `INSERT INTO studio_generations (
       organization_id,user_id,type,model,prompt,options,provider,status,idempotency_key,metadata
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,'genx','pending',$7,$8::jsonb)
     ON CONFLICT (organization_id,idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.orgId,
      input.project.owner_id,
      input.operation,
      input.model.id,
      input.prompt,
      JSON.stringify(providerOptions),
      input.idempotencyKey,
      JSON.stringify({
        longform_project_id: input.project.id,
        longform_audio_role: input.role,
        billing_quantity: input.model.billingQuantity,
        billable_unit: input.model.billableUnit,
        estimated_reservation_credits: input.model.estimatedCredits,
        price_snapshot_id: input.model.priceSnapshotId,
      }),
    ]
  );

  let generationId = String(inserted.rows[0]?.id || '');
  if (!generationId) {
    const replay = await query(
      `SELECT id,queue_job_id FROM studio_generations
       WHERE organization_id=$1 AND idempotency_key=$2 LIMIT 1`,
      [input.orgId, input.idempotencyKey]
    );
    if (!replay.rows[0]) throw new Error('Long-form audio idempotency row could not be resolved');
    return {
      generationId: String(replay.rows[0].id),
      queueJobId: replay.rows[0].queue_job_id ? String(replay.rows[0].queue_job_id) : null,
      replayed: true,
    };
  }

  const jobId = `studio-${generationId}`;
  try {
    const job = await generationQueue.add(
      'studio-generate',
      {
        kind: 'studio',
        generationId,
        organizationId: input.orgId,
        userId: input.project.owner_id,
        type: input.operation,
        modelId: input.model.id,
        prompt: input.prompt,
        options: providerOptions,
      },
      {
        jobId,
        attempts: 1,
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      }
    );
    await query(
      `UPDATE studio_generations SET queue_job_id=$1,updated_at=NOW()
       WHERE id=$2 AND organization_id=$3`,
      [String(job.id), generationId, input.orgId]
    );
  } catch (error) {
    await query(
      `UPDATE studio_generations
       SET status='failed',error_code='queue_submission_failed',error_message=$1,completed_at=NOW(),updated_at=NOW()
       WHERE id=$2 AND organization_id=$3 AND provider_job_id IS NULL`,
      [error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000), generationId, input.orgId]
    ).catch(() => undefined);
    throw error;
  }

  const field = input.role === 'voice' ? 'voice_settings' : 'music_settings';
  await query(
    `UPDATE video_projects
     SET ${field}=COALESCE(${field},'{}'::jsonb) || $1::jsonb,updated_at=NOW()
     WHERE id=$2 AND organization_id=$3`,
    [
      JSON.stringify({
        enabled: true,
        model_id: input.model.id,
        generation_id: generationId,
        generation_status: 'queued',
        provider_job_id: null,
        asset_id: null,
        asset_url: null,
        estimated_credits: input.model.estimatedCredits,
        billing_quantity: input.model.billingQuantity,
        billable_unit: input.model.billableUnit,
      }),
      input.project.id,
      input.orgId,
    ]
  );

  return { generationId, queueJobId: jobId, replayed: false };
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

  const scenes = scenesResult.rows as Array<Record<string, any>>;
  const plans: Array<Record<string, unknown>> = [];
  let imageCredits = 0;
  let videoCredits = 0;
  let visualRetailGbp = 0;
  for (const scene of scenes) {
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
      pricing_last_synced_at: model.pricingLastSyncedAt,
      reuses_generated_still: mode === 'still_motion' && Boolean(scene.source_image_url && objectValue(scene.metadata).generated_still_asset === true),
    });
  }

  const voiceSettings = objectValue(project.voice_settings);
  const musicSettings = objectValue(project.music_settings);
  const narration = narrationText(project, scenes);
  const musicText = musicPrompt(project);
  if (voiceSettings.enabled === true && !narration) {
    throw new AppError(400, 'Voice generation requires project script, voice_settings.text, or scene narration', 'LONGFORM_NARRATION_TEXT_REQUIRED');
  }
  if (musicSettings.enabled === true && !musicText) {
    throw new AppError(400, 'Music generation requires music_settings.prompt', 'LONGFORM_MUSIC_PROMPT_REQUIRED');
  }

  const voice = await resolveAudioModel(voiceSettings, 'text_to_speech', Math.max(1, narration.length), project);
  const music = await resolveAudioModel(musicSettings, 'music_generation', 1, project);
  const narrationCredits = voice?.estimatedCredits || 0;
  const musicCredits = music?.estimatedCredits || 0;
  const totalCredits = imageCredits + videoCredits + narrationCredits + musicCredits;
  const maxProjectCredits = Number(project.max_project_credits || 0);
  const quote = {
    version: 2,
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
    audio: {
      voice: voice ? {
        ...voice,
        input_characters: narration.length,
      } : null,
      music: music ? {
        ...music,
        request_count: 1,
      } : null,
    },
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

export async function enqueueProjectGeneration(projectId: string, orgId: string, requestedIdempotencyKey?: string) {
  const projectResult = await query('SELECT * FROM video_projects WHERE id=$1 AND organization_id=$2', [projectId, orgId]);
  if (projectResult.rows.length === 0) throw new NotFoundError('Video project');
  const project = projectResult.rows[0] as Record<string, any>;
  const idempotencyKey = String(requestedIdempotencyKey || `longform-project:${projectId}:generation:v1`).trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 255) {
    throw new AppError(400, 'A valid project generation idempotency key is required', 'LONGFORM_IDEMPOTENCY_INVALID');
  }
  const claimed = await query(
    `UPDATE video_projects SET generation_idempotency_key=COALESCE(generation_idempotency_key,$1),updated_at=NOW()
     WHERE id=$2 AND organization_id=$3
       AND (generation_idempotency_key IS NULL OR generation_idempotency_key=$1)
     RETURNING generation_idempotency_key`,
    [idempotencyKey, projectId, orgId]
  );
  if (claimed.rows.length === 0) {
    throw new AppError(409, 'Project generation already used a different idempotency key', 'LONGFORM_IDEMPOTENCY_CONFLICT');
  }
  const quote = await quoteProjectGeneration(projectId, orgId);
  const budget = Number(project.max_project_credits || 0);
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

  const currentProject = (await query('SELECT * FROM video_projects WHERE id=$1 AND organization_id=$2', [projectId, orgId])).rows[0] as Record<string, any>;
  const currentScenes = (await query(
    'SELECT * FROM video_scenes WHERE project_id=$1 AND organization_id=$2 ORDER BY scene_number',
    [projectId, orgId]
  )).rows as Array<Record<string, any>>;
  const audioResults: Array<Record<string, unknown>> = [];

  const voiceSettings = objectValue(currentProject.voice_settings);
  const voicePlan = quote.audio.voice as (AudioPlan & { input_characters: number }) | null;
  if (voiceSettings.enabled === true && voicePlan) {
    const text = narrationText(currentProject, currentScenes);
    const queued = await enqueueAudioStudioGeneration({
      project: currentProject,
      orgId,
      role: 'voice',
      operation: 'text_to_speech',
      model: voicePlan,
      prompt: text,
      settings: voiceSettings,
      idempotencyKey: `${idempotencyKey}:voice`,
    });
    audioResults.push({ role: 'voice', model_id: voicePlan.id, ...queued });
  }

  const musicSettings = objectValue(currentProject.music_settings);
  const musicPlan = quote.audio.music as (AudioPlan & { request_count: number }) | null;
  if (musicSettings.enabled === true && musicPlan) {
    const queued = await enqueueAudioStudioGeneration({
      project: currentProject,
      orgId,
      role: 'music',
      operation: 'music_generation',
      model: musicPlan,
      prompt: musicPrompt(currentProject),
      settings: musicSettings,
      idempotencyKey: `${idempotencyKey}:music`,
    });
    audioResults.push({ role: 'music', model_id: musicPlan.id, ...queued });
  }

  const newlyQueuedAudio = audioResults.filter((item) => item.replayed !== true).length;
  const newlyQueued = results.length + newlyQueuedAudio;
  await query(
    `UPDATE video_projects SET status=CASE WHEN $1 > 0 THEN 'generating' ELSE status END,updated_at=NOW()
     WHERE id=$2 AND organization_id=$3`,
    [newlyQueued, projectId, orgId]
  );
  return {
    queued: newlyQueued,
    scene_queued: results.length,
    audio_queued: newlyQueuedAudio,
    scenes: results,
    audio: audioResults,
    idempotency_key: idempotencyKey,
    replayed: newlyQueued === 0,
  };
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

  const project = await query(
    'SELECT voice_settings,music_settings FROM video_projects WHERE id=$1 AND organization_id=$2',
    [projectId, orgId]
  );
  const audioGenerationIds = [
    objectValue(project.rows[0]?.voice_settings).generation_id,
    objectValue(project.rows[0]?.music_settings).generation_id,
  ].map(String).filter((value) => value && value !== 'undefined');
  for (const generationId of audioGenerationIds) {
    await studioService.cancelGeneration(generationId, orgId).catch(() => undefined);
  }

  await query(
    `UPDATE video_projects SET status='cancelled',updated_at=NOW()
     WHERE id=$1 AND organization_id=$2`,
    [projectId, orgId]
  );
  return { cancelled: scenes.rows.length, audio_cancelled: audioGenerationIds.length };
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

  const project = await query(
    'SELECT voice_settings,music_settings FROM video_projects WHERE id=$1 AND organization_id=$2',
    [projectId, orgId]
  );
  const audio: Record<string, unknown> = {};
  for (const [role, raw] of [
    ['voice', project.rows[0]?.voice_settings],
    ['music', project.rows[0]?.music_settings],
  ] as Array<[string, unknown]>) {
    const settings = objectValue(raw);
    if (settings.enabled !== true || !settings.generation_id) {
      audio[role] = { enabled: settings.enabled === true, status: settings.asset_id || settings.asset_url ? 'ready' : 'disabled' };
      continue;
    }
    try {
      const generation = await studioService.getGeneration(String(settings.generation_id), orgId);
      audio[role] = {
        enabled: true,
        generation_id: generation.id,
        status: generation.status,
        delivery_status: generation.delivery_status,
        provider_job_id: generation.provider_job_id,
        asset_url: generation.primary_output_url,
      };
    } catch {
      audio[role] = { enabled: true, generation_id: settings.generation_id, status: 'unavailable' };
    }
  }
  return { ...result.rows[0], audio };
}
