import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as calendarService from '../services/content-calendar.service';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    const events = await calendarService.list(orgId, {
      month: req.query.month ? parseInt(req.query.month as string) : undefined,
      year: req.query.year ? parseInt(req.query.year as string) : undefined,
      campaign_id: req.query.campaign_id as string,
      platform: req.query.platform as string,
    });
    res.json({ success: true, data: events });
  } catch (error) { next(error); }
});

router.get('/upcoming', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const days = parseInt(req.query.days as string) || 30;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    const events = await calendarService.getUpcoming(orgId, days);
    res.json({ success: true, data: events });
  } catch (error) { next(error); }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    const event = await calendarService.getById(req.params.id, orgId);
    res.json({ success: true, data: event });
  } catch (error) { next(error); }
});

router.post('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    const event = await calendarService.create(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: event });
  } catch (error) { next(error); }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    const event = await calendarService.update(req.params.id, orgId, req.body);
    res.json({ success: true, data: event });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    if (!orgId) { res.status(400).json({ success: false, error: { message: 'organization_id is required', code: 'BAD_REQUEST' } }); return; }

    await calendarService.remove(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Calendar event deleted' } });
  } catch (error) { next(error); }
});

export default router;
