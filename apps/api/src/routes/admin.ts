import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as platformOps from '../services/platform-ops.service';
import * as featureFlags from '../services/feature-flags.service';
import * as licensing from '../services/licensing.service';

const router = Router();

router.use(requireAuth);

// ─── System Health ───────────────────────────────────────────────────────────

router.get('/health', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const health = await platformOps.getSystemHealth();
    res.json({ success: true, data: health });
  } catch (error) { next(error); }
});

router.get('/metrics', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const metrics = await platformOps.getSystemMetrics();
    res.json({ success: true, data: metrics });
  } catch (error) { next(error); }
});

// ─── Provider Status ─────────────────────────────────────────────────────────

router.get('/providers/status', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const providers = await platformOps.getProviderStatuses();
    res.json({ success: true, data: providers });
  } catch (error) { next(error); }
});

// ─── Queue Status ────────────────────────────────────────────────────────────

router.get('/queues', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const queues = await platformOps.getQueueStatuses();
    res.json({ success: true, data: queues });
  } catch (error) { next(error); }
});

// ─── Tenant Management ───────────────────────────────────────────────────────

router.get('/tenants', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const tenants = await platformOps.listTenants({
      status: req.query.status as string,
      plan: req.query.plan as string,
      limit: parseInt(req.query.limit as string) || 100,
    });
    res.json({ success: true, data: tenants });
  } catch (error) { next(error); }
});

router.get('/tenants/:orgId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const details = await platformOps.getTenantDetails(req.params.orgId);
    res.json({ success: true, data: details });
  } catch (error) { next(error); }
});

// ─── Audit Logs ──────────────────────────────────────────────────────────────

router.get('/audit-logs', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const result = await platformOps.getAuditLogs(req.query.organization_id as string, {
      action: req.query.action as string,
      entity_type: req.query.entity_type as string,
      user_id: req.query.user_id as string,
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    });
    res.json({ success: true, data: result.logs, meta: { total: result.total } });
  } catch (error) { next(error); }
});

// ─── Feature Flags ───────────────────────────────────────────────────────────

router.get('/feature-flags', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const flags = await featureFlags.listFlags();
    res.json({ success: true, data: flags });
  } catch (error) { next(error); }
});

router.post('/feature-flags', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const flag = await featureFlags.createFlag(req.body);
    res.status(201).json({ success: true, data: flag });
  } catch (error) { next(error); }
});

router.put('/feature-flags/:key', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const flag = await featureFlags.updateFlag(req.params.key, req.body);
    res.json({ success: true, data: flag });
  } catch (error) { next(error); }
});

router.delete('/feature-flags/:key', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    await featureFlags.deleteFlag(req.params.key);
    res.json({ success: true, data: { message: 'Feature flag deleted' } });
  } catch (error) { next(error); }
});

router.post('/feature-flags/seed', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    await featureFlags.seedDefaultFlags();
    res.json({ success: true, data: { message: 'Default flags seeded' } });
  } catch (error) { next(error); }
});

// ─── Licensing ───────────────────────────────────────────────────────────────

router.get('/licensing/validate/:orgId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const validation = await licensing.validateLicense(req.params.orgId);
    res.json({ success: true, data: validation });
  } catch (error) { next(error); }
});

router.get('/licensing/overages/:orgId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const overages = await licensing.detectOverages(req.params.orgId);
    res.json({ success: true, data: overages });
  } catch (error) { next(error); }
});

// ─── Announcements ───────────────────────────────────────────────────────────

router.get('/announcements', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const announcements = await platformOps.listAnnouncements(req.query.active !== 'false');
    res.json({ success: true, data: announcements });
  } catch (error) { next(error); }
});

router.post('/announcements', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const announcement = await platformOps.createAnnouncement(req.body);
    res.status(201).json({ success: true, data: announcement });
  } catch (error) { next(error); }
});

export default router;
