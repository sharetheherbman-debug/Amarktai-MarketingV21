import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { createBrandDnaSchema, updateBrandDnaSchema } from '../utils/validation';
import { ApiResponse } from '../types';
import * as brandDnaService from '../services/brand-dna.service';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const dna = await brandDnaService.get(orgId);
    res.json({ success: true, data: dna });
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(createBrandDnaSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const dna = await brandDnaService.upsert(orgId, req.body);
    res.status(201).json({ success: true, data: dna });
  } catch (error) {
    next(error);
  }
});

router.put('/', validateBody(updateBrandDnaSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const dna = await brandDnaService.update(orgId, req.body);
    res.json({ success: true, data: dna });
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    await brandDnaService.remove(orgId);
    res.json({ success: true, data: { message: 'Brand DNA deleted' } });
  } catch (error) {
    next(error);
  }
});

router.get('/context', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const contextString = await brandDnaService.getContextString(orgId);
    res.json({ success: true, data: { context: contextString } });
  } catch (error) {
    next(error);
  }
});

export default router;
