import { Router, Response, NextFunction } from 'express';
import * as whiteLabelService from '../services/white-label.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { ApiResponse } from '../types';
import { z } from 'zod';

const router = Router();

router.use(requireAuth);

const updateWhiteLabelSchema = z.object({
  brand_name: z.string().max(255).optional(),
  brand_logo: z.string().optional(),
  brand_favicon: z.string().optional(),
  brand_colors: z.record(z.unknown()).optional(),
  brand_font: z.string().max(100).optional(),
  custom_css: z.string().optional(),
  email_branding: z.record(z.unknown()).optional(),
  login_page_config: z.record(z.unknown()).optional(),
  sidebar_config: z.record(z.unknown()).optional(),
  removed_branding: z.boolean().optional(),
  custom_footer: z.string().optional(),
  support_email: z.string().email().optional(),
  support_url: z.string().optional(),
  terms_url: z.string().optional(),
  privacy_url: z.string().optional(),
});

const addDomainSchema = z.object({
  domain: z.string().min(1).max(255),
  target_cname: z.string().optional(),
  is_primary: z.boolean().optional(),
});

const createPortalSchema = z.object({
  client_organization_id: z.string().uuid(),
  portal_name: z.string().min(1).max(255),
  custom_domain: z.string().optional(),
  subdomain: z.string().optional(),
  branding: z.record(z.unknown()).optional(),
  features: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
});

// White Label Config
router.get('/config', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const config = await whiteLabelService.getWhiteLabelConfig(req.query.organization_id as string);
    res.json({ success: true, data: config });
  } catch (error) { next(error); }
});

router.put('/config', validateBody(updateWhiteLabelSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const config = await whiteLabelService.updateWhiteLabelConfig(req.body.organization_id, req.body);
    res.json({ success: true, data: config });
  } catch (error) { next(error); }
});

// Custom Domains
router.get('/domains', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const domains = await whiteLabelService.getCustomDomains(req.query.organization_id as string);
    res.json({ success: true, data: domains });
  } catch (error) { next(error); }
});

router.post('/domains', validateBody(addDomainSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const domain = await whiteLabelService.addCustomDomain(req.body.organization_id, req.body);
    res.status(201).json({ success: true, data: domain });
  } catch (error) { next(error); }
});

router.post('/domains/:domainId/verify', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const domain = await whiteLabelService.verifyCustomDomain(req.params.domainId, req.body.organization_id);
    res.json({ success: true, data: domain });
  } catch (error) { next(error); }
});

router.delete('/domains/:domainId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await whiteLabelService.removeCustomDomain(req.params.domainId, req.query.organization_id as string);
    res.json({ success: true, data: { message: 'Domain removed' } });
  } catch (error) { next(error); }
});

// Client Portals
router.get('/portals', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const portals = await whiteLabelService.getClientPortals(req.query.agency_id as string);
    res.json({ success: true, data: portals });
  } catch (error) { next(error); }
});

router.post('/portals', validateBody(createPortalSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const portal = await whiteLabelService.createClientPortal(req.body.agency_id, req.body);
    res.status(201).json({ success: true, data: portal });
  } catch (error) { next(error); }
});

router.put('/portals/:portalId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const portal = await whiteLabelService.updateClientPortal(req.params.portalId, req.body.agency_id, req.body);
    res.json({ success: true, data: portal });
  } catch (error) { next(error); }
});

router.delete('/portals/:portalId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await whiteLabelService.removeClientPortal(req.params.portalId, req.query.agency_id as string);
    res.json({ success: true, data: { message: 'Portal removed' } });
  } catch (error) { next(error); }
});

// Portal Access Logs
router.get('/portals/:portalId/logs', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await whiteLabelService.getPortalAccessLogs(req.params.portalId, limit);
    res.json({ success: true, data: logs });
  } catch (error) { next(error); }
});

export default router;
