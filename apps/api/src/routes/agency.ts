import { Router, Response, NextFunction } from 'express';
import * as agencyService from '../services/agency.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireOrganizationRole, requireClientOrganizationMembership } from '../middleware/organization-access';
import { validateBody } from '../middleware/validator';
import { ApiResponse } from '../types';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const createAgencySchema = z.object({
  name: z.string().min(1).max(255), slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(), logo: z.string().optional(), website: z.string().optional(),
  contact_email: z.string().email().optional(), contact_phone: z.string().optional(),
  address: z.record(z.unknown()).optional(), settings: z.record(z.unknown()).optional(),
  max_clients: z.number().int().positive().optional(), max_team_members: z.number().int().positive().optional(),
});

const addTeamMemberSchema = z.object({
  user_id: z.string().uuid(), role: z.enum(['owner', 'admin', 'manager', 'member', 'viewer']),
  permissions: z.record(z.unknown()).optional(), assigned_clients: z.array(z.string().uuid()).optional(),
});

const assignClientSchema = z.object({
  client_organization_id: z.string().uuid(), assigned_to: z.string().uuid().optional(),
  relationship_type: z.enum(['managed', 'consultant', 'fulfillment']).optional(),
  contract_start: z.string().optional(), contract_end: z.string().optional(),
  monthly_fee_cents: z.number().int().min(0).optional(), notes: z.string().optional(),
});

router.post('/', requireOrganizationRole('owner', 'admin'), validateBody(createAgencySchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.status(201).json({ success: true, data: await agencyService.createAgency(req.user!.userId, req.body.organization_id, req.body) }); }
  catch (error) { next(error); }
});

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await agencyService.getAgency(String(req.query.organization_id)) }); }
  catch (error) { next(error); }
});

router.put('/', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try { res.json({ success: true, data: await agencyService.updateAgency(req.body.organization_id, req.body) }); }
  catch (error) { next(error); }
});

router.get('/stats', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(String(req.query.organization_id));
    res.json({ success: true, data: await agencyService.getAgencyStats(agency.id) });
  } catch (error) { next(error); }
});

router.get('/client-health', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(String(req.query.organization_id));
    res.json({ success: true, data: await agencyService.getClientHealth(agency.id) });
  } catch (error) { next(error); }
});

router.get('/team', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(String(req.query.organization_id));
    res.json({ success: true, data: await agencyService.getTeamMembers(agency.id) });
  } catch (error) { next(error); }
});

router.post('/team', requireOrganizationRole('owner', 'admin'), validateBody(addTeamMemberSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.body.organization_id);
    res.status(201).json({ success: true, data: await agencyService.addTeamMember(agency.id, req.body) });
  } catch (error) { next(error); }
});

router.put('/team/:memberId', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.body.organization_id);
    res.json({ success: true, data: await agencyService.updateTeamMember(req.params.memberId, agency.id, req.body) });
  } catch (error) { next(error); }
});

router.delete('/team/:memberId', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(String(req.query.organization_id));
    await agencyService.removeTeamMember(req.params.memberId, agency.id);
    res.json({ success: true, data: { message: 'Team member removed' } });
  } catch (error) { next(error); }
});

router.get('/clients', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(String(req.query.organization_id));
    res.json({ success: true, data: await agencyService.getClientAssignments(agency.id) });
  } catch (error) { next(error); }
});

router.post('/clients', requireOrganizationRole('owner', 'admin'), validateBody(assignClientSchema), requireClientOrganizationMembership, async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.body.organization_id);
    res.status(201).json({ success: true, data: await agencyService.assignClient(agency.id, req.body) });
  } catch (error) { next(error); }
});

router.put('/clients/:assignmentId', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.body.organization_id);
    res.json({ success: true, data: await agencyService.updateClientAssignment(req.params.assignmentId, agency.id, req.body) });
  } catch (error) { next(error); }
});

router.delete('/clients/:assignmentId', requireOrganizationRole('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(String(req.query.organization_id));
    await agencyService.removeClientAssignment(req.params.assignmentId, agency.id);
    res.json({ success: true, data: { message: 'Client assignment removed' } });
  } catch (error) { next(error); }
});

export default router;
