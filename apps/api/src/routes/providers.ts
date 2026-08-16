import { Router, Response, NextFunction } from 'express';
import * as usageService from '../services/usage.service';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { requireOrganizationMembership } from '../middleware/organization-access';
import { ApiResponse } from '../types';
import { providerRouter } from '../providers/provider-router';

const router = Router();
router.use(requireAuth);

// Workspace users may inspect only their own aggregate usage. No workspace or
// platform user may create, replace, reveal, toggle or delete provider keys.
router.get('/usage', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;
    const startDate = req.query.start_date
      ? new Date(req.query.start_date as string)
      : new Date(new Date().setDate(1));
    const endDate = req.query.end_date ? new Date(req.query.end_date as string) : new Date();
    const usage = await usageService.getUsageByOrg(orgId, startDate, endDate);
    res.json({ success: true, data: usage });
  } catch (error) {
    next(error);
  }
});

router.use(requireRole('admin', 'superadmin'));

/**
 * Read-only provider policy. Credentials are sourced from the VPS environment,
 * and the authenticated catalogue/pricing controls live under /admin/genx.
 */
router.get('/', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    res.json({
      success: true,
      data: {
        policy: 'genx_only',
        provider: 'genx',
        credential_source: 'server_environment',
        customer_key_management: false,
        fallback_providers: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/health', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    res.json({ success: true, data: await providerRouter.getHealthStatus() });
  } catch (error) {
    next(error);
  }
});

export default router;
