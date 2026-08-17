import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireOrganizationMembership } from '../middleware/organization-access';
import { validateBody, validateQuery } from '../middleware/validator';
import { z } from 'zod';
import { toolService } from '../services/tool.service';
import { ApiResponse } from '../types';

const router = Router();

router.use(requireAuth);
router.use(requireOrganizationMembership);

const listToolsSchema = z.object({
  category: z.string().optional(),
  organization_id: z.string().uuid().optional(),
});

const executeToolSchema = z.object({
  input: z.record(z.unknown()),
  organization_id: z.string().uuid(),
});

router.get('/', validateQuery(listToolsSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { category } = req.query as { category?: string; organization_id?: string };
    const orgId = req.organizationId;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'Organization ID required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const tools = await toolService.list(orgId, category);

    res.json({
      success: true,
      data: tools,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:name', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'Organization ID required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const tool = await toolService.getByName(req.params.name, orgId);

    if (!tool) {
      res.status(404).json({
        success: false,
        error: { message: 'Tool not found', code: 'NOT_FOUND' },
      });
      return;
    }

    res.json({
      success: true,
      data: tool,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:name/execute', validateBody(executeToolSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const { input } = req.body;
    const orgId = req.organizationId;

    if (!orgId) {
      res.status(400).json({
        success: false,
        error: { message: 'Organization ID required', code: 'BAD_REQUEST' },
      });
      return;
    }

    const result = await toolService.execute(req.params.name, input, orgId);

    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;