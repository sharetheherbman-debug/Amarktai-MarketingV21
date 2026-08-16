import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { genxMultimodalProvider } from '../providers/genx-multimodal.provider';
import type { ApiResponse } from '../types';

const router = Router();
router.use(requireAuth);

async function requireAdmin(req: AuthRequest, res: Response<ApiResponse>): Promise<boolean> {
  const user = await query('SELECT role FROM users WHERE id = $1', [req.user!.userId]);
  if (!user.rows[0] || !['admin', 'superadmin'].includes(String(user.rows[0].role))) {
    res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
    return false;
  }
  return true;
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function resultUrlFrom(job: Record<string, any>, result?: Record<string, any>): string | null {
  return String(
    job.result_url ||
    job.output_url ||
    result?.url ||
    result?.result_url ||
    result?.output_url ||
    ''
  ) || null;
}

router.post('/models/:id/runtime-test', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const modelResult = await query('SELECT * FROM genx_models WHERE id = $1', [req.params.id]);
    if (!modelResult.rows[0]) {
      res.status(404).json({ success: false, error: { message: 'GenX model not found', code: 'NOT_FOUND' } });
      return;
    }
    const model = modelResult.rows[0] as Record<string, any>;
    const operation = String(req.body.operation || '').trim();
    if (!operation) {
      res.status(400).json({ success: false, error: { message: 'operation required', code: 'BAD_REQUEST' } });
      return;
    }
    const params = req.body.params && typeof req.body.params === 'object' ? req.body.params : {};
    const startedAt = new Date();
    let providerJobId: string | null = null;

    try {
      const submitted: any = await genxMultimodalProvider.generate({
        model: model.id,
        params,
        metadata: {
          runtime_test: true,
          tested_by: req.user!.userId,
          operation,
        },
        webhook_url: process.env.GENX_WEBHOOK_URL,
      } as any);
      providerJobId = String(submitted.id);
      const finalJob: any = ['completed', 'failed', 'cancelled'].includes(String(submitted.status))
        ? submitted
        : await genxMultimodalProvider.waitForJob(providerJobId, {
            maxWaitMs: Number(req.body.max_wait_ms || (operation.includes('video') ? 20 * 60 * 1000 : 10 * 60 * 1000)),
            pollIntervalMs: 3000,
          });
      if (finalJob.status !== 'completed') {
        throw new Error(finalJob.error || `Runtime test ${finalJob.status}`);
      }
      let result: any = finalJob.result_data || {};
      let resultUrl = resultUrlFrom(finalJob, result);
      if (!resultUrl && !['text_generation', 'speech_to_text'].includes(operation)) {
        const fetched: any = await genxMultimodalProvider.getJobResult(providerJobId);
        result = fetched.data || fetched;
        resultUrl = resultUrlFrom(finalJob, fetched);
      }
      const textOutput = result.text || result.content || result.output || null;
      if (!resultUrl && !textOutput) throw new Error('Provider completed without a usable output');

      const operations = [...new Set([...asArray(model.operations), operation])];
      const evidence = {
        operation,
        provider_job_id: providerJobId,
        submitted_params: params,
        result_url: resultUrl,
        text_output_present: Boolean(textOutput),
        usage: finalJob.usage || result.usage || null,
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
        status_progression: ['submitted', String(submitted.status || 'queued'), 'completed'],
      };
      await query(
        `UPDATE genx_models
         SET operations = $1, verification_status = 'runtime_confirmed',
             last_verified = NOW(), available = TRUE,
             raw_metadata = COALESCE(raw_metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(operations), JSON.stringify({ last_runtime_test: evidence }), model.id]
      );
      res.json({ success: true, data: { model_id: model.id, runtime_result: 'PASS', ...evidence } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const evidence = {
        operation,
        provider_job_id: providerJobId,
        submitted_params: params,
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
        error: message,
      };
      await query(
        `UPDATE genx_models
         SET verification_status = 'failed', last_verified = NOW(),
             raw_metadata = COALESCE(raw_metadata, '{}'::jsonb) || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify({ last_runtime_test: evidence }), model.id]
      );
      res.status(422).json({
        success: false,
        error: { message, code: 'GENX_RUNTIME_TEST_FAILED' },
        data: { model_id: model.id, runtime_result: 'FAIL', ...evidence },
      } as ApiResponse);
    }
  } catch (error) { next(error); }
});

router.get('/runtime-evidence', async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const models = await query(
      `SELECT id, name, category, operations, verification_status,
              required_parameters, optional_parameters, parameters,
              raw_metadata->'last_runtime_test' AS last_runtime_test,
              last_verified
       FROM genx_models
       WHERE verification_status IN ('runtime_confirmed', 'failed')
       ORDER BY category, name`
    );
    const counts = await query(
      `SELECT category, verification_status, COUNT(*)::int AS count
       FROM genx_models
       GROUP BY category, verification_status
       ORDER BY category, verification_status`
    );
    res.json({ success: true, data: { counts: counts.rows, models: models.rows } });
  } catch (error) { next(error); }
});

export default router;
