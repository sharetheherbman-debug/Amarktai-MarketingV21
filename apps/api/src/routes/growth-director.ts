import { Router, Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth';
import type { ApiResponse } from '../types';
import { getGrowthStatus, observeOrganization } from '../services/growth-director.service';
import { ensureMarketingWorkforce } from '../services/marketing-workforce.service';
import * as experiments from '../services/marketing-experiment.service';
import { requireOrganizationRole } from '../middleware/organization-access';

const router = Router();

router.get('/status', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await getGrowthStatus(req.organizationId!) }); }
  catch (error) { next(error); }
});

router.post('/workforce/ensure', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: { created: await ensureMarketingWorkforce(req.organizationId!) } }); }
  catch (error) { next(error); }
});

router.post('/observe', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.status(202).json({ success: true, data: { cycle_id: await observeOrganization(req.organizationId!) } }); }
  catch (error) { next(error); }
});

router.get('/experiments', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await experiments.listExperiments(req.organizationId!) }); }
  catch (error) { next(error); }
});

router.post('/experiments', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.status(201).json({ success: true, data: await experiments.createExperiment(req.organizationId!, req.body) }); }
  catch (error) { next(error); }
});

router.post('/experiments/:id/evaluate', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await experiments.evaluateExperiment(req.params.id, req.organizationId!) }); }
  catch (error) { next(error); }
});

export default router;
