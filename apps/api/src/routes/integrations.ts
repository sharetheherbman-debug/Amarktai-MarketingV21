import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as integrationService from '../services/integration.service';
import * as externalService from '../services/external-integrations.service';

const router = Router();
router.use(requireAuth);

function dateRange(input: Record<string, unknown>): { startDate: string; endDate: string } {
  const end = input.end_date ? new Date(String(input.end_date)) : new Date();
  const start = input.start_date ? new Date(String(input.start_date)) : new Date(end.getTime() - 29 * 86400000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('Invalid analytics date range');
  }
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

// ─── Providers and real connections ─────────────────────────────────────────

router.get('/providers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await externalService.listProviders(req.query.category as string) });
  } catch (error) { next(error); }
});

router.get('/connections', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await externalService.listConnections(orgId, req.query.category as string) });
  } catch (error) { next(error); }
});

router.get('/connections/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await externalService.getConnection(req.params.id, orgId) });
  } catch (error) { next(error); }
});

router.post('/connections', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.provider_slug || !req.body.name) {
      res.status(400).json({ success: false, error: { message: 'organization_id, provider_slug, and name required', code: 'BAD_REQUEST' } }); return;
    }
    const connection = await externalService.createConnection(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: connection });
  } catch (error) { next(error); }
});

router.put('/connections/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await externalService.updateConnection(req.params.id, orgId, req.body) });
  } catch (error) { next(error); }
});

router.delete('/connections/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await externalService.deleteConnection(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Connection deleted' } });
  } catch (error) { next(error); }
});

router.post('/connections/:id/test', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await externalService.testConnection(req.params.id, orgId) });
  } catch (error) { next(error); }
});

router.get('/health', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const connections = await externalService.listConnections(orgId);
    res.json({ success: true, data: connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      provider: connection.provider_slug,
      healthy: connection.health_status === 'healthy',
      error: connection.error_message,
    })) });
  } catch (error) { next(error); }
});

// ─── External analytics ──────────────────────────────────────────────────────

router.post('/analytics/connections/:id/sync', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const range = dateRange(req.body);
    res.json({ success: true, data: await externalService.syncAnalyticsConnection(req.params.id, orgId, range.startDate, range.endDate) });
  } catch (error) { next(error); }
});

router.get('/analytics/summary', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await externalService.listAnalyticsSummary(orgId) });
  } catch (error) { next(error); }
});

// ─── Advertising integrations ────────────────────────────────────────────────

router.post('/advertising/connections/:id/sync', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const range = dateRange(req.body);
    res.json({ success: true, data: await externalService.syncAdvertisingConnection(req.params.id, orgId, range.startDate, range.endDate) });
  } catch (error) { next(error); }
});

router.get('/advertising/campaigns', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await externalService.listAdvertisingCampaigns(orgId) });
  } catch (error) { next(error); }
});

// ─── Sync Logs ───────────────────────────────────────────────────────────────

router.get('/logs', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await integrationService.getSyncLogs(orgId, req.query.connection_id as string, parseInt(req.query.limit as string) || 50) });
  } catch (error) { next(error); }
});

// ─── Webhooks Incoming ───────────────────────────────────────────────────────

router.get('/webhooks/incoming', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await integrationService.listIncomingWebhooks(orgId) });
  } catch (error) { next(error); }
});

router.post('/webhooks/incoming', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.name || !req.body.endpoint_slug) {
      res.status(400).json({ success: false, error: { message: 'organization_id, name, and endpoint_slug required', code: 'BAD_REQUEST' } }); return;
    }
    res.status(201).json({ success: true, data: await integrationService.createIncomingWebhook(orgId, req.body) });
  } catch (error) { next(error); }
});

router.delete('/webhooks/incoming/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await integrationService.deleteIncomingWebhook(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Webhook deleted' } });
  } catch (error) { next(error); }
});

// ─── Webhooks Outgoing ───────────────────────────────────────────────────────

router.get('/webhooks/outgoing', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await integrationService.listOutgoingWebhooks(orgId) });
  } catch (error) { next(error); }
});

router.post('/webhooks/outgoing', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.name || !req.body.url) {
      res.status(400).json({ success: false, error: { message: 'organization_id, name, and url required', code: 'BAD_REQUEST' } }); return;
    }
    res.status(201).json({ success: true, data: await integrationService.createOutgoingWebhook(orgId, req.body) });
  } catch (error) { next(error); }
});

router.delete('/webhooks/outgoing/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await integrationService.deleteOutgoingWebhook(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Webhook deleted' } });
  } catch (error) { next(error); }
});

router.get('/webhooks/deliveries', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await integrationService.getWebhookDeliveries(orgId, req.query.webhook_id as string) });
  } catch (error) { next(error); }
});

// ─── Email Providers ─────────────────────────────────────────────────────────

router.get('/email-providers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await integrationService.listEmailProviders(orgId) });
  } catch (error) { next(error); }
});

router.post('/email-providers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.name || !req.body.provider_type) {
      res.status(400).json({ success: false, error: { message: 'organization_id, name, and provider_type required', code: 'BAD_REQUEST' } }); return;
    }
    res.status(201).json({ success: true, data: await integrationService.createEmailProvider(orgId, req.body) });
  } catch (error) { next(error); }
});

// ─── Import/Export ───────────────────────────────────────────────────────────

router.get('/import-export', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await integrationService.listImportExportJobs(orgId) });
  } catch (error) { next(error); }
});

router.post('/import-export', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.type || !req.body.entity_type || !req.body.format) {
      res.status(400).json({ success: false, error: { message: 'organization_id, type, entity_type, and format required', code: 'BAD_REQUEST' } }); return;
    }
    res.status(201).json({ success: true, data: await integrationService.createImportExportJob(orgId, req.body, req.user!.userId) });
  } catch (error) { next(error); }
});

router.get('/import-export/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    res.json({ success: true, data: await integrationService.getImportExportJob(req.params.id, orgId) });
  } catch (error) { next(error); }
});

export default router;
