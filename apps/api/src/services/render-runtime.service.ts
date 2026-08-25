import { Queue } from 'bullmq';
import { query } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import * as studioService from './studio.service';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const renderQueue = new Queue('video-renders', { connection });

function objectValue(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : {};
  } catch {
    return {};
  }
}

function assetIdFromInternalUrl(value: unknown): string | null {
  const match = String(value || '').match(/^\/api\/v1\/studio\/assets\/([0-9a-f-]{36})(?:$|[?#/])/i);
  return match?.[1] || null;
}

async function verifyAudioAsset(
  assetId: string,
  orgId: string,
  role: 'voice' | 'music'
): Promise<{ id: string; url: string }> {
  const result = await query(
    `SELECT id,url,mime_type
     FROM studio_assets
     WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL
     LIMIT 1`,
    [assetId, orgId]
  );
  const asset = result.rows[0];
  if (!asset) {
    throw new AppError(409, `${role} audio asset is not available for this organization`, 'LONGFORM_AUDIO_ASSET_MISSING');
  }
  if (!String(asset.mime_type || '').toLowerCase().startsWith('audio/')) {
    throw new AppError(409, `${role} asset is not an audio file`, 'LONGFORM_AUDIO_ASSET_INVALID');
  }
  const url = String(asset.url || `/api/v1/studio/assets/${asset.id}`);
  return { id: String(asset.id), url };
}

async function reconcileAudioRole(
  project: Record<string, any>,
  orgId: string,
  role: 'voice' | 'music'
): Promise<void> {
  const field = role === 'voice' ? 'voice_settings' : 'music_settings';
  const settings = objectValue(project[field]);
  if (settings.enabled !== true) return;

  const configuredAssetId = String(settings.asset_id || assetIdFromInternalUrl(settings.asset_url) || '').trim();
  if (configuredAssetId) {
    const asset = await verifyAudioAsset(configuredAssetId, orgId, role);
    await query(
      `UPDATE video_projects
       SET ${field}=COALESCE(${field},'{}'::jsonb) || $1::jsonb,updated_at=NOW()
       WHERE id=$2 AND organization_id=$3`,
      [
        JSON.stringify({
          asset_id: asset.id,
          asset_url: asset.url,
          delivery_status: 'saved',
          generation_status: settings.generation_status || 'completed',
        }),
        project.id,
        orgId,
      ]
    );
    return;
  }

  const generationId = String(settings.generation_id || '').trim();
  if (!generationId) {
    throw new AppError(
      409,
      `${role} generation is enabled but no generated or organization-owned audio asset is configured`,
      'LONGFORM_AUDIO_NOT_READY'
    );
  }

  const generation = await studioService.getGeneration(generationId, orgId);
  if (['pending', 'queued', 'processing', 'pending_control'].includes(generation.status)) {
    throw new AppError(409, `${role} generation is not complete yet`, 'LONGFORM_AUDIO_NOT_READY');
  }
  if (['failed', 'cancelled'].includes(generation.status)) {
    throw new AppError(409, `${role} generation did not complete successfully`, 'LONGFORM_AUDIO_GENERATION_FAILED');
  }
  if (generation.status !== 'completed') {
    throw new AppError(409, `${role} generation is not in a renderable state`, 'LONGFORM_AUDIO_NOT_READY');
  }
  if (generation.delivery_status !== 'saved' || !generation.primary_output_url) {
    throw new AppError(
      409,
      `${role} generation completed but its durable Studio asset is not available`,
      'LONGFORM_AUDIO_DELIVERY_UNAVAILABLE'
    );
  }

  const metadata = objectValue(generation.metadata);
  const durableAssetId = String(
    metadata.studio_asset_id || assetIdFromInternalUrl(generation.primary_output_url) || ''
  ).trim();
  if (!durableAssetId) {
    throw new AppError(409, `${role} durable Studio asset ID is missing`, 'LONGFORM_AUDIO_DELIVERY_UNAVAILABLE');
  }
  const asset = await verifyAudioAsset(durableAssetId, orgId, role);

  await query(
    `UPDATE video_projects
     SET ${field}=COALESCE(${field},'{}'::jsonb) || $1::jsonb,updated_at=NOW()
     WHERE id=$2 AND organization_id=$3`,
    [
      JSON.stringify({
        generation_id: generation.id,
        generation_status: generation.status,
        provider_job_id: generation.provider_job_id,
        asset_id: asset.id,
        asset_url: asset.url,
        delivery_status: 'saved',
      }),
      project.id,
      orgId,
    ]
  );
}

async function reconcileProjectAudio(project: Record<string, any>, orgId: string): Promise<void> {
  await reconcileAudioRole(project, orgId, 'voice');
  await reconcileAudioRole(project, orgId, 'music');
}

async function ensureRenderQueued(
  render: Record<string, any>,
  projectId: string,
  orgId: string
) {
  if (!['pending', 'queued'].includes(String(render.status || ''))) return render;

  const jobId = String(render.queue_job_id || `render-${render.id}`);
  let job = await renderQueue.getJob(jobId);
  let created = false;

  if (!job) {
    job = await renderQueue.add(
      'render',
      { renderId: render.id, projectId, organizationId: orgId },
      {
        jobId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 15000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 604800 },
      }
    );
    created = true;
  }

  const updated = await query(
    `UPDATE video_renders SET status = 'queued', queue_job_id = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [String(job.id), render.id]
  );

  if (created) {
    await query(
      `INSERT INTO video_render_events (render_id, event_type, message)
       VALUES ($1, 'render_queued', 'Render queued')`,
      [render.id]
    );
  }

  return updated.rows[0];
}

export async function createRender(projectId: string, orgId: string, requestedIdempotencyKey?: string) {
  const projectResult = await query(
    'SELECT * FROM video_projects WHERE id = $1 AND organization_id = $2',
    [projectId, orgId]
  );
  if (projectResult.rows.length === 0) throw new NotFoundError('Video project');
  const project = projectResult.rows[0] as Record<string, any>;

  // Audio reconciliation deliberately happens before replay lookup or render-row
  // insertion. A render request therefore cannot create executable work until
  // every enabled generated audio track is a durable organization-owned asset.
  await reconcileProjectAudio(project, orgId);

  const idempotencyKey = String(requestedIdempotencyKey || `longform-project:${projectId}:render:v1`).trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 255) {
    throw new AppError(400, 'A valid render idempotency key is required', 'LONGFORM_RENDER_IDEMPOTENCY_INVALID');
  }

  const replay = await query(
    `SELECT * FROM video_renders
     WHERE project_id=$1 AND organization_id=$2 AND idempotency_key=$3
     LIMIT 1`,
    [projectId, orgId, idempotencyKey]
  );
  if (replay.rows.length > 0) return ensureRenderQueued(replay.rows[0], projectId, orgId);

  const active = await query(
    `SELECT * FROM video_renders
     WHERE project_id = $1 AND organization_id = $2 AND status IN ('pending','queued','processing')
     ORDER BY created_at DESC LIMIT 1`,
    [projectId, orgId]
  );
  if (active.rows.length > 0) return ensureRenderQueued(active.rows[0], projectId, orgId);

  const result = await query(
    `INSERT INTO video_renders (project_id, organization_id, status, progress, idempotency_key)
     VALUES ($1, $2, 'pending', 0, $3)
     ON CONFLICT (organization_id,project_id,idempotency_key)
       WHERE idempotency_key IS NOT NULL
     DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
     RETURNING *,(xmax=0) AS inserted`,
    [projectId, orgId, idempotencyKey]
  );
  return ensureRenderQueued(result.rows[0], projectId, orgId);
}

export async function getRender(id: string, orgId: string) {
  const result = await query(
    'SELECT * FROM video_renders WHERE id = $1 AND organization_id = $2',
    [id, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Render');
  return result.rows[0];
}

export async function listRenders(projectId: string, orgId: string) {
  const result = await query(
    `SELECT * FROM video_renders
     WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC`,
    [projectId, orgId]
  );
  return result.rows;
}

export async function cancelRender(id: string, orgId: string): Promise<void> {
  const render = await getRender(id, orgId);
  if (['completed','failed','cancelled'].includes(render.status)) {
    throw new AppError(400, 'Render is already in a terminal state', 'CANNOT_CANCEL');
  }
  const result = await query(
    `UPDATE video_renders
     SET status = 'cancelled', cancellation_requested_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING queue_job_id`,
    [id, orgId]
  );
  const queueJobId = result.rows[0]?.queue_job_id as string | null;
  if (queueJobId) {
    const job = await renderQueue.getJob(queueJobId);
    if (job && (await job.getState()) !== 'active') await job.remove().catch(() => undefined);
  }
  await query(
    `INSERT INTO video_render_events (render_id, event_type, message)
     VALUES ($1, 'render_cancelled', 'Render cancelled by user')`,
    [id]
  );
}

export async function getRenderEvents(renderId: string, orgId: string) {
  await getRender(renderId, orgId);
  const result = await query(
    'SELECT * FROM video_render_events WHERE render_id = $1 ORDER BY created_at ASC',
    [renderId]
  );
  return result.rows;
}
