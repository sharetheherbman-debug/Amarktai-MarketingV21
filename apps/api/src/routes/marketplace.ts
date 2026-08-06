import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import * as marketplaceService from '../services/marketplace.service';
import * as marketplaceRuntime from '../services/marketplace-runtime.service';

const router = Router();

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function requirePublisherOwner(publisherId: string, userId: string): Promise<void> {
  const result = await query('SELECT id FROM marketplace_publishers WHERE id = $1 AND user_id = $2 AND status = $3', [publisherId, userId, 'active']);
  if (result.rows.length === 0) throw new AppError(403, 'Publisher does not belong to the current user', 'FORBIDDEN');
}

function requirePlatformAdmin(req: AuthRequest): void {
  const role = String((req.user as unknown as Record<string, unknown>)?.role || '');
  if (!['admin', 'superadmin'].includes(role)) throw new AppError(403, 'Platform administrator access required', 'FORBIDDEN');
}

// Public catalogue.
router.get('/items', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await marketplaceService.listItems({ category: req.query.category as string, search: req.query.search as string, sort: req.query.sort as string }) });
  } catch (error) { next(error); }
});

router.get('/items/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await marketplaceService.getItemById(req.params.id) }); } catch (error) { next(error); }
});

router.get('/items/:id/reviews', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await marketplaceService.listReviews(req.params.id) }); } catch (error) { next(error); }
});

router.get('/categories', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const result = await query('SELECT * FROM marketplace_categories WHERE is_active = TRUE ORDER BY sort_order');
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.get('/skill-packs', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await marketplaceService.listSkillPacks(req.query.industry as string) }); } catch (error) { next(error); }
});

router.get('/skill-packs/:slug', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await marketplaceService.getSkillPackBySlug(req.params.slug) }); } catch (error) { next(error); }
});

router.get('/stats', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await marketplaceService.getMarketplaceStats() }); } catch (error) { next(error); }
});

router.use(requireAuth);

router.post('/publishers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const publisher = await marketplaceService.createPublisher(req.user!.userId, req.body);
    res.status(201).json({ success: true, data: publisher });
  } catch (error) { next(error); }
});

router.get('/publishers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const result = await query('SELECT * FROM marketplace_publishers WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC', [req.user!.userId, 'active']);
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.post('/items', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const publisherId = String(req.body.publisher_id || '');
    if (!publisherId || !req.body.name || !req.body.category) throw new AppError(400, 'publisher_id, name, and category are required', 'BAD_REQUEST');
    await requirePublisherOwner(publisherId, req.user!.userId);
    const manifest = objectValue(req.body.package_manifest);
    const status = String(req.body.status || 'draft');
    if (status === 'published' && Object.keys(manifest).length === 0) throw new AppError(400, 'Published items require a package_manifest', 'MARKETPLACE_PACKAGE_EMPTY');
    const item = await query(
      `INSERT INTO marketplace_items
         (publisher_id, name, slug, description, long_description, category, subcategory, version,
          dependencies, compatibility, config_schema, package_manifest, license, price_cents, is_free, tags, status, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,CASE WHEN $17='published' THEN NOW() ELSE NULL END)
       RETURNING *`,
      [
        publisherId,
        req.body.name,
        req.body.slug || String(req.body.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        req.body.description || null,
        req.body.long_description || null,
        req.body.category,
        req.body.subcategory || null,
        req.body.version || '1.0.0',
        JSON.stringify(req.body.dependencies || []),
        JSON.stringify(req.body.compatibility || {}),
        JSON.stringify(req.body.config_schema || {}),
        JSON.stringify(manifest),
        req.body.license || 'MIT',
        Number(req.body.price_cents || 0),
        Number(req.body.price_cents || 0) === 0,
        JSON.stringify(req.body.tags || []),
        status,
      ]
    );
    res.status(201).json({ success: true, data: item.rows[0] });
  } catch (error) { next(error); }
});

