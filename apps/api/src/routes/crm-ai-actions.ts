import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as crmAi from '../services/crm-ai-action.service';

const router = Router();
router.use(requireAuth);

router.get('/ai-actions', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await crmAi.listActions(orgId, req.query.status as string || 'open', parseInt(req.query.limit as string) || 100) });
  } catch (error) { next(error); }
});

router.put('/ai-actions/:id/status', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    const status = req.body.status as 'completed' | 'dismissed';
    if (!orgId || !['completed', 'dismissed'].includes(status)) { res.status(400).json({ success: false, error: { message: 'organization_id and valid status required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await crmAi.updateActionStatus(req.params.id, orgId, status, req.user!.userId) });
  } catch (error) { next(error); }
});

router.post('/contacts/:id/score', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await crmAi.analyzeContact(req.params.id, orgId, req.user!.userId) });
  } catch (error) { next(error); }
});

router.post('/deals/:id/analyze', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await crmAi.analyzeDeal(req.params.id, orgId, req.user!.userId) });
  } catch (error) { next(error); }
});

router.post('/customers/:id/analyze', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await crmAi.analyzeCustomer(req.params.id, orgId, req.user!.userId) });
  } catch (error) { next(error); }
});

export default router;
