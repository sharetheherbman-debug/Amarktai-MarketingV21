import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireOrganizationMembership, requireOrganizationRole } from '../middleware/organization-access';
import { validateBody } from '../middleware/validator';
import { ApiResponse } from '../types';
import * as billingService from '../services/billing.service';
import * as stripeBilling from '../services/billing-stripe.service';

const router = Router();
router.use(requireAuth);

const subscriptionSchema = z.object({
  organization_id: z.string().uuid(),
  plan_slug: z.string().min(1).max(100),
  billing_cycle: z.enum(['monthly', 'yearly']).optional(),
});
const changePlanSchema = z.object({
  organization_id: z.string().uuid(),
  plan_slug: z.string().min(1).max(100),
  billing_cycle: z.enum(['monthly', 'yearly']).optional(),
});
const invoiceSchema = z.object({
  organization_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  description: z.string().min(1).max(1000),
  due_days: z.number().int().min(1).max(90).optional(),
});
const couponSchema = z.object({ organization_id: z.string().uuid(), code: z.string().min(1).max(100) });
const paymentMethodSchema = z.object({ organization_id: z.string().uuid(), payment_method_id: z.string().min(3).max(255) });

router.get('/plans', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const includeInactive = ['admin', 'superadmin'].includes(req.user!.role) && (req.query.all === 'true' || req.query.include_inactive === 'true');
    res.json({ success: true, data: await billingService.listPlans(includeInactive) });
  } catch (error) { next(error); }
});

router.get('/plans/:slug', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await billingService.getPlanBySlug(req.params.slug) }); }
  catch (error) { next(error); }
});

router.get('/subscription', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await billingService.getSubscription(String(req.query.organization_id)) }); }
  catch (error) { next(error); }
});

router.post('/subscription', requireOrganizationRole('owner', 'admin'), validateBody(subscriptionSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const result = await stripeBilling.createSubscriptionCheckout(
      req.body.organization_id,
      req.user!.userId,
      req.body.plan_slug,
      req.body.billing_cycle || 'monthly'
    );
    res.status(result.checkout_url ? 201 : 200).json({ success: true, data: result });
  } catch (error) { next(error); }
});

router.put('/subscription/cancel', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await stripeBilling.cancelSubscription(req.body.organization_id, req.body.immediately === true);
    res.json({ success: true, data: { message: 'Cancellation submitted to Stripe' } });
  } catch (error) { next(error); }
});

router.put('/subscription/change-plan', requireOrganizationRole('owner', 'admin'), validateBody(changePlanSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await stripeBilling.changeSubscriptionPlan(req.body.organization_id, req.body.plan_slug, req.body.billing_cycle || 'monthly');
    res.json({ success: true, data: { message: 'Subscription plan updated by Stripe' } });
  } catch (error) { next(error); }
});

router.put('/subscription/reactivate', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await stripeBilling.reactivateSubscription(req.body.organization_id);
    res.json({ success: true, data: { message: 'Subscription reactivated by Stripe' } });
  } catch (error) { next(error); }
});

router.post('/portal', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await stripeBilling.createBillingPortalSession(req.body.organization_id) }); }
  catch (error) { next(error); }
});

router.get('/usage', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await billingService.getCurrentUsage(String(req.query.organization_id)) }); }
  catch (error) { next(error); }
});

router.get('/usage/history', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await billingService.getUsage(String(req.query.organization_id), req.query.metric ? String(req.query.metric) : undefined) }); }
  catch (error) { next(error); }
});

router.get('/usage/check/:metric', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await billingService.checkLimit(String(req.query.organization_id), req.params.metric) }); }
  catch (error) { next(error); }
});

router.get('/invoices', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await billingService.listInvoices(String(req.query.organization_id)) }); }
  catch (error) { next(error); }
});

router.post('/invoices', requireOrganizationRole('owner', 'admin'), validateBody(invoiceSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.status(201).json({ success: true, data: await stripeBilling.createStripeInvoice(req.body.organization_id, req.body) }); }
  catch (error) { next(error); }
});

router.get('/invoices/:invoiceId/payment-link', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await stripeBilling.getInvoicePaymentUrl(String(req.query.organization_id), req.params.invoiceId) }); }
  catch (error) { next(error); }
});

router.get('/payment-methods', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await stripeBilling.listStripePaymentMethods(String(req.query.organization_id)) }); }
  catch (error) { next(error); }
});

router.post('/payment-methods/manage', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await stripeBilling.createBillingPortalSession(req.body.organization_id) }); }
  catch (error) { next(error); }
});

router.put('/payment-methods/default', requireOrganizationRole('owner', 'admin'), validateBody(paymentMethodSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await stripeBilling.setDefaultStripePaymentMethod(req.body.organization_id, req.body.payment_method_id);
    res.json({ success: true, data: { message: 'Default payment method updated by Stripe' } });
  } catch (error) { next(error); }
});

router.delete('/payment-methods/:paymentMethodId', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await stripeBilling.removeStripePaymentMethod(String(req.query.organization_id), req.params.paymentMethodId);
    res.json({ success: true, data: { message: 'Payment method removed by Stripe' } });
  } catch (error) { next(error); }
});

router.get('/tenant', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await billingService.getTenantSettings(String(req.query.organization_id)) }); }
  catch (error) { next(error); }
});

router.put('/tenant', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await billingService.updateTenantSettings(req.body.organization_id, req.body) }); }
  catch (error) { next(error); }
});

router.post('/coupons/redeem', requireOrganizationRole('owner', 'admin'), validateBody(couponSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await billingService.redeemCoupon(req.body.organization_id, req.body.code);
    res.json({ success: true, data: { message: 'Stripe promotion will be applied to the next checkout' } });
  } catch (error) { next(error); }
});

router.get('/events', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await billingService.getBillingEvents(String(req.query.organization_id), Number(req.query.limit || 50)) }); }
  catch (error) { next(error); }
});

export default router;
