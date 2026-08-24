import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { requireOrganizationRole } from '../middleware/organization-access';
import { ApiResponse } from '../types';
import * as credits from '../services/generation-credit.service';
import * as creditStripe from '../services/generation-credit-stripe.service';
import { env } from '../config/env';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const checkoutSchema = z.object({
  organization_id: z.string().uuid(),
  pack_code: z.string().trim().min(1).max(100),
});

router.get('/packs', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await creditStripe.listCreditPacks() });
  } catch (error) { next(error); }
});

router.get('/wallet', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await credits.getWallet(req.organizationId!) });
  } catch (error) { next(error); }
});

router.get('/activity', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await credits.getCreditActivity(req.organizationId!, String(req.query.since || '')) });
  } catch (error) { next(error); }
});

router.post(
  '/checkout',
  requireOrganizationRole('owner', 'admin'),
  async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
    try {
      if (!env.MARKETING_CREDIT_SALES_ENABLED) {
        throw new AppError(503, 'Marketing commercial credit purchases are not enabled', 'MARKETING_CREDIT_SALES_DISABLED');
      }
      const input = checkoutSchema.parse(req.body);
      const checkout = await creditStripe.createCreditCheckout({
        organizationId: input.organization_id,
        userId: req.user!.userId,
        packCode: input.pack_code,
      });
      res.status(201).json({ success: true, data: checkout });
    } catch (error) { next(error); }
  }
);

export default router;
