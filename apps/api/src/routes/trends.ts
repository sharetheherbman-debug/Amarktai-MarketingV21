import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';
import * as trendService from '../services/trend.service';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const monitors = await trendService.listMonitors(orgId);
    res.json({ success: true, data: monitors });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    const { topic, description, keywords, sources, config, alert_threshold } = req.body;

    if (!orgId || !topic) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id and topic are required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const monitor = await trendService.createMonitor(orgId, { topic, description, keywords, sources, config, alert_threshold }, req.user!.userId);
    res.status(201).json({ success: true, data: monitor });
  } catch (error) {
    next(error);
  }
});

router.get('/unread-count', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const count = await trendService.getUnreadCount(orgId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    next(error);
  }
});

router.get('/alerts', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const alerts = await trendService.getAlerts(orgId);
    res.json({ success: true, data: alerts });
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

    const monitor = await trendService.getMonitorById(req.params.id, orgId);
    res.json({ success: true, data: monitor });
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

    const monitor = await trendService.updateMonitor(req.params.id, orgId, req.body);
    res.json({ success: true, data: monitor });
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

    await trendService.deleteMonitor(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Trend monitor deleted' } });
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

    await trendService.checkMonitor(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Trend check completed' } });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/items', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const result = await trendService.listItems(orgId, req.params.id, limit, offset);
    res.json({ success: true, data: result.items, meta: { total: result.total } });
  } catch (error) {
    next(error);
  }
});

router.patch('/items/:itemId/read', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    await trendService.markAsRead(req.params.itemId, orgId);
    res.json({ success: true, data: { message: 'Item marked as read' } });
  } catch (error) {
    next(error);
  }
});

router.patch('/items/:itemId/save', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    await trendService.toggleSaved(req.params.itemId, orgId);
    res.json({ success: true, data: { message: 'Item save toggled' } });
  } catch (error) {
    next(error);
  }
});

export default router;
