import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as templateService from '../services/content-template.service';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    const templates = await templateService.list(orgId, req.query.category as string);
    res.json({ success: true, data: templates });
  } catch (error) { next(error); }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    const template = await templateService.getById(req.params.id, orgId);
    res.json({ success: true, data: template });
  } catch (error) { next(error); }
});

router.post('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    const template = await templateService.create(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: template });
  } catch (error) { next(error); }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    const template = await templateService.update(req.params.id, orgId, req.body);
    res.json({ success: true, data: template });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    await templateService.remove(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Template deleted' } });
  } catch (error) { next(error); }
});

router.post('/seed', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    await templateService.seedDefaultTemplates(orgId);
    res.json({ success: true, data: { message: 'Default templates seeded' } });
  } catch (error) { next(error); }
});

export default router;