router.put('/items/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const publisherId = String(req.body.publisher_id || '');
    if (!publisherId) throw new AppError(400, 'publisher_id required', 'BAD_REQUEST');
    await requirePublisherOwner(publisherId, req.user!.userId);
    const current = await query('SELECT * FROM marketplace_items WHERE id = $1 AND publisher_id = $2 AND deleted_at IS NULL', [req.params.id, publisherId]);
    if (current.rows.length === 0) throw new NotFoundError('Marketplace item');
    const manifest = req.body.package_manifest !== undefined ? objectValue(req.body.package_manifest) : objectValue(current.rows[0].package_manifest);
    const status = String(req.body.status || current.rows[0].status);
    if (status === 'published' && Object.keys(manifest).length === 0) throw new AppError(400, 'Published items require a package_manifest', 'MARKETPLACE_PACKAGE_EMPTY');
    const result = await query(
      `UPDATE marketplace_items SET
         name = COALESCE($1,name), description = COALESCE($2,description), long_description = COALESCE($3,long_description),
         version = COALESCE($4,version), tags = COALESCE($5,tags), config_schema = COALESCE($6,config_schema),
         package_manifest = $7, status = $8,
         published_at = CASE WHEN $8='published' THEN COALESCE(published_at,NOW()) ELSE published_at END,
         updated_at = NOW()
       WHERE id = $9 AND publisher_id = $10 RETURNING *`,
      [
        req.body.name || null,
        req.body.description ?? null,
        req.body.long_description ?? null,
        req.body.version || null,
        req.body.tags !== undefined ? JSON.stringify(req.body.tags) : null,
        req.body.config_schema !== undefined ? JSON.stringify(req.body.config_schema) : null,
        JSON.stringify(manifest),
        status,
        req.params.id,
        publisherId,
      ]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { next(error); }
});

router.delete('/items/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const publisherId = String(req.query.publisher_id || '');
    if (!publisherId) throw new AppError(400, 'publisher_id required', 'BAD_REQUEST');
    await requirePublisherOwner(publisherId, req.user!.userId);
    const result = await query('UPDATE marketplace_items SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND publisher_id = $2 RETURNING id', [req.params.id, publisherId]);
    if (result.rows.length === 0) throw new NotFoundError('Marketplace item');
    res.json({ success: true, data: { message: 'Item deleted' } });
  } catch (error) { next(error); }
});

router.post('/items/:id/install', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) throw new AppError(400, 'organization_id required', 'BAD_REQUEST');
    res.status(201).json({ success: true, data: await marketplaceRuntime.installItem(orgId, req.params.id, req.user!.userId, req.body.config || {}) });
  } catch (error) { next(error); }
});

router.delete('/items/:id/install', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) throw new AppError(400, 'organization_id required', 'BAD_REQUEST');
    await marketplaceRuntime.uninstallItem(orgId, req.params.id);
    res.json({ success: true, data: { message: 'Item and installed assets removed' } });
  } catch (error) { next(error); }
});

router.get('/installations', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) throw new AppError(400, 'organization_id required', 'BAD_REQUEST');
    res.json({ success: true, data: await marketplaceRuntime.listInstallations(orgId) });
  } catch (error) { next(error); }
});

router.post('/items/:id/reviews', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) throw new AppError(400, 'organization_id required', 'BAD_REQUEST');
    const installed = await query('SELECT 1 FROM marketplace_installations WHERE organization_id = $1 AND item_id = $2', [orgId, req.params.id]);
    if (installed.rows.length === 0) throw new AppError(403, 'Install the item before reviewing it', 'VERIFIED_INSTALL_REQUIRED');
    res.status(201).json({ success: true, data: await marketplaceService.createReview(req.params.id, req.user!.userId, req.body) });
  } catch (error) { next(error); }
});

router.post('/skill-packs/:slug/install', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) throw new AppError(400, 'organization_id required', 'BAD_REQUEST');
    await marketplaceService.installSkillPack(orgId, req.params.slug, req.user!.userId);
    res.json({ success: true, data: { message: 'Skill pack installed' } });
  } catch (error) { next(error); }
});

router.get('/admin/submissions', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    requirePlatformAdmin(req);
    res.json({ success: true, data: await marketplaceService.listSubmissions(req.query.status as string) });
  } catch (error) { next(error); }
});

router.put('/admin/submissions/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    requirePlatformAdmin(req);
    if (!req.body.decision) throw new AppError(400, 'decision required', 'BAD_REQUEST');
    await marketplaceService.reviewSubmission(req.params.id, req.user!.userId, req.body.decision, req.body.notes);
    res.json({ success: true, data: { message: `Submission ${req.body.decision}` } });
  } catch (error) { next(error); }
});

export default router;
