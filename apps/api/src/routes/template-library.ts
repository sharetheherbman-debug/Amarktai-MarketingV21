import { Router, Response, NextFunction } from 'express';
import * as templateService from '../services/template-library.service';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { ApiResponse } from '../types';
import { z } from 'zod';

const router = Router();

router.use(requireAuth);

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(['campaign', 'workflow', 'prompt', 'brand_dna', 'seo', 'crm', 'onboarding']),
  template_type: z.string().min(1),
  template_data: z.record(z.unknown()),
  is_public: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  template_data: z.record(z.unknown()).optional(),
  is_public: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

// List Templates
router.get('/', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const orgId = req.query.organization_id as string;
    const category = req.query.category as string;
    const templateType = req.query.template_type as string;
    const templates = await templateService.listTemplates(orgId, category, templateType);
    res.json({ success: true, data: templates });
  } catch (error) { next(error); }
});

// Get Template Categories
router.get('/categories', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const categories = await templateService.getCategories(req.query.organization_id as string);
    res.json({ success: true, data: categories });
  } catch (error) { next(error); }
});

// Get Single Template
router.get('/:templateId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const template = await templateService.getTemplate(req.params.templateId, req.query.organization_id as string);
    res.json({ success: true, data: template });
  } catch (error) { next(error); }
});

// Create Template
router.post('/', validateBody(createTemplateSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const template = await templateService.createTemplate(req.body.organization_id, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: template });
  } catch (error) { next(error); }
});

// Update Template
router.put('/:templateId', validateBody(updateTemplateSchema), async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const template = await templateService.updateTemplate(req.params.templateId, req.body.organization_id, req.body);
    res.json({ success: true, data: template });
  } catch (error) { next(error); }
});

// Delete Template
router.delete('/:templateId', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    await templateService.deleteTemplate(req.params.templateId, req.query.organization_id as string);
    res.json({ success: true, data: { message: 'Template deleted' } });
  } catch (error) { next(error); }
});

// Duplicate Template
router.post('/:templateId/duplicate', async (req: AuthRequest, res: Response<ApiResponse>, next: NextFunction) => {
  try {
    const template = await templateService.duplicateTemplate(
      req.params.templateId,
      req.body.organization_id,
      req.user!.userId
    );
    res.status(201).json({ success: true, data: template });
  } catch (error) { next(error); }
});

export default router;
