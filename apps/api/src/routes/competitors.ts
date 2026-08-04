import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';
import * as competitorService from '../services/competitor.service';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const status = req.query.status as string | undefined;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const competitors = await competitorService.list(orgId, status);
    res.json({ success: true, data: competitors });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    const { name, url, description, industry, monitoring_config } = req.body;

    if (!orgId || !name) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id and name are required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const competitor = await competitorService.create(orgId, { name, url, description, industry, monitoring_config }, req.user!.userId);
    res.status(201).json({ success: true, data: competitor });
  } catch (error) {
    next(error);
  }
});

router.get('/recent-changes', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const days = parseInt(req.query.days as string) || 7;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const changes = await competitorService.getRecentChanges(orgId, days);
    res.json({ success: true, data: changes });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const competitor = await competitorService.getById(req.params.id, orgId);
    res.json({ success: true, data: competitor });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const competitor = await competitorService.update(req.params.id, orgId, req.body);
    res.json({ success: true, data: competitor });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    await competitorService.remove(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Competitor deleted' } });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/check', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    await competitorService.checkCompetitor(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Competitor check completed' } });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/snapshots', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const type = req.query.type as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const snapshots = await competitorService.getSnapshots(req.params.id, orgId, type, limit);
    res.json({ success: true, data: snapshots });
  } catch (error) {
    next(error);
  }
});

export default router;
