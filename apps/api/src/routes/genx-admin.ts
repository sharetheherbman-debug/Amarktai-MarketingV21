import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as genxRegistry from '../services/genx-model-registry.service';
import { query } from '../config/database';
import runtimeTestRoutes from './genx-runtime-tests';

const router = Router();
router.use(requireAuth);
router.use(runtimeTestRoutes);

async function verifyAdmin(userId: string): Promise<boolean> {
  const result = await query('SELECT role FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 && ['admin', 'superadmin'].includes(String(result.rows[0].role));
}

router.get('/models', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await verifyAdmin(req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
      return;
    }
    const category = req.query.category ? String(req.query.category) : '';
    const operation = req.query.operation ? String(req.query.operation) : '';
    const models = category
      ? await genxRegistry.getModelsByCategory(category)
      : await genxRegistry.getAvailableModels(operation || undefined);
    res.json({ success: true, data: models });
  } catch (error) { next(error); }
});

router.get('/models/:category', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await verifyAdmin(req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
      return;
    }
    res.json({ success: true, data: await genxRegistry.getModelsByCategory(req.params.category) });
  } catch (error) { next(error); }
});

router.post('/models/refresh', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await verifyAdmin(req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
      return;
    }
    const models = await genxRegistry.fetchLiveModelCatalogue();
    if (models.length === 0) {
      res.status(502).json({ success: false, error: { message: 'GenX returned no catalogue models', code: 'GENX_CATALOGUE_EMPTY' } });
      return;
    }
    res.json({ success: true, data: await genxRegistry.syncModelsToDatabase(models) });
  } catch (error) { next(error); }
});

router.get('/capabilities', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await verifyAdmin(req.user!.userId)) {
      res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
      return;
    }
    res.json({ success: true, data: await genxRegistry.getModelStats() });
  } catch (error) { next(error); }
});

export default router;
