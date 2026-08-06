import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireOrganizationMembership } from '../middleware/organization-access';
import { ApiResponse } from '../types';
import { AppError } from '../middleware/errorHandler';
import * as paymentService from '../services/marketplace-payment.service';
import * as entitlementService from '../services/marketplace-entitlement.service';

const router = Router();
router.use(requireAuth, requireOrganizationMembership);

router.post('/items/:id/checkout', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = String(req.body.organization_id || req.query.organization_id || '');
    if (!orgId) throw new AppError(400, 'organization_id required', 'BAD_REQUEST');
    const checkout = await paymentService.createCheckoutSession(orgId, req.params.id, req.user!.userId);
    res.status(201).json({ success: true, data: checkout });
  } catch (error) { next(error); }
});

router.get('/purchases/status', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = String(req.query.organization_id || '');
    const sessionId = String(req.query.session_id || '');
    if (!orgId || !sessionId) throw new AppError(400, 'organization_id and session_id required', 'BAD_REQUEST');
    res.json({ success: true, data: await paymentService.getPurchaseStatus(orgId, sessionId) });
  } catch (error) { next(error); }
});

// This route intentionally precedes the general marketplace router so every
// install, including free packages, passes through the entitlement guard.
router.post('/items/:id/install', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = String(req.body.organization_id || req.query.organization_id || '');
    if (!orgId) throw new AppError(400, 'organization_id required', 'BAD_REQUEST');
    const installation = await entitlementService.installEntitledItem(
      orgId,
      req.params.id,
      req.user!.userId,
      req.body.config || {}
    );
    res.status(201).json({ success: true, data: installation });
  } catch (error) { next(error); }
});

export default router;
