import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as seoService from '../services/seo.service';

const router = Router();
router.use(requireAuth);

router.get('/keywords', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const keywords = await seoService.listKeywords(orgId);
    res.json({ success: true, data: keywords });
  } catch (error) { next(error); }
});

router.post('/keywords/research', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, seed, count } = req.body;
    if (!organization_id || !seed) { res.status(400).json({ success: false, error: { message: 'organization_id and seed required', code: 'BAD_REQUEST' } }); return; }
    const results = await seoService.researchKeywords(organization_id, seed, count);
    res.json({ success: true, data: results });
  } catch (error) { next(error); }
});

router.post('/keywords/save', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, keywords } = req.body;
    if (!organization_id || !keywords) { res.status(400).json({ success: false, error: { message: 'organization_id and keywords required', code: 'BAD_REQUEST' } }); return; }
    await seoService.saveKeywords(organization_id, keywords);
    res.json({ success: true, data: { message: 'Keywords saved' } });
  } catch (error) { next(error); }
});

router.post('/keywords/cluster', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, keywords } = req.body;
    if (!organization_id || !keywords) { res.status(400).json({ success: false, error: { message: 'organization_id and keywords required', code: 'BAD_REQUEST' } }); return; }
    const clusters = await seoService.clusterKeywords(organization_id, keywords);
    res.json({ success: true, data: clusters });
  } catch (error) { next(error); }
});

router.post('/audit', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, url } = req.body;
    if (!organization_id || !url) { res.status(400).json({ success: false, error: { message: 'organization_id and url required', code: 'BAD_REQUEST' } }); return; }
    const audit = await seoService.auditUrl(organization_id, url, req.user!.userId);
    res.json({ success: true, data: audit });
  } catch (error) { next(error); }
});

router.get('/audits', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id required', code: 'BAD_REQUEST' } }); return; }
    const audits = await seoService.listAudits(orgId);
    res.json({ success: true, data: audits });
  } catch (error) { next(error); }
});

router.post('/meta/generate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, topic, keywords } = req.body;
    if (!organization_id || !topic) { res.status(400).json({ success: false, error: { message: 'organization_id and topic required', code: 'BAD_REQUEST' } }); return; }
    const meta = await seoService.generateMeta(organization_id, topic, keywords || []);
    res.json({ success: true, data: meta });
  } catch (error) { next(error); }
});

router.post('/content/optimize', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const { organization_id, content, keywords } = req.body;
    if (!organization_id || !content) { res.status(400).json({ success: false, error: { message: 'organization_id and content required', code: 'BAD_REQUEST' } }); return; }
    const result = await seoService.optimizeContent(organization_id, content, keywords || []);
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});

export default router;
