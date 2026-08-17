import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validator';
import { createCampaignSchema, paginationSchema } from '../utils/validation';
import { query, transaction } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { ApiResponse, PaginatedResponse } from '../types';
import { requireOrganizationMembership } from '../middleware/organization-access';

const router = Router();

router.use(requireAuth);
router.use(requireOrganizationMembership);

router.get('/', validateQuery(paginationSchema), async (req: AuthRequest, res: Response<PaginatedResponse<any>>, next: NextFunction) => {
  try {
    const { page, limit, sort, order, search } = req.query as any;
    const offset = (page - 1) * limit;
    const orgId = req.organizationId;

    let whereClause = 'WHERE c.deleted_at IS NULL';
    const params: any[] = [];
    let paramCount = 1;

    whereClause += ` AND c.organization_id = $${paramCount++}`;
    params.push(orgId);

    if (search) {
      whereClause += ` AND (c.name ILIKE $${paramCount} OR c.description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    const countResult = await query(
      `SELECT COUNT(*) FROM campaigns c ${whereClause}`,
      params
    );
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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(createCampaignSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { name, description, type, project_id, config, schedule } = req.body;
    const orgId = req.organizationId;

    const result = await query(
      `INSERT INTO campaigns (organization_id, project_id, name, description, type, config, schedule, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [orgId, project_id || null, name, description || null, type, JSON.stringify(config || {}), JSON.stringify(schedule || {}), req.user!.userId]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.organizationId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Campaign');
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { name, description, type, status, config, schedule } = req.body;
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name) { updates.push(`name = $${paramCount++}`); values.push(name); }
    if (description) { updates.push(`description = $${paramCount++}`); values.push(description); }
    if (type) { updates.push(`type = $${paramCount++}`); values.push(type); }
    if (status) { updates.push(`status = $${paramCount++}`); values.push(status); }
    if (config) { updates.push(`config = $${paramCount++}`); values.push(JSON.stringify(config)); }
    if (schedule) { updates.push(`schedule = $${paramCount++}`); values.push(JSON.stringify(schedule)); }

    updates.push(`updated_at = NOW()`);
    values.push(req.params.id, req.organizationId);

    const result = await query(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = $${paramCount} AND organization_id = $${paramCount + 1} AND deleted_at IS NULL RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Campaign');
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query(
      'UPDATE campaigns SET deleted_at = NOW() WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL RETURNING id',
      [req.params.id, req.organizationId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Campaign');
    }

    res.json({ success: true, data: { message: 'Campaign deleted' } });
  } catch (error) {
    next(error);
  }
});

export default router;
