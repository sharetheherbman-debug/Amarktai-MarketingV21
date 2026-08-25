import { Router, Response, NextFunction } from 'express';
import * as whiteLabelService from '../services/white-label.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireOrganizationMembership, requireOrganizationRole } from '../middleware/organization-access';
import { requireAgencyAccess } from '../middleware/agency-access';
import { validateBody } from '../middleware/validator';
import { ApiResponse } from '../types';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const updateWhiteLabelSchema = z.object({
  organization_id: z.string().uuid(),
  brand_name: z.string().max(255).optional(), brand_logo: z.string().optional(), brand_favicon: z.string().optional(),
  brand_colors: z.record(z.unknown()).optional(), brand_font: z.string().max(100).optional(), custom_css: z.string().optional(),
  email_branding: z.record(z.unknown()).optional(), login_page_config: z.record(z.unknown()).optional(),
  sidebar_config: z.record(z.unknown()).optional(), removed_branding: z.boolean().optional(), custom_footer: z.string().optional(),
  support_email: z.string().email().optional(), support_url: z.string().optional(), terms_url: z.string().optional(), privacy_url: z.string().optional(),
});

const addDomainSchema = z.object({
  domain: z.string().min(1).max(255), target_cname: z.string().optional(), is_primary: z.boolean().optional(),
});

const createPortalSchema = z.object({
  client_organization_id: z.string().uuid(), portal_name: z.string().min(1).max(255),
  custom_domain: z.string().optional(), subdomain: z.string().optional(), branding: z.record(z.unknown()).optional(),
  features: z.record(z.unknown()).optional(), settings: z.record(z.unknown()).optional(),
});

router.get('/config', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await whiteLabelService.getWhiteLabelConfig(String(req.query.organization_id)) }); }
  catch (error) { next(error); }
});

router.put('/config', requireOrganizationRole('owner', 'admin'), validateBody(updateWhiteLabelSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await whiteLabelService.updateWhiteLabelConfig(req.body.organization_id, req.body) }); }
  catch (error) { next(error); }
});

router.get('/domains', requireOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await whiteLabelService.getCustomDomains(String(req.query.organization_id)) }); }
  catch (error) { next(error); }
});

router.post('/domains', requireOrganizationRole('owner', 'admin'), validateBody(addDomainSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.status(201).json({ success: true, data: await whiteLabelService.addCustomDomain(req.body.organization_id, req.body) }); }
  catch (error) { next(error); }
});

router.post('/domains/:domainId/verify', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await whiteLabelService.verifyCustomDomain(req.params.domainId, req.body.organization_id) }); }
  catch (error) { next(error); }
});

router.delete('/domains/:domainId', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await whiteLabelService.removeCustomDomain(req.params.domainId, String(req.query.organization_id));
    res.json({ success: true, data: { message: 'Domain removed' } });
  } catch (error) { next(error); }
});

router.get('/portals', requireAgencyAccess(), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await whiteLabelService.getClientPortals(String(req.query.agency_id)) }); }
  catch (error) { next(error); }
});

router.post('/portals', requireAgencyAccess('owner', 'admin', 'manager'), validateBody(createPortalSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.status(201).json({ success: true, data: await whiteLabelService.createClientPortal(req.body.agency_id, req.body) }); }
  catch (error) { next(error); }
});

router.put('/portals/:portalId', requireAgencyAccess('owner', 'admin', 'manager'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await whiteLabelService.updateClientPortal(req.params.portalId, req.body.agency_id, req.body) }); }
  catch (error) { next(error); }
});

router.delete('/portals/:portalId', requireAgencyAccess('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await whiteLabelService.removeClientPortal(req.params.portalId, String(req.query.agency_id));
    res.json({ success: true, data: { message: 'Portal removed' } });
  } catch (error) { next(error); }
});

router.get('/portals/:portalId/logs', requireAgencyAccess(), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const logs = await whiteLabelService.getPortalAccessLogs(req.params.portalId, String(req.query.agency_id), Number(req.query.limit || 50));
    res.json({ success: true, data: logs });
  } catch (error) { next(error); }
});

export default router;
