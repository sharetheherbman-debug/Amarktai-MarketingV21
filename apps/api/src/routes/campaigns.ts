import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateQuery } from '../middleware/validator';
import { paginationSchema } from '../utils/validation';
import { query } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { ApiResponse, PaginatedResponse } from '../types';
import { legacyProductLine, normalizeProductScopes } from '../utils/product-scope';

const router = Router();
router.use(requireAuth);

function campaignType(value: unknown): 'email' | 'social' | 'ads' | 'content' | 'sms' {
  const type = String(value || '');
  if (!['email', 'social', 'ads', 'content', 'sms'].includes(type)) {
    throw new Error('Campaign type must be email, social, ads, content, or sms');
  }
  return type as 'email' | 'social' | 'ads' | 'content' | 'sms';
}

router.get('/', validateQuery(paginationSchema), async (req: AuthRequest, res: Response<PaginatedResponse<any>>, next: NextFunction) => {
  try {
    const { page, limit, sort, order, search } = req.query as any;
    const offset = (page - 1) * limit;
    const orgId = req.query.organization_id as string;

    let whereClause = 'WHERE c.deleted_at IS NULL';
    const params: any[] = [];
    let paramCount = 1;

    if (orgId) {
      whereClause += ` AND c.organization_id = $${paramCount++}`;
      params.push(orgId);
    }

    if (search) {
      whereClause += ` AND (c.name ILIKE $${paramCount} OR c.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    const countResult = await query(`SELECT COUNT(*) FROM campaigns c ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);
    const allowedSortFields = ['created_at', 'updated_at', 'name', 'type', 'status', 'started_at', 'completed_at'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const result = await query(
      `SELECT c.* FROM campaigns c ${whereClause} ORDER BY c.${sortField} ${sortOrder} LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
      [...params, limit, offset]
    );

    res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) { next(error); }
});

router.post('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 255) throw new Error('Campaign name is required and must be 255 characters or fewer');
    const type = campaignType(req.body.type);
    const productLines = normalizeProductScopes(req.body.product_lines ?? req.body.product_line);
    const productLine = legacyProductLine(productLines);
    const orgId = req.query.organization_id as string || req.body.organization_id;
    if (!orgId) throw new Error('organization_id is required');

    const result = await query(
      `INSERT INTO campaigns (organization_id, project_id, name, description, type, product_line, product_lines, config, schedule, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        orgId,
        req.body.project_id || null,
        name,
        req.body.description || null,
        type,
        productLine,
        JSON.stringify(productLines),
        JSON.stringify(req.body.config || {}),
        JSON.stringify(req.body.schedule || {}),
        req.user!.userId,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.organizationId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Campaign');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { name, description, type, status, config, schedule } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      const normalizedName = String(name).trim();
      if (!normalizedName || normalizedName.length > 255) throw new Error('Campaign name is invalid');
      updates.push(`name = $${paramCount++}`); values.push(normalizedName);
    }
    if (description !== undefined) { updates.push(`description = $${paramCount++}`); values.push(description || null); }
    if (type !== undefined) { updates.push(`type = $${paramCount++}`); values.push(campaignType(type)); }
    if (status !== undefined) { updates.push(`status = $${paramCount++}`); values.push(status); }
    if (req.body.product_lines !== undefined || req.body.product_line !== undefined) {
      const productLines = normalizeProductScopes(req.body.product_lines ?? req.body.product_line);
      updates.push(`product_line = $${paramCount++}`); values.push(legacyProductLine(productLines));
      updates.push(`product_lines = $${paramCount++}`); values.push(JSON.stringify(productLines));
    }
    if (config !== undefined) { updates.push(`config = $${paramCount++}`); values.push(JSON.stringify(config || {})); }
    if (schedule !== undefined) { updates.push(`schedule = $${paramCount++}`); values.push(JSON.stringify(schedule || {})); }

    updates.push('updated_at = NOW()');
    values.push(req.params.id, req.organizationId);

    const result = await query(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = $${paramCount} AND organization_id = $${paramCount + 1} AND deleted_at IS NULL RETURNING *`,
      values
    );
    if (result.rows.length === 0) throw new NotFoundError('Campaign');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query(
      'UPDATE campaigns SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id',
      [req.params.id, req.organizationId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Campaign');
    res.json({ success: true, data: { message: 'Campaign deleted' } });
  } catch (error) { next(error); }
});

export default router;