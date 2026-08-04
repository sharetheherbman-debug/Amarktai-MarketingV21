import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as billingService from '../services/billing.service';

const router = Router();
router.use(requireAuth);

// ─── Plans ───────────────────────────────────────────────────────────────────

router.get('/plans', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const plans = await billingService.listPlans(req.query.all === 'true');
    res.json({ success: true, data: plans });
  } catch (error) { next(error); }
});

router.get('/plans/:slug', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const plan = await billingService.getPlanBySlug(req.params.slug);
    res.json({ success: true, data: plan });
  } catch (error) { next(error); }
});

// ─── Subscriptions ───────────────────────────────────────────────────────────

router.get('/subscription', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const sub = await billingService.getSubscription(orgId);
    res.json({ success: true, data: sub });
  } catch (error) { next(error); }
});

router.post('/subscription', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, plan_slug, billing_cycle } = req.body;
    if (!organization_id || !plan_slug) {
      res.status(400).json({ success: false, error: { message: 'organization_id and plan_slug required', code: 'BAD_REQUEST' } }); return;
    }
    const sub = await billingService.createSubscription(organization_id, plan_slug, billing_cycle || 'monthly');
    res.status(201).json({ success: true, data: sub });
  } catch (error) { next(error); }
});

router.put('/subscription/cancel', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, immediately } = req.body;
    if (!organization_id) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await billingService.cancelSubscription(organization_id, immediately || false);
    res.json({ success: true, data: { message: 'Subscription canceled' } });
  } catch (error) { next(error); }
});

router.put('/subscription/change-plan', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, plan_slug } = req.body;
    if (!organization_id || !plan_slug) {
      res.status(400).json({ success: false, error: { message: 'organization_id and plan_slug required', code: 'BAD_REQUEST' } }); return;
    }
    const sub = await billingService.changePlan(organization_id, plan_slug);
    res.json({ success: true, data: sub });
  } catch (error) { next(error); }
});

router.put('/subscription/reactivate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await billingService.reactivateSubscription(orgId);
    res.json({ success: true, data: { message: 'Subscription reactivated' } });
  } catch (error) { next(error); }
});

// ─── Usage ───────────────────────────────────────────────────────────────────

router.get('/usage', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const usage = await billingService.getCurrentUsage(orgId);
    res.json({ success: true, data: usage });
  } catch (error) { next(error); }
});

router.get('/usage/history', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const history = await billingService.getUsage(orgId, req.query.metric as string);
    res.json({ success: true, data: history });
  } catch (error) { next(error); }
});

router.post('/usage/record', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, metric, quantity } = req.body;
    if (!organization_id || !metric || quantity === undefined) {
      res.status(400).json({ success: false, error: { message: 'organization_id, metric, and quantity required', code: 'BAD_REQUEST' } }); return;
    }
    await billingService.recordUsage(organization_id, metric, quantity);
    res.json({ success: true, data: { message: 'Usage recorded' } });
  } catch (error) { next(error); }
});

router.get('/usage/check/:metric', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const check = await billingService.checkLimit(orgId, req.params.metric);
    res.json({ success: true, data: check });
  } catch (error) { next(error); }
});

// ─── Invoices ────────────────────────────────────────────────────────────────

router.get('/invoices', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const invoices = await billingService.listInvoices(orgId);
    res.json({ success: true, data: invoices });
  } catch (error) { next(error); }
});

router.post('/invoices', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.amount_cents || !req.body.description) {
      res.status(400).json({ success: false, error: { message: 'organization_id, amount_cents, and description required', code: 'BAD_REQUEST' } }); return;
    }
    const invoice = await billingService.createInvoice(orgId, req.body);
    res.status(201).json({ success: true, data: invoice });
  } catch (error) { next(error); }
});

router.put('/invoices/:id/pay', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await billingService.markInvoicePaid(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Invoice marked as paid' } });
  } catch (error) { next(error); }
});

// ─── Payment Methods ─────────────────────────────────────────────────────────

router.get('/payment-methods', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const methods = await billingService.listPaymentMethods(orgId);
    res.json({ success: true, data: methods });
  } catch (error) { next(error); }
});

router.post('/payment-methods', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.type) {
      res.status(400).json({ success: false, error: { message: 'organization_id and type required', code: 'BAD_REQUEST' } }); return;
    }
    const method = await billingService.addPaymentMethod(orgId, req.body);
    res.status(201).json({ success: true, data: method });
  } catch (error) { next(error); }
});

router.put('/payment-methods/:id/default', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await billingService.setDefaultPaymentMethod(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Default payment method set' } });
  } catch (error) { next(error); }
});

router.delete('/payment-methods/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await billingService.removePaymentMethod(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Payment method removed' } });
  } catch (error) { next(error); }
});

// ─── Tenant Settings ─────────────────────────────────────────────────────────

router.get('/tenant', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const settings = await billingService.getTenantSettings(orgId);
    res.json({ success: true, data: settings });
  } catch (error) { next(error); }
});

router.put('/tenant', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const settings = await billingService.updateTenantSettings(orgId, req.body);
    res.json({ success: true, data: settings });
  } catch (error) { next(error); }
});

// ─── Coupons ─────────────────────────────────────────────────────────────────

router.post('/coupons/redeem', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, code } = req.body;
    if (!organization_id || !code) {
      res.status(400).json({ success: false, error: { message: 'organization_id and code required', code: 'BAD_REQUEST' } }); return;
    }
    await billingService.redeemCoupon(organization_id, code);
    res.json({ success: true, data: { message: 'Coupon redeemed' } });
  } catch (error) { next(error); }
});

// ─── Events ──────────────────────────────────────────────────────────────────

router.get('/events', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const events = await billingService.getBillingEvents(orgId);
    res.json({ success: true, data: events });
  } catch (error) { next(error); }
});

export default router;
