import { Queue } from 'bullmq';
import { query } from '../config/database';
import { NotFoundError, AppError } from '../middleware/errorHandler';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const renderQueue = new Queue('video-renders', { connection });

export async function createRender(projectId: string, orgId: string) {
  const project = await query(
    'SELECT id FROM video_projects WHERE id = $1 AND organization_id = $2',
    [projectId, orgId]
  );
  if (project.rows.length === 0) throw new NotFoundError('Video project');

  const active = await query(
    `SELECT * FROM video_renders
     WHERE project_id = $1 AND organization_id = $2 AND status IN ('pending','queued','processing')
     ORDER BY created_at DESC LIMIT 1`,
    [projectId, orgId]
  );
  if (active.rows.length > 0) return active.rows[0];

  const result = await query(
    `INSERT INTO video_renders (project_id, organization_id, status, progress)
     VALUES ($1, $2, 'pending', 0) RETURNING *`,
    [projectId, orgId]
  );
  const render = result.rows[0];
  const job = await renderQueue.add(
    'render',
    { renderId: render.id, projectId, organizationId: orgId },
    {
      jobId: `render:${render.id}`,
      attempts: 2,
      backoff: { type: 'exponential', delay: 15000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    }
  );
  const updated = await query(
    `UPDATE video_renders SET status = 'queued', queue_job_id = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [String(job.id), render.id]
  );
  await query(
    `INSERT INTO video_render_events (render_id, event_type, message)
     VALUES ($1, 'render_queued', 'Render queued')`,
    [render.id]
  );
  return updated.rows[0];
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
    if (job && !(await job.isActive())) await job.remove().catch(() => undefined);
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
