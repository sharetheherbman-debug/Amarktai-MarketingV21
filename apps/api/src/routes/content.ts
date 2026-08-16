import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { ApiResponse, PaginatedResponse } from '../types';

/**
 * Compatibility surface for older clients.
 *
 * The historical `content` table is no longer an executable workflow. Reads
 * are served from the authoritative, versioned `content_items` library and all
 * mutations must use `/content-studio`, where quality and owner approval are
 * enforced. This closes the former draft -> approved -> published bypass.
 */
const router = Router();

router.get('/', async (req: AuthRequest, res: Response<PaginatedResponse<Record<string, unknown>>>, next: NextFunction) => {
  try {
    const organizationId = req.organizationId!;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(Number(req.query.limit || 20), 100));
    const offset = (page - 1) * limit;
    const params: unknown[] = [organizationId];
    let where = 'WHERE organization_id=$1 AND deleted_at IS NULL';
    if (req.query.type) { params.push(String(req.query.type)); where += ` AND type=$${params.length}`; }
    if (req.query.platform) { params.push(String(req.query.platform)); where += ` AND platform=$${params.length}`; }
    if (req.query.status) { params.push(String(req.query.status)); where += ` AND status=$${params.length}`; }
    if (req.query.campaign_id) { params.push(String(req.query.campaign_id)); where += ` AND campaign_id=$${params.length}`; }
    if (req.query.search) {
      params.push(`%${String(req.query.search)}%`);
      where += ` AND (title ILIKE $${params.length} OR body ILIKE $${params.length})`;
    }
    const count = await query(`SELECT COUNT(*) FROM content_items ${where}`, params);
    params.push(limit, offset);
    const result = await query(
      `SELECT id,organization_id,campaign_id,title,body,excerpt,type,format,platform,status,
              workflow_state,metadata,parent_id,root_content_id,source_content_id,
              transformation_type,version,quality_score,performance_summary,scheduled_at,
              published_at,created_at,updated_at
       FROM content_items ${where}
       ORDER BY updated_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const total = Number(count.rows[0]?.count || 0);
    res.json({ success: true, data: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await query(
      `SELECT id,organization_id,campaign_id,title,body,excerpt,type,format,platform,status,
              workflow_state,metadata,parent_id,root_content_id,source_content_id,
              transformation_type,version,quality_score,performance_summary,scheduled_at,
              published_at,created_at,updated_at
       FROM content_items WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL`,
      [req.params.id, req.organizationId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Content');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

const mutationRetired = (_req: AuthRequest, _res: Response<ApiResponse>, next: NextFunction) => {
  next(new AppError(410, 'Legacy content mutations are retired; use the governed Content Studio workflow', 'LEGACY_CONTENT_ROUTE_RETIRED'));
};

router.post('/', mutationRetired);
router.put('/:id', mutationRetired);
router.patch('/:id', mutationRetired);
router.delete('/:id', mutationRetired);

export default router;
