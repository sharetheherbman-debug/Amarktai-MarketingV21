import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';
import type { ApiResponse } from '../types';

const router = Router();
router.use(requireAuth);

const PROJECT_COLUMNS = new Map<string, { column: string; json?: boolean }>([
  ['name', { column: 'name' }],
  ['description', { column: 'description' }],
  ['target_duration_seconds', { column: 'target_duration_seconds' }],
  ['aspect_ratio', { column: 'aspect_ratio' }],
  ['resolution', { column: 'resolution' }],
  ['frame_rate', { column: 'frame_rate' }],
  ['script', { column: 'script' }],
  ['storyboard', { column: 'storyboard', json: true }],
  ['brand_config', { column: 'brand_config', json: true }],
  ['voice_settings', { column: 'voice_settings', json: true }],
  ['music_settings', { column: 'music_settings', json: true }],
  ['caption_settings', { column: 'caption_settings', json: true }],
  ['metadata', { column: 'metadata', json: true }],
  ['status', { column: 'status' }],
  ['production_strategy', { column: 'production_strategy' }],
  ['max_project_credits', { column: 'max_project_credits' }],
]);

async function resolveOrganization(req: AuthRequest, source: 'body' | 'query' = 'body') {
  const value = source === 'body' ? req.body?.organization_id : req.query.organization_id;
  const organizationId = String(value || '');
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

async function getProject(projectId: string, organizationId: string) {
  const result = await query(
    'SELECT * FROM video_projects WHERE id = $1 AND organization_id = $2',
    [projectId, organizationId]
  );
  return result.rows[0] || null;
}

function extractText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const data = payload as Record<string, unknown>;
  for (const key of ['text', 'content', 'output', 'response', 'result', 'message']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (value && typeof value === 'object') {
      const nested = extractText(value);
      if (nested) return nested;
    }
  }
  if (Array.isArray(data.choices)) {
    for (const choice of data.choices) {
      const text = extractText(choice);
      if (text) return text;
    }
  }
  return '';
}

function parseStoryboard(text: string): Array<Record<string, unknown>> {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  const candidate = firstBracket >= 0 && lastBracket > firstBracket
    ? cleaned.slice(firstBracket, lastBracket + 1)
    : cleaned;
  const parsed = JSON.parse(candidate) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Storyboard response was not an array');
  return parsed.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
}

function fallbackStoryboard(script: string, targetDuration: number, sceneDuration: number) {
  const sentences = script
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const desiredCount = Math.max(1, Math.ceil(targetDuration / sceneDuration));
  const count = Math.max(desiredCount, Math.min(sentences.length || 1, 12));
  return Array.from({ length: count }, (_, index) => {
    const narration = sentences[index % Math.max(sentences.length, 1)] || script.trim();
    return {
      title: `Scene ${index + 1}`,
      narration,
      dialogue: '',
      visual_prompt: narration || `Cinematic branded scene ${index + 1}`,
      camera_instructions: 'Smooth cinematic movement, clear subject, consistent lighting',
      transition: index === 0 ? 'cut' : 'crossfade',
      duration_seconds: sceneDuration,
    };
  });
}

async function selectTextModel(requestedModelId?: string) {
  if (requestedModelId) {
    const requested = await query(
      `SELECT id FROM genx_models
       WHERE id = $1 AND available = TRUE AND operations ? 'text_generation'
       LIMIT 1`,
      [requestedModelId]
    );
    if (requested.rows[0]?.id) return String(requested.rows[0].id);
  }
  const selected = await query(
    `SELECT id FROM genx_models
     WHERE available = TRUE
       AND verification_status = 'runtime_confirmed'
       AND operations ? 'text_generation'
     ORDER BY last_verified DESC NULLS LAST, name
     LIMIT 1`
  );
  return selected.rows[0]?.id ? String(selected.rows[0].id) : null;
}

router.put('/projects/:id/production-settings', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const auth = await resolveOrganization(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    const project = await getProject(req.params.id, auth.organizationId);
    if (!project) return fail(res, 404, 'Video project not found');

    const updates: string[] = [];
    const values: unknown[] = [];
    for (const [input, config] of PROJECT_COLUMNS) {
      if (req.body[input] === undefined) continue;
      values.push(config.json ? JSON.stringify(req.body[input]) : req.body[input]);
      updates.push(`${config.column} = $${values.length}`);
    }
    if (updates.length === 0) return res.json({ success: true, data: project });
    values.push(req.params.id, auth.organizationId);
    const result = await query(
      `UPDATE video_projects
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND organization_id = $${values.length}
       RETURNING *`,
      values
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) { return next(error); }
});

