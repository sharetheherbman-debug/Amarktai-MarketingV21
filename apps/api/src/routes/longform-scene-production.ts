import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
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
    error: { message, code: status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST' },
  });
}

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
