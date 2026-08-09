import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../types';
import * as control from '../services/relaunch-control.service';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, data: await control.getControlCentre(req.organizationId!) });
  } catch (error) { next(error); }
});

router.put('/policy', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const policy = await control.updatePolicy(req.organizationId!, req.user!.userId, req.body);
    res.json({ success: true, data: policy });
  } catch (error) { next(error); }
});

router.post('/emergency-stop', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const policy = await control.setEmergencyStop(
      req.organizationId!,
      req.user!.userId,
      req.body.stopped !== false,
      String(req.body.reason || '')
    );
    res.json({ success: true, data: policy });
  } catch (error) { next(error); }
});

router.post('/actions', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const action = await control.proposeAction(req.organizationId!, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: action });
  } catch (error) { next(error); }
});

router.post('/actions/:id/decision', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const decision = String(req.body.decision || '');
    if (!['approved', 'rejected', 'cancelled'].includes(decision)) {
      res.status(400).json({ success: false, error: { message: 'decision must be approved, rejected or cancelled', code: 'BAD_REQUEST' } });
      return;
    }
    const action = await control.decideAction(
      req.organizationId!,
      req.user!.userId,
      req.params.id,
      decision as 'approved' | 'rejected' | 'cancelled',
      String(req.body.reason || '')
    );
    res.json({ success: true, data: action });
  } catch (error) { next(error); }
});

export default router;
