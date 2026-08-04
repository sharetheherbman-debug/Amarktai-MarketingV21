import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as plannerService from '../services/campaign-planner.service';
import * as optimizationService from '../services/campaign-optimization.service';

const router = Router();
router.use(requireAuth);

// Campaign Plans
router.get('/plans', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const plans = await plannerService.listPlans(orgId);
    res.json({ success: true, data: plans });
  } catch (error) { next(error); }
});

router.get('/plans/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const plan = await plannerService.getPlanById(req.params.id, orgId);
    res.json({ success: true, data: plan });
  } catch (error) { next(error); }
});

router.post('/plans/generate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, name, goal, target_audience, budget_cents, products, location, duration_weeks } = req.body;
    if (!organization_id || !name || !goal) { res.status(400).json({ success: false, error: { message: 'organization_id, name, and goal required', code: 'BAD_REQUEST' } }); return; }
    const plan = await plannerService.generatePlan(organization_id, { name, goal, target_audience, budget_cents: budget_cents || 0, products: products || '', location: location || '', duration_weeks }, req.user!.userId);
    res.status(201).json({ success: true, data: plan });
  } catch (error) { next(error); }
});

router.put('/plans/:id/status', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, status } = req.body;
    if (!organization_id || !status) { res.status(400).json({ success: false, error: { message: 'organization_id and status required', code: 'BAD_REQUEST' } }); return; }
    await plannerService.updatePlanStatus(req.params.id, organization_id, status);
    res.json({ success: true, data: { message: 'Status updated' } });
  } catch (error) { next(error); }
});

// Campaign Optimization
router.post('/:id/analyze', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const optimizations = await optimizationService.analyzeCampaign(orgId, req.params.id);
    res.json({ success: true, data: optimizations });
  } catch (error) { next(error); }
});

router.get('/:id/optimizations', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const optimizations = await optimizationService.listOptimizations(orgId, req.params.id);
    res.json({ success: true, data: optimizations });
  } catch (error) { next(error); }
});

router.put('/optimizations/:optId/apply', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await optimizationService.applyOptimization(req.params.optId, orgId);
    res.json({ success: true, data: { message: 'Optimization applied' } });
  } catch (error) { next(error); }
});

export default router;
