import path from 'path';
import { stat } from 'fs/promises';
import { AppError } from '../middleware/errorHandler';
import { genxMultimodalProvider, type GenXVisualAssessment } from '../providers/genx-multimodal.provider';

type Json = Record<string, any>;

export const MARKETING_VISUAL_QA_THRESHOLDS = {
  subject_relevance: 80,
  campaign_relevance: 80,
  commercial_usability: 80,
  composition_quality: 70,
  subject_integrity: 85,
  negative_space_usability: 65,
} as const;

export type MarketingVisualQaResult = {
  subject_relevance: number;
  campaign_relevance: number;
  commercial_usability: number;
  composition_quality: number;
  subject_integrity: number;
  negative_space_usability: number;
  unexpected_text: boolean;
  unexpected_logo: boolean;
  watermark: boolean;
  obvious_ai_artifacts: boolean;
  wrong_product: boolean;
  wrong_subject: boolean;
  brand_safety: boolean;
  rejection_reasons: string[];
  repair_instructions: string[];
  accepted: boolean;
  review_mode: 'genx_multimodal' | 'fixture_contract';
};

export type MarketingVisualQaInput = {
  /** A trusted, durable Studio asset path. Remote/internal URLs are never fetched. */
  ingredientPath: string;
  brief: Json;
  technicalQa: Json;
};

function object(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function score(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new AppError(409, `Visual QA returned an invalid ${field} score`, 'MATERIAL_VISUAL_QA_MALFORMED');
  }
  return Math.round(parsed);
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AppError(409, `Visual QA returned an invalid ${field} flag`, 'MATERIAL_VISUAL_QA_MALFORMED');
  }
  return value;
}

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new AppError(409, `Visual QA returned invalid ${field}`, 'MATERIAL_VISUAL_QA_MALFORMED');
  }
  return value.map((item) => item.trim()).filter(Boolean).slice(0, 12);
}

function sourceInstructions(brief: Json): string {
  return [
    'Assess this image only as a raw marketing visual ingredient. It is not a final advertisement.',
    'It must be relevant to the campaign brief, professionally usable, anatomically/structurally credible, and leave safe negative space for deterministic brand overlays.',
    'Reject generated text, generated logos, watermarks, fake claims, wrong subject/product, visible AI artifacts, or anything unsafe for a tenant brand.',
    `Campaign brief: ${JSON.stringify({ objective: brief.objective, audience: brief.audience, offer: brief.offer, purpose: brief.purpose, product: brief.product, service: brief.service, platform: brief.platform, headline: brief.headline, cta: brief.cta })}`,
    'Return only the structured visual-QA contract requested by the caller.',
  ].join('\n');
}

export function validateMarketingVisualQa(value: unknown, reviewMode: MarketingVisualQaResult['review_mode'] = 'genx_multimodal'): MarketingVisualQaResult {
  const raw = object(value);
  const result: Omit<MarketingVisualQaResult, 'accepted' | 'review_mode'> = {
    subject_relevance: score(raw.subject_relevance, 'subject_relevance'),
    campaign_relevance: score(raw.campaign_relevance, 'campaign_relevance'),
    commercial_usability: score(raw.commercial_usability, 'commercial_usability'),
    composition_quality: score(raw.composition_quality, 'composition_quality'),
    subject_integrity: score(raw.subject_integrity, 'subject_integrity'),
    negative_space_usability: score(raw.negative_space_usability, 'negative_space_usability'),
    unexpected_text: boolean(raw.unexpected_text, 'unexpected_text'),
    unexpected_logo: boolean(raw.unexpected_logo, 'unexpected_logo'),
    watermark: boolean(raw.watermark, 'watermark'),
    obvious_ai_artifacts: boolean(raw.obvious_ai_artifacts, 'obvious_ai_artifacts'),
    wrong_product: boolean(raw.wrong_product, 'wrong_product'),
    wrong_subject: boolean(raw.wrong_subject, 'wrong_subject'),
    brand_safety: boolean(raw.brand_safety, 'brand_safety'),
    rejection_reasons: strings(raw.rejection_reasons, 'rejection_reasons'),
    repair_instructions: strings(raw.repair_instructions, 'repair_instructions'),
  };
  const scoreFailures = Object.entries(MARKETING_VISUAL_QA_THRESHOLDS)
    .filter(([field, minimum]) => result[field as keyof typeof MARKETING_VISUAL_QA_THRESHOLDS] < minimum)
    .map(([field, minimum]) => `${field} below ${minimum}`);
  const criticalFailures = [
    result.unexpected_text && 'unexpected generated text',
    result.unexpected_logo && 'unexpected generated logo',
    result.watermark && 'watermark',
    result.obvious_ai_artifacts && 'obvious AI artifacts',
    result.wrong_product && 'wrong product or service',
    result.wrong_subject && 'wrong subject',
    !result.brand_safety && 'brand safety failure',
  ].filter(Boolean) as string[];
  const rejectionReasons = Array.from(new Set([...result.rejection_reasons, ...scoreFailures, ...criticalFailures]));
  return {
    ...result,
    rejection_reasons: rejectionReasons,
    repair_instructions: result.repair_instructions.length > 0
      ? result.repair_instructions
      : rejectionReasons.length > 0
        ? ['Regenerate with a campaign-relevant, professional subject and clear negative space; do not render text, logos or watermarks.']
        : [],
    accepted: rejectionReasons.length === 0,
    review_mode: reviewMode,
  };
}

