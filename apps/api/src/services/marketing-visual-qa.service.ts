import path from 'path';
import { readFile, stat } from 'fs/promises';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';
import type { GenXVisualAssessment } from '../providers/genx-multimodal.provider';

type Json = Record<string, any>;

const MAX_VISUAL_QA_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_VISUAL_QA_MODEL = 'gemini-3-flash';

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

function visualQaSchemaInstructions(): string {
  return [
    'Return JSON only, with exactly this object shape:',
    JSON.stringify({
      subject_relevance: 0,
      campaign_relevance: 0,
      commercial_usability: 0,
      composition_quality: 0,
      subject_integrity: 0,
      negative_space_usability: 0,
      unexpected_text: false,
      unexpected_logo: false,
      watermark: false,
      obvious_ai_artifacts: false,
      wrong_product: false,
      wrong_subject: false,
      brand_safety: true,
      rejection_reasons: [],
      repair_instructions: [],
    }, null, 2),
    'All six scores must be integers from 0 to 100.',
    'All flags must be booleans.',
    'rejection_reasons and repair_instructions must be arrays of strings.',
  ].join('\n');
}

function extractChatContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value.map((item) => {
    if (typeof item === 'string') return item;
    const record = object(item);
    return String(record.text || record.content || '');
  }).filter(Boolean).join('\n');
}

function parseJsonObjectFromText(value: string): Json {
  let cleaned = value.trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return object(JSON.parse(cleaned));
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return object(JSON.parse(cleaned.slice(first, last + 1)));
    }
    throw new Error('GenX visual QA response did not contain parseable JSON');
  }
}

function genxBaseUrl(): string {
  return env.GENX_BASE_URL.replace(/\/+$/, '').replace(/\/(?:api\/v1|v1)$/, '');
}

async function assessVisualWithGenxChat(input: MarketingVisualQaInput, absolutePath: string, mimeType: string): Promise<GenXVisualAssessment> {
  const bytes = await readFile(absolutePath);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_VISUAL_QA_IMAGE_BYTES) {
    throw new AppError(409, 'Marketing visual QA ingredient size is invalid', 'MATERIAL_VISUAL_QA_MEDIA_INVALID');
  }
  const model = String(process.env.MARKETING_VISUAL_QA_MODEL || DEFAULT_VISUAL_QA_MODEL).trim() || DEFAULT_VISUAL_QA_MODEL;
  const dataUrl = `data:${mimeType};base64,${bytes.toString('base64')}`;
  const response = await fetch(`${genxBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GENX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0,
      max_tokens: 1200,
      messages: [
        {
          role: 'system',
          content: 'You are a strict visual quality auditor. Return structured JSON only.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [sourceInstructions(input.brief), visualQaSchemaInstructions(), `Technical QA context: ${JSON.stringify(input.technicalQa || {})}`, `Acceptance thresholds: ${JSON.stringify(MARKETING_VISUAL_QA_THRESHOLDS)}`].join('\n\n'),
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`GenX multimodal visual QA error ${response.status}: ${responseText.slice(0, 500) || response.statusText}`);
  }
  const raw = object(JSON.parse(responseText));
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice = object(choices[0]);
  const message = object(firstChoice.message);
  const content = extractChatContent(message.content);
  if (!content) throw new Error('GenX multimodal visual QA returned no message content');
  return parseJsonObjectFromText(content) as unknown as GenXVisualAssessment;
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
 * Sends only a trusted durable local Studio image to GenX's proven multimodal
 * chat boundary as a bounded data URL. Marketing never exposes the ingredient
 * publicly and never routes image media through the document-only /api/v1/files
 * endpoint. The caller still validates every field and fails closed on any
 * provider, transport, parsing, score, or contract error.
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
  try {
    const response = await assessVisualWithGenxChat(input, absolutePath, mimeType);
    return validateMarketingVisualQa(response, 'genx_multimodal');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'Marketing visual QA is temporarily unavailable; the ingredient was not accepted or made ready for review', 'MATERIAL_VISUAL_QA_PROVIDER_UNAVAILABLE');
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
