import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { createPromptSchema, updatePromptSchema, renderPromptSchema, rollbackPromptSchema } from '../utils/validation';
import { ApiResponse } from '../types';
import * as promptService from '../services/prompt.service';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;
    const category = req.query.category as string | undefined;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const prompts = await promptService.list(orgId, category);
    res.json({ success: true, data: prompts });
  } catch (error) {
    next(error);
  }
});

router.post('/', validateBody(createPromptSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const prompt = await promptService.create(orgId, req.body, req.user!.userId);
    res.status(201).json({ success: true, data: prompt });
  } catch (error) {
    next(error);
  }
});

router.get('/categories', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const categories = await promptService.getCategories(orgId);
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const prompt = await promptService.getById(req.params.id, orgId);
    res.json({ success: true, data: prompt });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', validateBody(updatePromptSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const prompt = await promptService.update(req.params.id, orgId, req.body, req.user!.userId);
    res.json({ success: true, data: prompt });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    await promptService.remove(req.params.id, orgId);
    res.json({ success: true, data: { message: 'Prompt deleted' } });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/versions', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const versions = await promptService.getVersions(req.params.id, orgId);
    res.json({ success: true, data: versions });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/rollback', validateBody(rollbackPromptSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const prompt = await promptService.rollback(req.params.id, orgId, req.body.version, req.user!.userId);
    res.json({ success: true, data: prompt });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/test', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const results = await promptService.runTests(req.params.id, orgId, req.user!.userId);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/render', validateBody(renderPromptSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.body.organization_id || req.query.organization_id as string;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'organization_id is required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const rendered = await promptService.render(req.params.id, orgId, req.body.variables || {});
    await promptService.incrementUsage(req.params.id);
    res.json({ success: true, data: rendered });
  } catch (error) {
    next(error);
  }
});

export default router;
