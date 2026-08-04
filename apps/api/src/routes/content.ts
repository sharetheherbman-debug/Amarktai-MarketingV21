import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validator';
import { createContentSchema, paginationSchema } from '../utils/validation';
import { query } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { ApiResponse, PaginatedResponse } from '../types';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(paginationSchema), async (req: AuthRequest, res: Response<PaginatedResponse<any>>, next: NextFunction) => {
  try {
    const { page, limit, sort, order, search } = req.query as any;
    const offset = (page - 1) * limit;
    const orgId = req.query.organization_id as string;
    const type = req.query.type as string;

    let whereClause = 'WHERE c.deleted_at IS NULL';
    const params: any[] = [];
    let paramCount = 1;

    if (orgId) {
      whereClause += ` AND c.organization_id = $${paramCount++}`;
      params.push(orgId);
    }

    if (type) {
      whereClause += ` AND c.type = $${paramCount++}`;
      params.push(type);
    }

    if (search) {
      whereClause += ` AND (c.title ILIKE $${paramCount} OR c.body ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    const countResult = await query(`SELECT COUNT(*) FROM content c ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    const allowedSortFields = ['created_at', 'updated_at', 'title', 'type', 'platform', 'status', 'published_at'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const result = await query(
      `SELECT c.* FROM content c ${whereClause} ORDER BY c.${sortField} ${sortOrder} LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(createContentSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { title, body, type, format, platform, campaign_id, project_id, metadata } = req.body;
    const orgId = req.query.organization_id as string || req.body.organization_id;

    const result = await query(
      `INSERT INTO content (organization_id, campaign_id, project_id, title, body, type, format, platform, metadata, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [orgId, campaign_id || null, project_id || null, title || null, body || null, type, format || null, platform || null, JSON.stringify(metadata || {}), req.user!.userId]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query('SELECT * FROM content WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Content');
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { title, body, type, format, platform, status, metadata } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (title) { updates.push(`title = $${paramCount++}`); values.push(title); }
    if (body) { updates.push(`body = $${paramCount++}`); values.push(body); }
    if (type) { updates.push(`type = $${paramCount++}`); values.push(type); }
    if (format) { updates.push(`format = $${paramCount++}`); values.push(format); }
    if (platform) { updates.push(`platform = $${paramCount++}`); values.push(platform); }
    if (status) { updates.push(`status = $${paramCount++}`); values.push(status); }
    if (metadata) { updates.push(`metadata = $${paramCount++}`); values.push(JSON.stringify(metadata)); }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await query(
      `UPDATE content SET ${updates.join(', ')} WHERE id = $${paramCount} AND deleted_at IS NULL RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Content');
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query(
      'UPDATE content SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Content');
    }

    res.json({ success: true, data: { message: 'Content deleted' } });
  } catch (error) {
    next(error);
  }
});

export default router;