function fixtureAssessment(): GenXVisualAssessment {
  return {
    subject_relevance: 90,
    campaign_relevance: 90,
    commercial_usability: 90,
    composition_quality: 85,
    subject_integrity: 90,
    negative_space_usability: 80,
    unexpected_text: false,
    unexpected_logo: false,
    watermark: false,
    obvious_ai_artifacts: false,
    wrong_product: false,
    wrong_subject: false,
    brand_safety: true,
    rejection_reasons: [],
    repair_instructions: [],
  };
}

/**
 * Live assessment is deliberately fail-closed. The explicit fixture mode is only
 * for contract tests and disposable candidates without the production GenX secret.
 */
function imageMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    default: throw new AppError(409, 'Marketing visual QA only accepts a trusted PNG, JPEG, or WebP ingredient', 'MATERIAL_VISUAL_QA_MEDIA_INVALID');
  }
}

/**
 * Uploads a trusted durable ingredient through the authenticated GenX file
 * boundary, then analyses by file ID. This prevents local file URLs, private
 * application routes, arbitrary remote URL fetches, and permanent public media
 * exposure. The temporary provider file is deleted on every terminal path.
 */
export async function assessMarketingIngredient(input: MarketingVisualQaInput): Promise<MarketingVisualQaResult> {
  if (process.env.MARKETING_VISUAL_QA_MODE === 'fixture') {
    return validateMarketingVisualQa(fixtureAssessment(), 'fixture_contract');
  }
  const absolutePath = path.resolve(input.ingredientPath);
  const fileInfo = await stat(absolutePath).catch(() => null);
  if (!fileInfo?.isFile()) {
    throw new AppError(409, 'Marketing visual QA ingredient is unavailable as a durable local file', 'MATERIAL_VISUAL_QA_MEDIA_INVALID');
  }
  const mimeType = imageMimeType(absolutePath);
  let temporaryFileId: string | null = null;
  try {
    const uploaded = await genxMultimodalProvider.uploadFile(
      absolutePath,
      `marketing-qa-${path.basename(absolutePath).replace(/[^a-zA-Z0-9._-]/g, '_')}`,
      mimeType
    );
    temporaryFileId = uploaded.id;
    const response = await genxMultimodalProvider.assessVisual({
      file_id: temporaryFileId,
      brief: input.brief,
      technical_qa: input.technicalQa,
      instructions: sourceInstructions(input.brief),
      thresholds: MARKETING_VISUAL_QA_THRESHOLDS,
    });
    return validateMarketingVisualQa(response, 'genx_multimodal');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'Marketing visual QA is temporarily unavailable; the ingredient was not accepted or made ready for review', 'MATERIAL_VISUAL_QA_PROVIDER_UNAVAILABLE');
  } finally {
    if (temporaryFileId) {
      await genxMultimodalProvider.deleteFile(temporaryFileId).catch(() => undefined);
    }
  }
}

export function visualQaRejection(result: MarketingVisualQaResult): AppError {
  return new AppError(
    409,
    `Marketing visual QA rejected this ingredient: ${result.rejection_reasons.join('; ') || 'visual quality threshold not met'}`,
    'MATERIAL_VISUAL_QA_REJECTED'
  );
}

export function repairPromptInstructions(result: MarketingVisualQaResult): string {
  return result.repair_instructions.map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8).join('\n- ');
}
