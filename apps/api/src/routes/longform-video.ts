import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as longformService from '../services/longform-video.service';
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

export default router;
