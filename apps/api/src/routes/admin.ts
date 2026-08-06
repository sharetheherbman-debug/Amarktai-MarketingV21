import { Router, Response, NextFunction } from 'express';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as platformOps from '../services/platform-ops.service';
import * as featureFlags from '../services/feature-flags.service';
import * as licensing from '../services/licensing.service';

const router = Router();

router.use(requireAuth, requireRole('admin', 'superadmin'));

router.get('/health', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await platformOps.getSystemHealth() }); }
  catch (error) { next(error); }
});

router.get('/metrics', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await platformOps.getSystemMetrics() }); }
  catch (error) { next(error); }
});

router.get('/providers/status', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await platformOps.getProviderStatuses() }); }
  catch (error) { next(error); }
});

router.get('/queues', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await platformOps.getQueueStatuses() }); }
  catch (error) { next(error); }
});

router.get('/tenants', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const tenants = await platformOps.listTenants({
      status: req.query.status as string,
      plan: req.query.plan as string,
      limit: Math.min(parseInt(req.query.limit as string) || 100, 500),
    });
    res.json({ success: true, data: tenants });
  } catch (error) { next(error); }
});

router.get('/tenants/:orgId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await platformOps.getTenantDetails(req.params.orgId) }); }
  catch (error) { next(error); }
});

router.get('/audit-logs', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const result = await platformOps.getAuditLogs(req.query.organization_id as string, {
      action: req.query.action as string,
      entity_type: req.query.entity_type as string,
      user_id: req.query.user_id as string,
      limit: Math.min(parseInt(req.query.limit as string) || 50, 500),
      offset: Math.max(parseInt(req.query.offset as string) || 0, 0),
    });
    res.json({ success: true, data: result.logs, meta: { total: result.total } });
  } catch (error) { next(error); }
});

router.get('/feature-flags', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await featureFlags.listFlags() }); }
  catch (error) { next(error); }
});

router.post('/feature-flags', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.status(201).json({ success: true, data: await featureFlags.createFlag(req.body) }); }
  catch (error) { next(error); }
});

router.put('/feature-flags/:key', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await featureFlags.updateFlag(req.params.key, req.body) }); }
  catch (error) { next(error); }
});

router.delete('/feature-flags/:key', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    await featureFlags.deleteFlag(req.params.key);
    res.json({ success: true, data: { message: 'Feature flag deleted' } });
  } catch (error) { next(error); }
});

router.post('/feature-flags/seed', async (_req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    await featureFlags.seedDefaultFlags();
    res.json({ success: true, data: { message: 'Default flags seeded' } });
  } catch (error) { next(error); }
});

router.get('/licensing/validate/:orgId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await licensing.validateLicense(req.params.orgId) }); }
  catch (error) { next(error); }
});

router.get('/licensing/overages/:orgId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await licensing.detectOverages(req.params.orgId) }); }
  catch (error) { next(error); }
});

router.get('/announcements', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.json({ success: true, data: await platformOps.listAnnouncements(req.query.active !== 'false') }); }
  catch (error) { next(error); }
});

router.post('/announcements', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try { res.status(201).json({ success: true, data: await platformOps.createAnnouncement(req.body) }); }
  catch (error) { next(error); }
});

export default router;
