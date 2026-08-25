import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as plannerService from '../services/campaign-planner.service';
import * as optimizationService from '../services/campaign-optimization.service';
import * as productionService from '../services/campaign-production.service';
import * as creativeRotationService from '../services/campaign-creative-rotation.service';
import { normalizeProductScopes } from '../utils/product-scope';

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
    const { organization_id, name, goal, target_audience } = req.body;
    if (!organization_id || !name || !goal) { res.status(400).json({ success: false, error: { message: 'organization_id, name, and goal required', code: 'BAD_REQUEST' } }); return; }
    const productLines = normalizeProductScopes(req.body.product_lines ?? req.body.product_line);
    const plan = await plannerService.generatePlan(organization_id, {
      ...req.body,
      name,
      goal,
      target_audience: target_audience || '',
      budget_cents: Number(req.body.budget_cents || 0),
      products: String(req.body.products || ''),
      location: String(req.body.location || ''),
      product_lines: productLines,
      product_line: undefined,
    }, req.user!.userId);
    res.status(201).json({ success: true, data: plan });
  } catch (error) { next(error); }
});

router.put('/plans/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = String(req.body.organization_id || '');
    if (!organizationId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const body = { ...req.body };
    if (body.product_lines !== undefined || body.product_line !== undefined) {
      body.product_lines = normalizeProductScopes(body.product_lines ?? body.product_line);
      delete body.product_line;
    }
    const plan = await plannerService.updatePlan(req.params.id, organizationId, body, req.user!.userId);
    res.json({ success: true, data: plan });
  } catch (error) { next(error); }
});

router.get('/plans/:id/versions', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = String(req.query.organization_id || '');
    if (!organizationId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await plannerService.listPlanVersions(req.params.id, organizationId) });
  } catch (error) { next(error); }
});

router.put('/plans/:id/status', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, status } = req.body;
    if (!organization_id || !status) { res.status(400).json({ success: false, error: { message: 'organization_id and status required', code: 'BAD_REQUEST' } }); return; }
    await plannerService.updatePlanStatus(req.params.id, organization_id, status, req.user!.userId);
    res.json({ success: true, data: { message: 'Status updated' } });
  } catch (error) { next(error); }
});

router.post('/plans/:id/production', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = String(req.body.organization_id || '');
    if (!organizationId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const runs = await productionService.queueCampaignProduction(req.params.id, organizationId, req.user!.userId);
    res.status(202).json({ success: true, data: runs });
  } catch (error) { next(error); }
});

router.get('/plans/:id/production', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = String(req.query.organization_id || '');
    if (!organizationId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await productionService.listCampaignProduction(req.params.id, organizationId) });
  } catch (error) { next(error); }
});

router.post('/plans/:id/rotation', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = String(req.body.organization_id || '');
    const connectionId = String(req.body.connection_id || '');
    const startAt = String(req.body.start_at || '');
    if (!organizationId || !connectionId || !startAt) {
      res.status(400).json({ success: false, error: { message: 'organization_id, connection_id and start_at required', code: 'BAD_REQUEST' } }); return;
    }
    const rotations = await creativeRotationService.planCampaignCreativeRotation({
      organizationId,
      campaignPlanId: req.params.id,
      connectionId,
      startAt,
      spacingHours: req.body.spacing_hours,
      fatigueWindowHours: req.body.fatigue_window_hours,
      maxSlots: req.body.max_slots,
      userId: req.user!.userId,
      requestedBy: 'user',
    });
    res.status(202).json({ success: true, data: rotations });
  } catch (error) { next(error); }
});

router.get('/plans/:id/rotation', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = String(req.query.organization_id || '');
    if (!organizationId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await creativeRotationService.listCampaignCreativeRotations(req.params.id, organizationId) });
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