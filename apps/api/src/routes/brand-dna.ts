import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { createBrandDnaSchema, updateBrandDnaSchema } from '../utils/validation';
import { ApiResponse } from '../types';
import * as brandDnaService from '../services/brand-dna.service';

const router = Router();

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

function customerView(value: Record<string, any> | null): Record<string, unknown> | null {
  if (!value) return null;
  const metadata = record(value.metadata);
  const audience = record(value.target_audience);
  const colors = record(value.colors);
  return {
    id: value.id,
    organizationId: value.organization_id,
    companyName: value.company_name || '',
    description: metadata.description || '',
    industry: value.industry || '',
    websiteUrl: metadata.website_url || '',
    products: Array.isArray(metadata.products) ? metadata.products : [],
    voiceDescription: value.brand_voice || '',
    tone: metadata.tone || 'professional',
    demographics: audience.demographics || '',
    psychographics: audience.psychographics || '',
    goals: value.goals || [],
    keywords: value.keywords || [],
    writingStyle: value.writing_style || '',
    prohibitedPhrases: value.prohibited_phrases || [],
    complianceRules: Array.isArray(metadata.compliance_rules) ? metadata.compliance_rules : [],
    primaryColor: colors.primary || '#052b57',
    secondaryColor: colors.secondary || '#ffffff',
    accentColor: colors.accent || '#167cc1',
    logoUrl: metadata.logo_url || '',
    socialHandles: record(metadata.social_handles),
    competitors: Array.isArray(metadata.competitors) ? metadata.competitors : [],
    preferredCtas: value.preferred_ctas || [],
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function serviceInput(body: Record<string, any>): any {
  const existingMetadata = record(body.metadata);
  const existingAudience = record(body.target_audience);
  const existingColors = record(body.colors);
  const output: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => { if (value !== undefined) output[key] = value; };
  set('company_name', body.company_name ?? body.companyName);
  set('industry', body.industry);
  set('brand_voice', body.brand_voice ?? body.voiceDescription);
  if (body.target_audience !== undefined || body.demographics !== undefined || body.psychographics !== undefined) {
    output.target_audience = body.target_audience ?? {
      ...existingAudience,
      demographics: body.demographics || '',
      psychographics: body.psychographics || '',
    };
  }
  set('goals', body.goals);
  set('keywords', body.keywords);
  set('writing_style', body.writing_style ?? body.writingStyle);
  set('prohibited_phrases', body.prohibited_phrases ?? body.prohibitedPhrases);
  set('preferred_ctas', body.preferred_ctas ?? body.preferredCtas);
  if (body.colors !== undefined || body.primaryColor !== undefined || body.secondaryColor !== undefined || body.accentColor !== undefined) {
    output.colors = body.colors ?? {
      ...existingColors,
      primary: body.primaryColor || '#052b57',
      secondary: body.secondaryColor || '#ffffff',
      accent: body.accentColor || '#167cc1',
    };
  }
  set('fonts', body.fonts);
  if (body.metadata !== undefined || [
    'description','websiteUrl','products','tone','complianceRules','logoUrl','socialHandles','competitors',
  ].some((key) => body[key] !== undefined)) {
    output.metadata = {
      ...existingMetadata,
      description: body.description ?? existingMetadata.description ?? '',
      website_url: body.websiteUrl ?? existingMetadata.website_url ?? '',
      products: body.products ?? existingMetadata.products ?? [],
      tone: body.tone ?? existingMetadata.tone ?? 'professional',
      compliance_rules: body.complianceRules ?? existingMetadata.compliance_rules ?? [],
      logo_url: body.logoUrl ?? existingMetadata.logo_url ?? '',
      social_handles: body.socialHandles ?? existingMetadata.social_handles ?? {},
      competitors: body.competitors ?? existingMetadata.competitors ?? [],
    };
  }
  return output;
}

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
    res.json({ success: true, data: customerView(dna as unknown as Record<string, any> | null) });
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

    const dna = await brandDnaService.upsert(orgId, serviceInput(req.body));
    res.status(201).json({ success: true, data: customerView(dna as unknown as Record<string, any>) });
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

    const dna = await brandDnaService.update(orgId, serviceInput(req.body));
    res.json({ success: true, data: customerView(dna as unknown as Record<string, any>) });
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
