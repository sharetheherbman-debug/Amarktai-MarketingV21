import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as integrationService from '../services/integration.service';

const router = Router();
router.use(requireAuth);

// ─── Providers ───────────────────────────────────────────────────────────────

router.get('/providers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const providers = await integrationService.listProviders(req.query.category as string);
    res.json({ success: true, data: providers });
  } catch (error) { next(error); }
});

// ─── Connections ─────────────────────────────────────────────────────────────

router.get('/connections', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const connections = await integrationService.listConnections(orgId, req.query.category as string);
    res.json({ success: true, data: connections });
  } catch (error) { next(error); }
});

router.get('/connections/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const connection = await integrationService.getConnectionById(req.params.id, orgId);
    res.json({ success: true, data: connection });
  } catch (error) { next(error); }
});

router.post('/connections', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.provider_slug || !req.body.name) {
      res.status(400).json({ success: false, error: { message: 'organization_id, provider_slug, and name required', code: 'BAD_REQUEST' } }); return;
    }
    const connection = await integrationService.createConnection(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: connection });
  } catch (error) { next(error); }
});

router.put('/connections/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const connection = await integrationService.updateConnection(req.params.id, orgId, req.body);
    res.json({ success: true, data: connection });
  } catch (error) { next(error); }
});

router.delete('/connections/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await integrationService.deleteConnection(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Connection deleted' } });
  } catch (error) { next(error); }
});

router.post('/connections/:id/test', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const result = await integrationService.testConnection(req.params.id, orgId);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

router.get('/health', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const health = await integrationService.healthCheck(orgId);
    res.json({ success: true, data: health });
  } catch (error) { next(error); }
});

// ─── Sync Logs ───────────────────────────────────────────────────────────────

router.get('/logs', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const logs = await integrationService.getSyncLogs(orgId, req.query.connection_id as string, parseInt(req.query.limit as string) || 50);
    res.json({ success: true, data: logs });
  } catch (error) { next(error); }
});

// ─── Webhooks Incoming ───────────────────────────────────────────────────────

router.get('/webhooks/incoming', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const webhooks = await integrationService.listIncomingWebhooks(orgId);
    res.json({ success: true, data: webhooks });
  } catch (error) { next(error); }
});

router.post('/webhooks/incoming', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.name || !req.body.endpoint_slug) {
      res.status(400).json({ success: false, error: { message: 'organization_id, name, and endpoint_slug required', code: 'BAD_REQUEST' } }); return;
    }
    const webhook = await integrationService.createIncomingWebhook(orgId, req.body);
    res.status(201).json({ success: true, data: webhook });
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
    const webhooks = await integrationService.listOutgoingWebhooks(orgId);
    res.json({ success: true, data: webhooks });
  } catch (error) { next(error); }
});

router.post('/webhooks/outgoing', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.name || !req.body.url) {
      res.status(400).json({ success: false, error: { message: 'organization_id, name, and url required', code: 'BAD_REQUEST' } }); return;
    }
    const webhook = await integrationService.createOutgoingWebhook(orgId, req.body);
    res.status(201).json({ success: true, data: webhook });
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
    const deliveries = await integrationService.getWebhookDeliveries(orgId, req.query.webhook_id as string);
    res.json({ success: true, data: deliveries });
  } catch (error) { next(error); }
});

// ─── Email Providers ─────────────────────────────────────────────────────────

router.get('/email-providers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const providers = await integrationService.listEmailProviders(orgId);
    res.json({ success: true, data: providers });
  } catch (error) { next(error); }
});

router.post('/email-providers', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.name || !req.body.provider_type) {
      res.status(400).json({ success: false, error: { message: 'organization_id, name, and provider_type required', code: 'BAD_REQUEST' } }); return;
    }
    const provider = await integrationService.createEmailProvider(orgId, req.body);
    res.status(201).json({ success: true, data: provider });
  } catch (error) { next(error); }
});

// ─── Import/Export ───────────────────────────────────────────────────────────

router.get('/import-export', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const jobs = await integrationService.listImportExportJobs(orgId);
    res.json({ success: true, data: jobs });
  } catch (error) { next(error); }
});

router.post('/import-export', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.type || !req.body.entity_type || !req.body.format) {
      res.status(400).json({ success: false, error: { message: 'organization_id, type, entity_type, and format required', code: 'BAD_REQUEST' } }); return;
    }
    const job = await integrationService.createImportExportJob(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: job });
  } catch (error) { next(error); }
});

router.get('/import-export/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const job = await integrationService.getImportExportJob(req.params.id, orgId);
    res.json({ success: true, data: job });
  } catch (error) { next(error); }
});

export default router;
