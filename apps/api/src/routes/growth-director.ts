import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth';
import type { ApiResponse } from '../types';
import { createOwnerGrowthCycle, getGrowthStatus, getOwnerGrowthCycle, observeOrganization } from '../services/growth-director.service';
import { ensureMarketingWorkforce } from '../services/marketing-workforce.service';
import * as experiments from '../services/marketing-experiment.service';
import { requireOrganizationRole } from '../middleware/organization-access';

const router = Router();

const ownerCycleSchema = z.object({
  objective: z.string().trim().min(10).max(10_000),
  product_lines: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  idempotency_key: z.string().trim().min(8).max(255),
  generation_credit_ceiling: z.number().int().positive().max(100_000_000),
});

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

router.post('/cycles', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const input = ownerCycleSchema.parse(req.body);
    const cycle = await createOwnerGrowthCycle({
      organizationId: req.organizationId!,
      userId: req.user!.userId,
      objective: input.objective,
      productLines: input.product_lines,
      idempotencyKey: input.idempotency_key,
      generationCreditCeiling: input.generation_credit_ceiling,
    });
    res.status(202).json({ success: true, data: cycle });
  } catch (error) { next(error); }
});

router.get('/cycles/:id', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await getOwnerGrowthCycle(req.params.id, req.organizationId!) }); }
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
