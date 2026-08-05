import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as longformService from '../services/longform-video.service';
import * as renderService from '../services/render-queue.service';
import { query } from '../config/database';

const router = Router();
router.use(requireAuth);

// Helper: Verify organization membership
async function verifyOrgMembership(orgId: string, userId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  return result.rows.length > 0;
}

// Helper: Get org ID and verify membership
async function getOrgAndVerify(req: AuthRequest, source: 'query' | 'body' = 'query'): Promise<{ orgId: string; error?: string }> {
  const orgId = source === 'query' ? req.query.organization_id as string : req.body.organization_id;
  if (!orgId) return { orgId: '', error: 'organization_id required' };
  if (!await verifyOrgMembership(orgId, req.user!.userId)) return { orgId, error: 'Not a member of this organization' };
  return { orgId };
}

// ─── Projects ────────────────────────────────────────────────────────────────

router.get('/projects', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const projects = await longformService.listProjects(orgId);
    res.json({ success: true, data: projects });
  } catch (error) { next(error); }
});

router.get('/projects/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const project = await longformService.getProject(req.params.id, orgId);
    res.json({ success: true, data: project });
  } catch (error) { next(error); }
});

router.post('/projects', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    if (!req.body.name) {
      res.status(400).json({ success: false, error: { message: 'name required', code: 'BAD_REQUEST' } }); return;
    }
    const project = await longformService.createProject(orgId, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: project });
  } catch (error) { next(error); }
});

router.put('/projects/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const project = await longformService.updateProject(req.params.id, orgId, req.body);
    res.json({ success: true, data: project });
  } catch (error) { next(error); }
});

router.delete('/projects/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    await longformService.deleteProject(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Project deleted' } });
  } catch (error) { next(error); }
});

router.get('/projects/:id/stats', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const stats = await longformService.getProjectStats(req.params.id, orgId);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

// ─── Scenes ──────────────────────────────────────────────────────────────────

router.get('/projects/:projectId/scenes', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const scenes = await longformService.listScenes(req.params.projectId, orgId);
    res.json({ success: true, data: scenes });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/scenes', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const scene = await longformService.addScene(req.params.projectId, orgId, req.body);
    res.status(201).json({ success: true, data: scene });
  } catch (error) { next(error); }
});

router.put('/scenes/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const scene = await longformService.updateScene(req.params.id, orgId, req.body);
    res.json({ success: true, data: scene });
  } catch (error) { next(error); }
});

router.delete('/scenes/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    await longformService.deleteScene(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Scene deleted' } });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/scenes/reorder', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const sceneIds = req.body.scene_ids;
    if (!sceneIds) {
      res.status(400).json({ success: false, error: { message: 'scene_ids required', code: 'BAD_REQUEST' } }); return;
    }
    await longformService.reorderScenes(req.params.projectId, orgId, sceneIds);
    res.json({ success: true, data: { message: 'Scenes reordered' } });
  } catch (error) { next(error); }
});

router.post('/scenes/:id/generate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const scene = await longformService.generateScene(req.params.id, orgId);
    res.json({ success: true, data: scene });
  } catch (error) { next(error); }
});

// ─── Project Generation Orchestration ─────────────────────────────────────

router.post('/projects/:id/generate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const scenes = await longformService.listScenes(req.params.id, orgId);
    const pendingScenes = scenes.filter(s => s.status === 'pending' || s.status === 'failed');
    if (pendingScenes.length === 0) {
      res.json({ success: true, data: { message: 'No pending scenes to generate' } });
      return;
    }
    // Generate each pending scene sequentially
    for (const scene of pendingScenes) {
      await longformService.generateScene(scene.id, orgId);
    }
    res.json({ success: true, data: { message: `Started generation for ${pendingScenes.length} scenes` } });
  } catch (error) { next(error); }
});

router.post('/projects/:id/cancel', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const scenes = await longformService.listScenes(req.params.id, orgId);
    const generatingScenes = scenes.filter(s => s.status === 'generating');
    for (const scene of generatingScenes) {
      await longformService.updateScene(scene.id, orgId, { status: 'cancelled' });
    }
    res.json({ success: true, data: { message: `Cancelled ${generatingScenes.length} scenes` } });
  } catch (error) { next(error); }
});

router.post('/projects/:id/retry-failed', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const scenes = await longformService.listScenes(req.params.id, orgId);
    const failedScenes = scenes.filter(s => s.status === 'failed' && s.retry_count < 3);
    for (const scene of failedScenes) {
      await longformService.generateScene(scene.id, orgId);
    }
    res.json({ success: true, data: { message: `Retrying ${failedScenes.length} failed scenes` } });
  } catch (error) { next(error); }
});

router.get('/projects/:id/progress', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const stats = await longformService.getProjectStats(req.params.id, orgId);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

// ─── Renders ────────────────────────────────────────────────────────────────

router.post('/projects/:id/renders', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const render = await renderService.createRender(req.params.id, orgId);
    res.status(201).json({ success: true, data: render });
  } catch (error) { next(error); }
});

router.get('/projects/:id/renders', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const renders = await renderService.listRenders(req.params.id, orgId);
    res.json({ success: true, data: renders });
  } catch (error) { next(error); }
});

router.get('/renders/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const render = await renderService.getRender(req.params.id, orgId);
    res.json({ success: true, data: render });
  } catch (error) { next(error); }
});

router.post('/renders/:id/cancel', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req, 'body');
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    await renderService.cancelRender(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Render cancelled' } });
  } catch (error) { next(error); }
});

router.get('/renders/:id/events', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { orgId, error } = await getOrgAndVerify(req);
    if (error) { res.status(400).json({ success: false, error: { message: error, code: 'BAD_REQUEST' } }); return; }
    const events = await renderService.getRenderEvents(req.params.id, orgId);
    res.json({ success: true, data: events });
  } catch (error) { next(error); }
});

export default router;
