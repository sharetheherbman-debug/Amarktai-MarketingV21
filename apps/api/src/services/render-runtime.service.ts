import { Queue } from 'bullmq';
import { query } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const renderQueue = new Queue('video-renders', { connection });

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
  const project = await query(
    'SELECT id FROM video_projects WHERE id = $1 AND organization_id = $2',
    [projectId, orgId]
  );
  if (project.rows.length === 0) throw new NotFoundError('Video project');

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
