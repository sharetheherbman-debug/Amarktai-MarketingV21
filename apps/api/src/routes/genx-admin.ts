import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as genxRegistry from '../services/genx-model-registry.service';
import * as genxPricing from '../services/genx-pricing.service';
import { query } from '../config/database';
import runtimeTestRoutes from './genx-runtime-tests';

const router = Router();
router.use(requireAuth);
router.use(runtimeTestRoutes);

const quoteSchema = z.object({
  model_id: z.string().trim().min(1).max(500),
  operation: z.string().trim().min(1).max(100),
  quantity: z.number().positive().finite(),
});

async function verifyAdmin(userId: string): Promise<boolean> {
  const result = await query('SELECT role FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 && ['admin', 'superadmin'].includes(String(result.rows[0].role));
}

async function requirePlatformAdmin(req: AuthRequest, res: Response<ApiResponse>): Promise<boolean> {
  if (await verifyAdmin(req.user!.userId)) return true;
  res.status(403).json({ success: false, error: { message: 'Admin access required', code: 'FORBIDDEN' } });
  return false;
}

router.get('/models', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await requirePlatformAdmin(req, res)) return;
    const category = req.query.category ? String(req.query.category) : '';
    const operation = req.query.operation ? String(req.query.operation) : '';
    const includeUnpriced = req.query.include_unpriced !== 'false';
    const models = includeUnpriced
      ? await genxRegistry.getCatalogueModels(category || undefined)
      : category
        ? await genxRegistry.getModelsByCategory(category)
        : await genxRegistry.getAvailableModels(operation || undefined);
    res.json({ success: true, data: models });
  } catch (error) { next(error); }
});

router.get('/models/:category', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await requirePlatformAdmin(req, res)) return;
    res.json({ success: true, data: await genxRegistry.getCatalogueModels(req.params.category) });
  } catch (error) { next(error); }
});

/**
 * Refreshes the authenticated GenX catalogue and immediately creates auditable
 * GBP retail price snapshots. Models with ambiguous pricing, unsupported source
 * currency or no configured FX rate remain disabled for paid generation.
 */
router.post('/models/refresh', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await requirePlatformAdmin(req, res)) return;
    const models = await genxRegistry.fetchLiveModelCatalogue();
    if (models.length === 0) {
      res.status(502).json({ success: false, error: { message: 'GenX returned no catalogue models', code: 'GENX_CATALOGUE_EMPTY' } });
      return;
    }
    const catalogue = await genxRegistry.syncModelsToDatabase(models);
    const pricing = await genxPricing.syncPricingFromModels(models);
    res.json({ success: true, data: { catalogue, pricing } });
  } catch (error) { next(error); }
});

router.get('/pricing', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await requirePlatformAdmin(req, res)) return;
    const modelId = req.query.model_id ? String(req.query.model_id) : undefined;
    res.json({ success: true, data: await genxPricing.listActivePrices(modelId) });
  } catch (error) { next(error); }
});

router.post('/pricing/quote', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await requirePlatformAdmin(req, res)) return;
    const input = quoteSchema.parse(req.body);
    res.json({
      success: true,
      data: await genxPricing.quoteGeneration({
        modelId: input.model_id,
        operation: input.operation,
        quantity: input.quantity,
      }),
    });
  } catch (error) { next(error); }
});

router.get('/capabilities', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    if (!await requirePlatformAdmin(req, res)) return;
    res.json({ success: true, data: await genxRegistry.getModelStats() });
  } catch (error) { next(error); }
});

export default router;
