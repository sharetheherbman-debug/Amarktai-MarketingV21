import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as contentEngine from '../services/content-engine.service';
import * as contentQuality from '../services/content-quality.service';
import * as contentWorkflow from '../services/content-workflow.service';
import { requireOrganizationRole } from '../middleware/organization-access';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const items = await contentEngine.list(orgId, {
      type: req.query.type as string,
      status: req.query.status as string,
      platform: req.query.platform as string,
      campaign_id: req.query.campaign_id as string,
    });
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
});

router.get('/workflow/approval-queue', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const queue = await contentWorkflow.getApprovalQueue(orgId);
    res.json({ success: true, data: queue });
  } catch (error) { next(error); }
});

router.get('/reuse/candidates', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await contentEngine.findReusableContent(req.organizationId!, {
      query: req.query.q ? String(req.query.q) : undefined,
      type: req.query.type ? String(req.query.type) : undefined,
      platform: req.query.platform ? String(req.query.platform) : undefined,
      limit: Number(req.query.limit || 10),
    }) });
  } catch (error) { next(error); }
});

router.post('/generate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const result = await contentEngine.generateContent(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const item = await contentEngine.getById(req.params.id, orgId);
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
});

router.post('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const item = await contentEngine.create(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: item });
  } catch (error) { next(error); }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const item = await contentEngine.update(req.params.id, orgId, req.body, req.user!.userId);
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    await contentEngine.remove(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Content deleted' } });
  } catch (error) { next(error); }
});

router.get('/:id/versions', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const versions = await contentEngine.getVersions(req.params.id, orgId);
    res.json({ success: true, data: versions });
  } catch (error) { next(error); }
});

router.post('/:id/versions/:version/restore', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    const version = Number(req.params.version);
    if (!orgId || !Number.isSafeInteger(version) || version < 1) {
      res.status(400).json({ success: false, error: { message: 'organization_id and a valid version are required', code: 'BAD_REQUEST' } }); return;
    }
    const content = await contentEngine.restoreVersion(req.params.id, orgId, version, req.user!.userId);
    res.json({ success: true, data: content });
  } catch (error) { next(error); }
});

router.post('/:id/duplicate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = String(req.body.organization_id || '');
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    res.status(201).json({ success: true, data: await contentEngine.duplicateContent(req.params.id, orgId, req.user!.userId) });
  } catch (error) { next(error); }
});

router.post('/:id/adapt', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    res.status(201).json({ success: true, data: await contentEngine.adaptContent(
      req.params.id, req.organizationId!, req.user!.userId, req.body
    ) });
  } catch (error) { next(error); }
});

router.post('/:id/revise', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = String(req.body.organization_id || '');
    if (!orgId || !String(req.body.instruction || '').trim()) {
      res.status(400).json({ success: false, error: { message: 'organization_id and instruction are required', code: 'BAD_REQUEST' } }); return;
    }
    res.json({ success: true, data: await contentEngine.reviseContent(req.params.id, orgId, req.user!.userId, {
      instruction: String(req.body.instruction),
      selected_text: req.body.selected_text ? String(req.body.selected_text) : undefined,
      idempotency_key: req.body.idempotency_key ? String(req.body.idempotency_key) : undefined,
    }) });
  } catch (error) { next(error); }
});

router.post('/:id/quality-check', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const report = await contentQuality.runQualityChecks(req.params.id, orgId);
    res.json({ success: true, data: report });
  } catch (error) { next(error); }
});

router.get('/:id/quality-checks', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const checks = await contentQuality.getQualityChecks(req.params.id, orgId);
    res.json({ success: true, data: checks });
  } catch (error) { next(error); }
});

router.post('/:id/submit', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    const assignedTo = req.body.assigned_to || req.user!.userId;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const approval = await contentWorkflow.submitForReview(req.params.id, orgId, assignedTo, req.user!.userId);
    res.json({ success: true, data: approval });
  } catch (error) { next(error); }
});

router.post('/:id/approve', requireOrganizationRole('owner'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    const approval = await contentWorkflow.approve(req.params.id, orgId, req.user!.userId, req.body.comments);
    res.json({ success: true, data: approval });
  } catch (error) { next(error); }
});

router.post('/:id/reject', requireOrganizationRole('owner'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.comments) { res.status(400).json({ success: false, error: { message: 'organization_id and comments are required', code: 'BAD_REQUEST' } }); return; }
    const approval = await contentWorkflow.reject(req.params.id, orgId, req.user!.userId, req.body.comments);
    res.json({ success: true, data: approval });
  } catch (error) { next(error); }
});

router.post('/:id/request-changes', requireOrganizationRole('owner'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId || !req.body.comments) { res.status(400).json({ success: false, error: { message: 'organization_id and comments are required', code: 'BAD_REQUEST' } }); return; }
    const approval = await contentWorkflow.requestChanges(req.params.id, orgId, req.user!.userId, req.body.comments);
    res.json({ success: true, data: approval });
  } catch (error) { next(error); }
});

router.post('/:id/publish', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    await contentWorkflow.publish(req.params.id, orgId, req.user!.userId);
    res.json({ success: true, data: { message: 'Content published' } });
  } catch (error) { next(error); }
});

router.post('/:id/archive', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }
    await contentWorkflow.archive(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Content archived' } });
  } catch (error) { next(error); }
});

export default router;
