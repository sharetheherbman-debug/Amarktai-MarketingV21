import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as marketplaceService from '../services/marketplace.service';

const router = Router();

// Public routes (no auth required)
router.get('/items', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const items = await marketplaceService.listItems({
      category: req.query.category as string,
      search: req.query.search as string,
      sort: req.query.sort as string,
    });
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
});

router.get('/items/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const item = await marketplaceService.getItemById(req.params.id);
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
});

router.get('/items/:id/reviews', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const reviews = await marketplaceService.listReviews(req.params.id);
    res.json({ success: true, data: reviews });
  } catch (error) { next(error); }
});

router.get('/categories', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { query } = await import('../config/database');
    const result = await query('SELECT * FROM marketplace_categories WHERE is_active = TRUE ORDER BY sort_order');
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

router.get('/skill-packs', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const packs = await marketplaceService.listSkillPacks(req.query.industry as string);
    res.json({ success: true, data: packs });
  } catch (error) { next(error); }
});

router.get('/skill-packs/:slug', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const pack = await marketplaceService.getSkillPackBySlug(req.params.slug);
    res.json({ success: true, data: pack });
  } catch (error) { next(error); }
});

router.get('/stats', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const stats = await marketplaceService.getMarketplaceStats();
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

// Protected routes
router.use(requireAuth);

// Publishers
router.post('/publishers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const publisher = await marketplaceService.createPublisher(req.user!.userId, req.body);
    res.status(201).json({ success: true, data: publisher });
  } catch (error) { next(error); }
});

router.get('/publishers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const publishers = await marketplaceService.listPublishers();
    res.json({ success: true, data: publishers });
  } catch (error) { next(error); }
});

// Items (publisher management)
router.post('/items', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { publisher_id, ...data } = req.body;
    if (!publisher_id) {
      res.status(400).json({ success: false, error: { message: 'publisher_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const item = await marketplaceService.createItem(publisher_id, data);
    res.status(201).json({ success: true, data: item });
  } catch (error) { next(error); }
});

router.put('/items/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { publisher_id, ...data } = req.body;
    if (!publisher_id) {
      res.status(400).json({ success: false, error: { message: 'publisher_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const item = await marketplaceService.updateItem(req.params.id, publisher_id, data);
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
});

router.delete('/items/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const publisherId = req.query.publisher_id as string;
    if (!publisherId) {
      res.status(400).json({ success: false, error: { message: 'publisher_id required', code: 'BAD_REQUEST' } });
      return;
    }
    await marketplaceService.deleteItem(req.params.id, publisherId);
    res.json({ success: true, data: { message: 'Item deleted' } });
  } catch (error) { next(error); }
});

// Installations
router.post('/items/:id/install', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const installation = await marketplaceService.installItem(orgId, req.params.id, req.user!.userId, req.body.config);
    res.status(201).json({ success: true, data: installation });
  } catch (error) { next(error); }
});

router.delete('/items/:id/install', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    await marketplaceService.uninstallItem(orgId, req.params.id);
    res.json({ success: true, data: { message: 'Item uninstalled' } });
  } catch (error) { next(error); }
});

router.get('/installations', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const installations = await marketplaceService.listInstallations(orgId);
    res.json({ success: true, data: installations });
  } catch (error) { next(error); }
});

// Reviews
router.post('/items/:id/reviews', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const review = await marketplaceService.createReview(req.params.id, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: review });
  } catch (error) { next(error); }
});

// Skill Packs
router.post('/skill-packs/:slug/install', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    await marketplaceService.installSkillPack(orgId, req.params.slug, req.user!.userId);
    res.json({ success: true, data: { message: 'Skill pack installed' } });
  } catch (error) { next(error); }
});

// Admin routes
router.get('/admin/submissions', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const submissions = await marketplaceService.listSubmissions(req.query.status as string);
    res.json({ success: true, data: submissions });
  } catch (error) { next(error); }
});

router.put('/admin/submissions/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { decision, notes } = req.body;
    if (!decision) {
      res.status(400).json({ success: false, error: { message: 'decision required', code: 'BAD_REQUEST' } });
      return;
    }
    await marketplaceService.reviewSubmission(req.params.id, req.user!.userId, decision, notes);
    res.json({ success: true, data: { message: `Submission ${decision}` } });
  } catch (error) { next(error); }
});

export default router;
