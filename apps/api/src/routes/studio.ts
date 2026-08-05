import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as studioService from '../services/studio.service';

const router = Router();
router.use(requireAuth);

// GET /api/v1/studio/models
router.get('/models', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const models = studioService.getAvailableModels();
    res.json({ success: true, data: models });
  } catch (error) { next(error); }
});

// POST /api/v1/studio/generations
router.post('/generations', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }

    // Verify user belongs to organization
    const { query } = await import('../config/database');
    const memberCheck = await query(
      'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [orgId, req.user!.userId]
    );
    if (memberCheck.rows.length === 0) {
      res.status(403).json({ success: false, error: { message: 'Not a member of this organization', code: 'FORBIDDEN' } });
      return;
    }

    const generation = await studioService.createGeneration(orgId, req.user!.userId, {
      type: req.body.type,
      model: req.body.model,
      prompt: req.body.prompt,
      negative_prompt: req.body.negative_prompt,
      options: req.body.options,
    });

    res.status(201).json({ success: true, data: generation });
  } catch (error) { next(error); }
});

// GET /api/v1/studio/generations/:id
router.get('/generations/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const generation = await studioService.getGeneration(req.params.id, orgId);
    res.json({ success: true, data: generation });
  } catch (error) { next(error); }
});

// POST /api/v1/studio/generations/:id/cancel
router.post('/generations/:id/cancel', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    await studioService.cancelGeneration(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Generation cancelled' } });
  } catch (error) { next(error); }
});

// GET /api/v1/studio/history
router.get('/history', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await studioService.listGenerations(orgId, req.user!.userId, limit);
    res.json({ success: true, data: history });
  } catch (error) { next(error); }
});

// POST /api/v1/studio/uploads
router.post('/uploads', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) {
      res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } });
      return;
    }

    // Simple file upload placeholder - in production, use multer
    res.status(501).json({
      success: false,
      error: { message: 'File upload not yet implemented - use external storage', code: 'NOT_IMPLEMENTED' }
    });
  } catch (error) { next(error); }
});

export default router;
