import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { NotFoundError } from '../middleware/errorHandler';
import { ApiResponse } from '../types';
import * as knowledgeService from '../services/knowledge.service';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const type = req.query.type as string | undefined;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const sources = await knowledgeService.list(orgId, type);
    res.json({ success: true, data: sources });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;
    const { name, type, url, config } = req.body;

    if (!orgId || !name || !type) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id, name, and type are required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const source = await knowledgeService.create(orgId, { name, type, url, config }, req.user!.userId);
    res.status(201).json({ success: true, data: source });
  } catch (error) {
    next(error);
  }
});

router.get('/stats', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const stats = await knowledgeService.getStats(orgId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;
    const q = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!orgId || !q) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id and q are required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const results = await knowledgeService.search(orgId, q, limit);
    res.json({ success: true, data: results });
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

    const source = await knowledgeService.getById(req.params.id, orgId);
    res.json({ success: true, data: source });
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

    const source = await knowledgeService.update(req.params.id, orgId, req.body);
    res.json({ success: true, data: source });
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

    await knowledgeService.remove(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Knowledge source deleted' } });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/sync', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    await knowledgeService.syncSource(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Sync started' } });
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

    const result = await knowledgeService.listItems(req.params.id, orgId, limit, offset);
    res.json({ success: true, data: result.items, meta: { total: result.total } });
  } catch (error) {
    next(error);
  }
});

router.delete('/items/:itemId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction): Promise<void> => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    await knowledgeService.deleteItem(req.params.itemId, orgId);
    res.json({ success: true, data: { message: 'Knowledge item deleted' } });
  } catch (error) {
    next(error);
  }
});

export default router;
