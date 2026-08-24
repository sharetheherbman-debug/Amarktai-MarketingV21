import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as longformService from '../services/longform-video.service';
import * as generationService from '../services/longform-queue.service';
import * as renderService from '../services/render-runtime.service';
import { query } from '../config/database';

const router = Router();
router.use(requireAuth);

async function verifyOrgMembership(orgId: string, userId: string): Promise<boolean> {
  const result = await query(
    'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  return result.rows.length > 0;
}

async function resolveOrg(req: AuthRequest, source: 'query' | 'body' = 'query') {
  const orgId = String(source === 'query' ? req.query.organization_id || '' : req.body.organization_id || '');
  if (!orgId) return { status: 400, error: 'organization_id required', orgId: '' };
  if (!await verifyOrgMembership(orgId, req.user!.userId)) {
    return { status: 403, error: 'Not a member of this organization', orgId };
  }
  return { status: 200, orgId };
}

function fail(res: Response<ApiResponse>, status: number, message: string) {
  res.status(status).json({ success: false, error: { message, code: status === 403 ? 'FORBIDDEN' : 'BAD_REQUEST' } });
}

router.get('/projects', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await longformService.listProjects(auth.orgId) });
  } catch (error) { next(error); }
});

router.get('/projects/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await longformService.getProject(req.params.id, auth.orgId) });
  } catch (error) { next(error); }
});

router.post('/projects', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    if (!req.body.name) return fail(res, 400, 'name required');
    const project = await longformService.createProject(auth.orgId, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: project });
  } catch (error) { next(error); }
});

router.put('/projects/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await longformService.updateProject(req.params.id, auth.orgId, req.body) });
  } catch (error) { next(error); }
});

router.delete('/projects/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    await longformService.deleteProject(req.params.id, auth.orgId);
    res.json({ success: true, data: { message: 'Project deleted' } });
  } catch (error) { next(error); }
});

router.get('/projects/:projectId/scenes', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await longformService.listScenes(req.params.projectId, auth.orgId) });
  } catch (error) { next(error); }
});

router.post('/projects/:projectId/scenes', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    await longformService.getProject(req.params.projectId, auth.orgId);
    const scene = await longformService.addScene(req.params.projectId, auth.orgId, req.body);
    res.status(201).json({ success: true, data: scene });
  } catch (error) { next(error); }
});

router.put('/scenes/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await longformService.updateScene(req.params.id, auth.orgId, req.body) });
  } catch (error) { next(error); }
});

router.delete('/scenes/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    await longformService.deleteScene(req.params.id, auth.orgId);
    res.json({ success: true, data: { message: 'Scene deleted' } });
  } catch (error) { next(error); }
});

router.put('/projects/:projectId/scenes/reorder', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    if (!Array.isArray(req.body.scene_ids)) return fail(res, 400, 'scene_ids required');
    await longformService.getProject(req.params.projectId, auth.orgId);
    await longformService.reorderScenes(req.params.projectId, auth.orgId, req.body.scene_ids);
    res.json({ success: true, data: { message: 'Scenes reordered' } });
  } catch (error) { next(error); }
});

router.post('/scenes/:id/generate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    const scene = await generationService.enqueueSceneGeneration(req.params.id, auth.orgId);
    res.status(202).json({ success: true, data: scene });
  } catch (error) { next(error); }
});

router.post('/projects/:id/quote', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await generationService.quoteProjectGeneration(req.params.id, auth.orgId) });
  } catch (error) { next(error); }
});

router.post('/projects/:id/generate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    res.status(202).json({ success: true, data: await generationService.enqueueProjectGeneration(
      req.params.id,
      auth.orgId,
      req.body.idempotency_key ? String(req.body.idempotency_key) : undefined
    ) });
  } catch (error) { next(error); }
});

router.post('/projects/:id/cancel', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await generationService.cancelProjectGeneration(req.params.id, auth.orgId) });
  } catch (error) { next(error); }
});

router.post('/projects/:id/retry-failed', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    res.status(202).json({ success: true, data: await generationService.retryFailedScenes(req.params.id, auth.orgId) });
  } catch (error) { next(error); }
});

router.get('/projects/:id/progress', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await generationService.getProjectProgress(req.params.id, auth.orgId) });
  } catch (error) { next(error); }
});

router.post('/projects/:id/renders', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    const render = await renderService.createRender(
      req.params.id,
      auth.orgId,
      req.body.idempotency_key ? String(req.body.idempotency_key) : undefined
    );
    res.status(202).json({ success: true, data: render });
  } catch (error) { next(error); }
});

router.get('/projects/:id/renders', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await renderService.listRenders(req.params.id, auth.orgId) });
  } catch (error) { next(error); }
});

router.get('/renders/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await renderService.getRender(req.params.id, auth.orgId) });
  } catch (error) { next(error); }
});

router.post('/renders/:id/cancel', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req, 'body');
    if (auth.error) return fail(res, auth.status, auth.error);
    await renderService.cancelRender(req.params.id, auth.orgId);
    res.json({ success: true, data: { message: 'Render cancelled' } });
  } catch (error) { next(error); }
});

router.get('/renders/:id/events', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const auth = await resolveOrg(req);
    if (auth.error) return fail(res, auth.status, auth.error);
    res.json({ success: true, data: await renderService.getRenderEvents(req.params.id, auth.orgId) });
  } catch (error) { next(error); }
});

export default router;