router.post('/projects/:id/storyboard/generate', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const auth = await resolveOrganization(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    const project = await getProject(req.params.id, auth.organizationId);
    if (!project) return fail(res, 404, 'Video project not found');

    const script = String(req.body.script ?? project.script ?? '').trim();
    if (!script) return fail(res, 400, 'A script is required before generating a storyboard');
    const targetDuration = Math.max(10, Number(req.body.target_duration_seconds || project.target_duration_seconds || 60));
    const sceneDuration = Math.max(3, Math.min(30, Number(req.body.scene_duration_seconds || 10)));
    const requestedModelId = req.body.model_id ? String(req.body.model_id) : undefined;
    const modelId = await selectTextModel(requestedModelId);

    let storyboard: Array<Record<string, unknown>>;
    let generation: Record<string, unknown> = { method: 'deterministic_fallback' };
    if (modelId) {
      try {
        const prompt = [
          'Create a production-ready storyboard as strict JSON only.',
          `Target duration: ${targetDuration} seconds. Preferred scene duration: ${sceneDuration} seconds.`,
          'Return an array. Every object must contain: title, narration, dialogue, visual_prompt, camera_instructions, transition, duration_seconds.',
          'Keep characters, products, visual style and brand details consistent across scenes.',
          `SCRIPT:\n${script}`,
        ].join('\n\n');
        const providerJob = await genxMultimodalProvider.generate({
          model: modelId,
          params: { prompt, response_format: 'json' },
          metadata: {
            organization_id: auth.organizationId,
            project_id: req.params.id,
            type: 'longform_storyboard',
          },
          webhook_url: process.env.GENX_WEBHOOK_URL,
        });
        const finalJob = ['completed', 'failed', 'cancelled'].includes(providerJob.status)
          ? providerJob
          : await genxMultimodalProvider.waitForJob(providerJob.id, { maxWaitMs: 5 * 60 * 1000, pollIntervalMs: 3000 });
        if (finalJob.status !== 'completed') throw new Error(finalJob.error || `Storyboard generation ${finalJob.status}`);
        let resultData: Record<string, unknown> = finalJob.result_data || {};
        if (!extractText(resultData)) {
          const fetched = await genxMultimodalProvider.getJobResult(providerJob.id);
          resultData = fetched.data || {};
        }
        storyboard = parseStoryboard(extractText(resultData));
        generation = { method: 'genx', model_id: modelId, provider_job_id: providerJob.id };
      } catch (error) {
        storyboard = fallbackStoryboard(script, targetDuration, sceneDuration);
        generation = {
          method: 'deterministic_fallback',
          model_id: modelId,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } else {
      storyboard = fallbackStoryboard(script, targetDuration, sceneDuration);
    }

    if (storyboard.length === 0) storyboard = fallbackStoryboard(script, targetDuration, sceneDuration);
    if (req.body.replace_scenes !== false) {
      await query('BEGIN');
      try {
        await query(
          'DELETE FROM video_scenes WHERE project_id = $1 AND organization_id = $2',
          [req.params.id, auth.organizationId]
        );
        for (let index = 0; index < storyboard.length; index += 1) {
          const scene = storyboard[index];
          await query(
            `INSERT INTO video_scenes (
               project_id, organization_id, scene_number, title, narration, dialogue,
               visual_prompt, duration_seconds, camera_instructions, metadata
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              req.params.id,
              auth.organizationId,
              index + 1,
              String(scene.title || `Scene ${index + 1}`),
              String(scene.narration || ''),
              String(scene.dialogue || ''),
              String(scene.visual_prompt || scene.narration || ''),
              Math.max(1, Number(scene.duration_seconds || sceneDuration)),
              String(scene.camera_instructions || ''),
              JSON.stringify({ transition: scene.transition || (index === 0 ? 'cut' : 'crossfade') }),
            ]
          );
        }
        await query('COMMIT');
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
    }

    const updated = await query(
      `UPDATE video_projects
       SET script = $1, storyboard = $2, target_duration_seconds = $3,
           status = 'draft', metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
           updated_at = NOW()
       WHERE id = $5 AND organization_id = $6
       RETURNING *`,
      [
        script,
        JSON.stringify(storyboard),
        targetDuration,
        JSON.stringify({ storyboard_generation: generation }),
        req.params.id,
        auth.organizationId,
      ]
    );
    return res.json({ success: true, data: { project: updated.rows[0], storyboard, generation } });
  } catch (error) { return next(error); }
});

router.post('/projects/:projectId/scenes/:sceneId/duplicate', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const auth = await resolveOrganization(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    const scene = await query(
      `SELECT * FROM video_scenes
       WHERE id = $1 AND project_id = $2 AND organization_id = $3`,
      [req.params.sceneId, req.params.projectId, auth.organizationId]
    );
    if (!scene.rows[0]) return fail(res, 404, 'Video scene not found');
    const row = scene.rows[0];
    await query(
      `UPDATE video_scenes SET scene_number = scene_number + 1
       WHERE project_id = $1 AND organization_id = $2 AND scene_number > $3`,
      [req.params.projectId, auth.organizationId, row.scene_number]
    );
    const duplicate = await query(
      `INSERT INTO video_scenes (
         project_id, organization_id, scene_number, title, narration, dialogue,
         visual_prompt, negative_prompt, model_id, duration_seconds, camera_instructions,
         source_image_url, source_video_url, start_frame_url, end_frame_url,
         caption_text, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        req.params.projectId, auth.organizationId, Number(row.scene_number) + 1,
        `${row.title || 'Scene'} copy`, row.narration, row.dialogue, row.visual_prompt,
        row.negative_prompt, row.model_id, row.duration_seconds, row.camera_instructions,
        row.source_image_url, row.source_video_url, row.start_frame_url, row.end_frame_url,
        row.caption_text, JSON.stringify(row.metadata || {}),
      ]
    );
    return res.status(201).json({ success: true, data: duplicate.rows[0] });
  } catch (error) { return next(error); }
});

router.post('/projects/:id/captions/derive', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const auth = await resolveOrganization(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    const project = await getProject(req.params.id, auth.organizationId);
    if (!project) return fail(res, 404, 'Video project not found');
    await query(
      `UPDATE video_scenes
       SET caption_text = COALESCE(NULLIF(narration, ''), NULLIF(dialogue, ''), caption_text), updated_at = NOW()
       WHERE project_id = $1 AND organization_id = $2`,
      [req.params.id, auth.organizationId]
    );
    const settings = {
      ...(typeof project.caption_settings === 'object' ? project.caption_settings : {}),
      enabled: true,
      source: 'scene_narration',
      format: req.body.format || 'srt',
      burn_in: req.body.burn_in !== false,
      position: req.body.position || 'bottom',
      font_size: Number(req.body.font_size || 42),
      text_color: req.body.text_color || '#ffffff',
      background: req.body.background || 'rgba(0,0,0,0.65)',
    };
    const updated = await query(
      `UPDATE video_projects SET caption_settings = $1, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [JSON.stringify(settings), req.params.id, auth.organizationId]
    );
    return res.json({ success: true, data: updated.rows[0] });
  } catch (error) { return next(error); }
});

router.post('/projects/:id/continuity/apply', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const auth = await resolveOrganization(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    const scenes = await query(
      `SELECT id, scene_number, metadata FROM video_scenes
       WHERE project_id = $1 AND organization_id = $2 ORDER BY scene_number`,
      [req.params.id, auth.organizationId]
    );
    const method = String(req.body.method || 'auto');
    for (let index = 0; index < scenes.rows.length; index += 1) {
      const current = scenes.rows[index];
      const previous = index > 0 ? scenes.rows[index - 1] : null;
      const metadata = {
        ...(current.metadata || {}),
        continuity_method: previous ? method : 'none',
        shared_prompt_prefix: req.body.shared_prompt_prefix || '',
        style_reference_url: req.body.style_reference_url || null,
        character_reference_url: req.body.character_reference_url || null,
        brand_reference_url: req.body.brand_reference_url || null,
        shared_seed: req.body.shared_seed ?? null,
      };
      await query(
        `UPDATE video_scenes
         SET continuation_source_id = $1, metadata = $2, updated_at = NOW()
         WHERE id = $3 AND organization_id = $4`,
        [previous?.id || null, JSON.stringify(metadata), current.id, auth.organizationId]
      );
    }
    await query(
      `UPDATE video_projects
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND organization_id = $3`,
      [JSON.stringify({ continuity: { method, configured_at: new Date().toISOString() } }), req.params.id, auth.organizationId]
    );
    return res.json({ success: true, data: { method, scene_count: scenes.rows.length } });
  } catch (error) { return next(error); }
});

export default router;
