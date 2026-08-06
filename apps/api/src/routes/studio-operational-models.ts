import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import type { ApiResponse } from '../types';

const router = Router();

function normalizeOperation(type: string): string {
  if (type === 'cinema') return 'text_to_video';
  if (type === 'audio') return 'audio_generation';
  return type;
}

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch { return []; }
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function mapModel(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    provider: 'genx',
    operations: parseArray(row.operations),
    inputs: parseArray(row.inputs),
    outputs: parseArray(row.outputs),
    parameters: parseObject(row.parameters),
    required_parameters: parseArray(row.required_parameters),
    optional_parameters: parseArray(row.optional_parameters),
    verification_status: row.verification_status,
    status: 'runtime_confirmed',
  };
}

router.get('/models', requireAuth, async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const operation = req.query.operation ? normalizeOperation(String(req.query.operation)) : null;
    const values: unknown[] = [];
    let sql = `SELECT * FROM genx_models
               WHERE available = TRUE
                 AND deprecated = FALSE
                 AND verification_status = 'runtime_confirmed'`;
    if (operation) {
      values.push(operation);
      sql += ` AND operations ? $${values.length}`;
    }
    sql += ' ORDER BY category, name';
    const result = await query(sql, values);
    res.json({ success: true, data: result.rows.map(mapModel) });
  } catch (error) { next(error); }
});

router.post('/generations', requireAuth, async (
  req: AuthRequest,
  res: Response<ApiResponse>,
  next: NextFunction
) => {
  try {
    const operation = normalizeOperation(String(req.body.type || ''));
    if (!operation) {
      res.status(400).json({ success: false, error: { message: 'type required', code: 'BAD_REQUEST' } });
      return;
    }

    const values: unknown[] = [operation];
    let sql = `SELECT id, operations, verification_status
               FROM genx_models
               WHERE available = TRUE
                 AND deprecated = FALSE
                 AND verification_status = 'runtime_confirmed'
                 AND operations ? $1`;
    if (req.body.model) {
      values.push(String(req.body.model));
      sql += ' AND id = $2';
    }
    sql += ' ORDER BY last_verified DESC NULLS LAST, name LIMIT 1';
    const model = await query(sql, values);
    if (!model.rows[0]) {
      res.status(400).json({
        success: false,
        error: {
          message: req.body.model
            ? `Selected model is not runtime-confirmed for ${operation}`
            : `No runtime-confirmed GenX model is available for ${operation}`,
          code: 'MODEL_NOT_RUNTIME_CONFIRMED',
        },
      });
      return;
    }
    req.body.model = model.rows[0].id;
    next();
  } catch (error) { next(error); }
});

export default router;
