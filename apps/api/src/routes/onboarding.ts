import { Router, Request, Response, NextFunction } from 'express';
import * as onboardingService from '../services/onboarding.service';
import { validateBody } from '../middleware/validator';
import { onboardingAdminSchema, appConfigureSchema, providerConfigSchema } from '../utils/validation';
import { z } from 'zod';
import { ApiResponse } from '../types';

const router = Router();

router.get('/status', async (_req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const status = await onboardingService.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

router.post('/admin', validateBody(onboardingAdminSchema), async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const user = await onboardingService.createAdmin(req.body);
    const { password_hash, ...userWithoutPassword } = user;
    res.status(201).json({ success: true, data: userWithoutPassword });
  } catch (error) {
    next(error);
  }
});

router.post('/configure', validateBody(appConfigureSchema), async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await onboardingService.configureApp(req.body);
    res.json({ success: true, data: { message: 'App configured' } });
  } catch (error) {
    next(error);
  }
});

router.post('/providers', validateBody(z.object({ providers: z.array(providerConfigSchema) })), async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await onboardingService.configureProviders(req.body.providers);
    res.json({ success: true, data: { message: 'Providers configured' } });
  } catch (error) {
    next(error);
  }
});

router.post('/test-providers', async (_req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const results = await onboardingService.testProviders();
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

router.post('/organization', validateBody(z.object({ name: z.string().min(1), slug: z.string().min(1) })), async (req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { query } = await import('../config/database');
    const adminResult = await query("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1");
    if (adminResult.rows.length === 0) {
      res.status(400).json({
        success: false,
        error: { message: 'Create an admin account first', code: 'NO_ADMIN' },
      });
      return;
    }

    const org = await onboardingService.createFirstOrganization(req.body, adminResult.rows[0].id);
    res.status(201).json({ success: true, data: org });
  } catch (error) {
    next(error);
  }
});

router.post('/complete', async (_req: Request, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await onboardingService.complete();
    res.json({ success: true, data: { message: 'Onboarding completed' } });
  } catch (error) {
    next(error);
  }
});

export default router;
