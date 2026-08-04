import { Router, Response, NextFunction } from 'express';
import * as orgService from '../services/organization.service';
import { requireAuth, AuthRequest, requireOrgAccess } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { createOrganizationSchema, addMemberSchema, updateMemberRoleSchema } from '../utils/validation';
import { ApiResponse, PaginatedResponse } from '../types';

const router = Router();

router.use(requireAuth);

router.post('/', validateBody(createOrganizationSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const org = await orgService.create(req.user!.userId, req.body);
    res.status(201).json({ success: true, data: org });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgs = await orgService.list(req.user!.userId);
    res.json({ success: true, data: orgs });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const org = await orgService.getById(req.params.id, req.user!.userId);
    res.json({ success: true, data: org });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireOrgAccess('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const org = await orgService.update(req.params.id, req.user!.userId, req.body);
    res.json({ success: true, data: org });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireOrgAccess('owner'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await orgService.remove(req.params.id, req.user!.userId);
    res.json({ success: true, data: { message: 'Organization deleted' } });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/members', requireOrgAccess('owner', 'admin'), validateBody(addMemberSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const member = await orgService.addMember(req.params.id, req.user!.userId, req.body.email, req.body.role);
    res.status(201).json({ success: true, data: member });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id/members/:userId', requireOrgAccess('owner', 'admin'), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await orgService.removeMember(req.params.id, req.params.userId);
    res.json({ success: true, data: { message: 'Member removed' } });
  } catch (error) {
    next(error);
  }
});

router.put('/:id/members/:userId/role', requireOrgAccess('owner'), validateBody(updateMemberRoleSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const member = await orgService.updateMemberRole(req.params.id, req.user!.userId, req.params.userId, req.body.role);
    res.json({ success: true, data: member });
  } catch (error) {
    next(error);
  }
});

export default router;
