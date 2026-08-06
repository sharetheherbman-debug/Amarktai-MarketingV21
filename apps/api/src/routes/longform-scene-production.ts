import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { query, transaction } from '../config/database';
import type { ApiResponse } from '../types';

const router = Router();
router.use(requireAuth);

const SCENE_FIELDS = new Map<string, { column: string; json?: boolean }>([
  ['scene_number', { column: 'scene_number' }],
  ['title', { column: 'title' }],
  ['narration', { column: 'narration' }],
  ['dialogue', { column: 'dialogue' }],
  ['visual_prompt', { column: 'visual_prompt' }],
  ['negative_prompt', { column: 'negative_prompt' }],
  ['model_id', { column: 'model_id' }],
  ['duration_seconds', { column: 'duration_seconds' }],
  ['camera_instructions', { column: 'camera_instructions' }],
  ['source_image_url', { column: 'source_image_url' }],
  ['source_video_url', { column: 'source_video_url' }],
  ['start_frame_url', { column: 'start_frame_url' }],
  ['end_frame_url', { column: 'end_frame_url' }],
  ['continuation_source_id', { column: 'continuation_source_id' }],
  ['generated_clip_url', { column: 'generated_clip_url' }],
  ['audio_clip_url', { column: 'audio_clip_url' }],
  ['caption_text', { column: 'caption_text' }],
  ['status', { column: 'status' }],
  ['provider_job_id', { column: 'provider_job_id' }],
  ['metadata', { column: 'metadata', json: true }],
]);

async function authorize(req: AuthRequest) {
  const organizationId = String(req.body?.organization_id || '');
  if (!organizationId) return { status: 400, error: 'organization_id required', organizationId };
  const membership = await query(
    'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [organizationId, req.user!.userId]
  );
  if (membership.rows.length === 0) {
    return { status: 403, error: 'Not a member of this organization', organizationId };
  }
  return { status: 200, organizationId };
}

function fail(res: Response<ApiResponse>, status: number, message: string) {
  return res.status(status).json({
    success: false,
    error: { message, code: status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST' },
  });
}

router.post('/projects/:id/storyboard/apply', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const auth = await authorize(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    const storyboard = Array.isArray(req.body.storyboard) ? req.body.storyboard : [];
    if (storyboard.length === 0) return fail(res, 400, 'storyboard must contain at least one scene');

    const project = await query(
      'SELECT id FROM video_projects WHERE id = $1 AND organization_id = $2',
      [req.params.id, auth.organizationId]
    );
    if (!project.rows[0]) return fail(res, 404, 'Video project not found');

    const scenes = await transaction(async (client) => {
      await client.query(
        'DELETE FROM video_scenes WHERE project_id = $1 AND organization_id = $2',
        [req.params.id, auth.organizationId]
      );
      const inserted: Record<string, unknown>[] = [];
      for (let index = 0; index < storyboard.length; index += 1) {
        const scene = storyboard[index] || {};
        const result = await client.query(
          `INSERT INTO video_scenes (
             project_id, organization_id, scene_number, title, narration, dialogue,
             visual_prompt, negative_prompt, model_id, duration_seconds,
             camera_instructions, caption_text, metadata
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING *`,
          [
            req.params.id,
            auth.organizationId,
            index + 1,
            String(scene.title || `Scene ${index + 1}`),
            String(scene.narration || ''),
            String(scene.dialogue || ''),
            String(scene.visual_prompt || scene.narration || ''),
            scene.negative_prompt ? String(scene.negative_prompt) : null,
            scene.model_id ? String(scene.model_id) : null,
            Math.max(1, Number(scene.duration_seconds || 10)),
            String(scene.camera_instructions || ''),
            String(scene.caption_text || scene.narration || ''),
            JSON.stringify({
              ...(scene.metadata && typeof scene.metadata === 'object' ? scene.metadata : {}),
              transition: scene.transition || (index === 0 ? 'cut' : 'crossfade'),
            }),
          ]
        );
        inserted.push(result.rows[0]);
      }
      await client.query(
        `UPDATE video_projects
         SET storyboard = $1, updated_at = NOW()
         WHERE id = $2 AND organization_id = $3`,
        [JSON.stringify(storyboard), req.params.id, auth.organizationId]
      );
      return inserted;
    });

    return res.json({ success: true, data: scenes });
  } catch (error) { return next(error); }
});

router.put('/scenes/:id', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const auth = await authorize(req);
    if (auth.error) return fail(res, auth.status, auth.error);

    const updates: string[] = [];
    const values: unknown[] = [];
    for (const [input, config] of SCENE_FIELDS) {
      if (req.body[input] === undefined) continue;
      values.push(config.json ? JSON.stringify(req.body[input]) : req.body[input]);
      updates.push(`${config.column} = $${values.length}`);
    }

    if (updates.length === 0) {
      const existing = await query(
        'SELECT * FROM video_scenes WHERE id = $1 AND organization_id = $2',
        [req.params.id, auth.organizationId]
      );
      if (!existing.rows[0]) return fail(res, 404, 'Video scene not found');
      return res.json({ success: true, data: existing.rows[0] });
    }

    values.push(req.params.id, auth.organizationId);
    const result = await query(
      `UPDATE video_scenes
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND organization_id = $${values.length}
       RETURNING *`,
      values
    );
    if (!result.rows[0]) return fail(res, 404, 'Video scene not found');
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) { return next(error); }
});

export default router;
