import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as workflowService from '../services/workflow-engine.service';
import * as socialService from '../services/social-publishing.service';
import * as hierarchyService from '../services/agent-hierarchy.service';
import * as toolSdk from '../services/tool-sdk.service';

const router = Router();
router.use(requireAuth);

// ─── Workflows ───────────────────────────────────────────────────────────────

router.get('/workflows', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const workflows = await workflowService.list(orgId, req.query.category as string);
    res.json({ success: true, data: workflows });
  } catch (error) { next(error); }
});

router.get('/workflows/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const workflow = await workflowService.getById(req.params.id, orgId);
    res.json({ success: true, data: workflow });
  } catch (error) { next(error); }
});

router.post('/workflows', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const workflow = await workflowService.create(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: workflow });
  } catch (error) { next(error); }
});

router.post('/workflows/:id/execute', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const execution = await workflowService.execute(req.params.id, orgId, req.body.input || {}, req.user!.userId);
    res.status(201).json({ success: true, data: execution });
  } catch (error) { next(error); }
});

router.get('/workflows/:id/executions', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const executions = await workflowService.getExecutions(req.params.id, orgId);
    res.json({ success: true, data: executions });
  } catch (error) { next(error); }
});

router.post('/workflows/seed-templates', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await workflowService.seedDefaultTemplates(orgId, req.user!.userId);
    res.json({ success: true, data: { message: 'Default workflow templates seeded' } });
  } catch (error) { next(error); }
});

// ─── Social Publishing ───────────────────────────────────────────────────────

router.get('/social/connections', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const connections = await socialService.listConnections(orgId);
    res.json({ success: true, data: connections });
  } catch (error) { next(error); }
});

router.post('/social/connections', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, platform, account_name, config, credentials } = req.body;
    if (!organization_id || !platform || !account_name) { res.status(400).json({ success: false, error: { message: 'organization_id, platform, and account_name required', code: 'BAD_REQUEST' } }); return; }
    const connection = await socialService.addConnection(organization_id, platform, account_name, config || {}, credentials || {});
    res.status(201).json({ success: true, data: connection });
  } catch (error) { next(error); }
});

router.put('/social/connections/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.body.organization_id || req.query.organization_id as string;
    if (!organizationId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const connection = await socialService.updateConnection(req.params.id, organizationId, req.body);
    res.json({ success: true, data: connection });
  } catch (error) { next(error); }
});

router.delete('/social/connections/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.query.organization_id as string;
    if (!organizationId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await socialService.removeConnection(req.params.id, organizationId);
    res.json({ success: true, data: { message: 'Social connection deleted' } });
  } catch (error) { next(error); }
});

router.post('/social/connections/:id/test', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.body.organization_id || req.query.organization_id as string;
    if (!organizationId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const result = await socialService.testConnection(req.params.id, organizationId);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

router.post('/social/posts', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, connection_id, body, content_id, campaign_id, media_urls, hashtags, scheduled_at, publish_now } = req.body;
    if (!organization_id || !connection_id || !body) { res.status(400).json({ success: false, error: { message: 'organization_id, connection_id, and body required', code: 'BAD_REQUEST' } }); return; }
    const post = await socialService.schedulePost(organization_id, connection_id, body, { content_id, campaign_id, media_urls, hashtags, scheduled_at });
    const result = publish_now ? await socialService.publishPost(post.id, organization_id) : post;
    res.status(201).json({ success: true, data: result });
  } catch (error) { next(error); }
});

router.post('/social/posts/:id/publish', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const post = await socialService.publishPost(req.params.id, orgId);
    res.json({ success: true, data: post });
  } catch (error) { next(error); }
});

router.get('/social/posts', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const posts = await socialService.listPosts(orgId, { platform: req.query.platform as string, status: req.query.status as string });
    res.json({ success: true, data: posts });
  } catch (error) { next(error); }
});

// ─── Agent Hierarchy ─────────────────────────────────────────────────────────

router.get('/hierarchy', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const hierarchy = await hierarchyService.buildHierarchy(orgId);
    res.json({ success: true, data: hierarchy });
  } catch (error) { next(error); }
});

router.post('/hierarchy/assign', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, agent_id, role, parent_id } = req.body;
    if (!organization_id || !agent_id || !role) { res.status(400).json({ success: false, error: { message: 'organization_id, agent_id, and role required', code: 'BAD_REQUEST' } }); return; }
    const node = await hierarchyService.assignAgent(organization_id, agent_id, role, parent_id);
    res.status(201).json({ success: true, data: node });
  } catch (error) { next(error); }
});

router.post('/hierarchy/init', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    await hierarchyService.initializeDefaultHierarchy(orgId);
    res.json({ success: true, data: { message: 'Default hierarchy initialized' } });
  } catch (error) { next(error); }
});

// ─── Tool SDK ────────────────────────────────────────────────────────────────

router.get('/tools', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const tools = await toolSdk.listIntegrations(orgId);
    res.json({ success: true, data: tools });
  } catch (error) { next(error); }
});

router.post('/tools', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const tool = await toolSdk.addIntegration(orgId, req.body);
    res.status(201).json({ success: true, data: tool });
  } catch (error) { next(error); }
});

router.get('/tools/health', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const health = await toolSdk.checkAllHealth(orgId);
    res.json({ success: true, data: health });
  } catch (error) { next(error); }
});

export default router;
