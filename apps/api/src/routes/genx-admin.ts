import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as genxRegistry from '../services/genx-model-registry.service';
import { query } from '../config/database';

const router = Router();
router.use(requireAuth);

async function verifyAdmin(userId: string): Promise<boolean> {
  const result = await query('SELECT role FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 && ['admin', 'superadmin'].includes(result.rows[0].role as string);
}

// GET /api/v1/admin/genx/models
router.get('/models', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await verifyAdmin(req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
      return;
    }
    const models = await genxRegistry.getAvailableModels(req.query.category as string);
    res.json({ success: true, data: models });
  } catch (error) { next(error); }
});

// GET /api/v1/admin/genx/models/:category
router.get('/models/:category', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await verifyAdmin(req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
      return;
    }
    const models = await genxRegistry.getModelsByCategory(req.params.category);
    res.json({ success: true, data: models });
  } catch (error) { next(error); }
});

// POST /api/v1/admin/genx/models/refresh
router.post('/models/refresh', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await verifyAdmin(req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
      return;
    }
    const models = await genxRegistry.fetchLiveModelCatalogue();
    const result = await genxRegistry.syncModelsToDatabase(models);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

// GET /api/v1/admin/genx/capabilities
router.get('/capabilities', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await verifyAdmin(req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
      return;
    }
    const stats = await genxRegistry.getModelStats();
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

export default router;
