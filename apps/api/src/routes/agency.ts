import { Router, Response, NextFunction } from 'express';
import * as agencyService from '../services/agency.service';
import { requireAuth, AuthRequest, requireOrgAccess } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { ApiResponse } from '../types';
import { z } from 'zod';

const router = Router();

router.use(requireAuth);

const createAgencySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().optional(),
  logo: z.string().optional(),
  website: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  address: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
  max_clients: z.number().int().positive().optional(),
  max_team_members: z.number().int().positive().optional(),
});

const addTeamMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'manager', 'member', 'viewer']),
  permissions: z.record(z.unknown()).optional(),
  assigned_clients: z.array(z.string().uuid()).optional(),
});

const assignClientSchema = z.object({
  client_organization_id: z.string().uuid(),
  assigned_to: z.string().uuid().optional(),
  relationship_type: z.enum(['managed', 'consultant', 'fulfillment']).optional(),
  contract_start: z.string().optional(),
  contract_end: z.string().optional(),
  monthly_fee_cents: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

// Agency CRUD
router.post('/', validateBody(createAgencySchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.createAgency(req.user!.userId, req.body.organization_id, req.body);
    res.status(201).json({ success: true, data: agency });
  } catch (error) { next(error); }
});

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.query.organization_id as string);
    res.json({ success: true, data: agency });
  } catch (error) { next(error); }
});

router.put('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.updateAgency(req.body.organization_id, req.body);
    res.json({ success: true, data: agency });
  } catch (error) { next(error); }
});

// Agency Stats
router.get('/stats', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.query.organization_id as string);
    const stats = await agencyService.getAgencyStats(agency.id);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
});

// Client Health
router.get('/client-health', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.query.organization_id as string);
    const health = await agencyService.getClientHealth(agency.id);
    res.json({ success: true, data: health });
  } catch (error) { next(error); }
});

// Team Management
router.get('/team', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.query.organization_id as string);
    const members = await agencyService.getTeamMembers(agency.id);
    res.json({ success: true, data: members });
  } catch (error) { next(error); }
});

router.post('/team', validateBody(addTeamMemberSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.body.organization_id);
    const member = await agencyService.addTeamMember(agency.id, req.body);
    res.status(201).json({ success: true, data: member });
  } catch (error) { next(error); }
});

router.put('/team/:memberId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.body.organization_id);
    const member = await agencyService.updateTeamMember(req.params.memberId, agency.id, req.body);
    res.json({ success: true, data: member });
  } catch (error) { next(error); }
});

router.delete('/team/:memberId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.query.organization_id as string);
    await agencyService.removeTeamMember(req.params.memberId, agency.id);
    res.json({ success: true, data: { message: 'Team member removed' } });
  } catch (error) { next(error); }
});

// Client Assignments
router.get('/clients', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.query.organization_id as string);
    const clients = await agencyService.getClientAssignments(agency.id);
    res.json({ success: true, data: clients });
  } catch (error) { next(error); }
});

router.post('/clients', validateBody(assignClientSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.body.organization_id);
    const assignment = await agencyService.assignClient(agency.id, req.body);
    res.status(201).json({ success: true, data: assignment });
  } catch (error) { next(error); }
});

router.put('/clients/:assignmentId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.body.organization_id);
    const assignment = await agencyService.updateClientAssignment(req.params.assignmentId, agency.id, req.body);
    res.json({ success: true, data: assignment });
  } catch (error) { next(error); }
});

router.delete('/clients/:assignmentId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const agency = await agencyService.getAgency(req.query.organization_id as string);
    await agencyService.removeClientAssignment(req.params.assignmentId, agency.id);
    res.json({ success: true, data: { message: 'Client assignment removed' } });
  } catch (error) { next(error); }
});

export default router;
