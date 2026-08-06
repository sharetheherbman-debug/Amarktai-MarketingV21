import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as knowledgeService from '../services/knowledge.service';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await knowledgeService.list(orgId, req.query.type as string | undefined) });
  } catch (error) { next(error); }
});

router.post('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    const { name, type, url, config, content, sync_now } = req.body;
    if (!orgId || !name || !type) { res.status(400).json({ success: false, error: { message: 'organization_id, name, and type are required', code: 'BAD_REQUEST' } }); return; }
    const source = await knowledgeService.create(orgId, {
      name,
      type,
      url,
      config: { ...(config || {}), ...(content ? { content } : {}) },
    }, req.user!.userId);
    const ingestion = sync_now ? await knowledgeService.syncSource(source.id, orgId) : null;
    res.status(201).json({ success: true, data: { source, ingestion } });
  } catch (error) { next(error); }
});

router.get('/stats', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await knowledgeService.getStats(orgId) });
  } catch (error) { next(error); }
});

router.get('/search', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const searchText = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;
    if (!orgId || !searchText) { res.status(400).json({ success: false, error: { message: 'organization_id and q are required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await knowledgeService.search(orgId, searchText, limit) });
  } catch (error) { next(error); }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await knowledgeService.getById(req.params.id, orgId) });
  } catch (error) { next(error); }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const config = req.body.content
      ? { ...(req.body.config || {}), content: req.body.content }
      : req.body.config;
    res.json({ success: true, data: await knowledgeService.update(req.params.id, orgId, { ...req.body, config }) });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    await knowledgeService.remove(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Knowledge source deleted' } });
  } catch (error) { next(error); }
});

router.post('/:id/sync', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const ingestion = await knowledgeService.syncSource(req.params.id, orgId);
    res.json({ success: true, data: ingestion });
  } catch (error) { next(error); }
});

router.get('/:id/items', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const result = await knowledgeService.listItems(req.params.id, orgId, parseInt(req.query.limit as string) || 50, parseInt(req.query.offset as string) || 0);
    res.json({ success: true, data: result.items, meta: { total: result.total } });
  } catch (error) { next(error); }
});

router.post('/:id/items', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    const { title, content, url, metadata } = req.body;
    if (!orgId || !title || !content) { res.status(400).json({ success: false, error: { message: 'organization_id, title, and content are required', code: 'BAD_REQUEST' } }); return; }
    res.status(201).json({ success: true, data: await knowledgeService.createItem(orgId, req.params.id, { title, content, url, metadata }) });
  } catch (error) { next(error); }
});

router.delete('/items/:itemId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    await knowledgeService.deleteItem(req.params.itemId, orgId);
    res.json({ success: true, data: { message: 'Knowledge item deleted' } });
  } catch (error) { next(error); }
});

export default router;
