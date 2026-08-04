import { Router, Response, NextFunction } from 'express';
import * as providerService from '../services/provider.service';
import * as usageService from '../services/usage.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { providerConfigSchema } from '../utils/validation';
import { ApiResponse } from '../types';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string | undefined;
    const providers = await providerService.list(orgId);
    res.json({ success: true, data: providers });
  } catch (error) {
    next(error);
  }
});

router.get('/health', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const health = await providerService.healthCheck();
    res.json({ success: true, data: health });
  } catch (error) {
    next(error);
  }
});

router.get('/usage', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;
    const startDate = req.query.start_date ? new Date(req.query.start_date as string) : new Date(new Date().setDate(1));
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : new Date();
    const providerId = req.query.provider_id as string | undefined;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    let usage;
    if (providerId) {
      usage = await usageService.getUsageByProvider(providerId, startDate, endDate);
    } else {
      usage = await usageService.getUsageByOrg(orgId, startDate, endDate);
    }

    res.json({ success: true, data: usage });
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(providerConfigSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id || null;
    const provider = await providerService.create(orgId, req.body);
    res.status(201).json({ success: true, data: provider });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const provider = await providerService.update(req.params.id, req.body);
    res.json({ success: true, data: provider });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await providerService.remove(req.params.id);
    res.json({ success: true, data: { message: 'Provider deleted' } });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/test', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const health = await providerService.testConnection(req.params.id);
    res.json({ success: true, data: health });
  } catch (error) {
    next(error);
  }
});

router.put('/:id/toggle', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const provider = await providerService.toggle(req.params.id, req.body.enabled);
    res.json({ success: true, data: provider });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/models', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const models = await providerService.getModels(req.params.id);
    res.json({ success: true, data: models });
  } catch (error) {
    next(error);
  }
});

export default router;
