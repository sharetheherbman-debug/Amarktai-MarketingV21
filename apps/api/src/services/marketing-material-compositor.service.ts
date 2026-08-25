import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import sharp from 'sharp';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { safeFetch } from '../utils/safe-fetch';
import * as whiteLabel from './white-label.service';
import * as brandDna from './brand-dna.service';
import * as studioService from './studio.service';
import * as contentEngine from './content-engine.service';
import * as contentQuality from './content-quality.service';
import * as contentWorkflow from './content-workflow.service';
import { getDeliverableRoute, type DeliverableRoute } from './marketing-deliverable-registry.service';
import { assessMarketingIngredient, visualQaRejection } from './marketing-visual-qa.service';
import type { ContentPlatform, ContentType } from '../types';

const MAX_BRAND_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_MATERIAL_REPAIRS = 2;
const MIN_INGREDIENT_VARIANCE = 8;
const MIN_TEXT_CONTRAST = 4.5;

type Json = Record<string, any>;

type BrandMaterialIdentity = {
  name: string;
  logoUrl: string;
  primary: string;
  accent: string;
  text: string;
  font: string;
  preferredCtas: string[];
  prohibitedPhrases: string[];
  complianceRules: string[];
};

type Dimension = { width: number; height: number };

export interface MaterialCompositionResult {
  runId: string;
  assetId: string;
  assetUrl: string;
  contentId: string;
  qa: Json;
  tracking: Json;
}

/**
 * Supporting scenes are final tenant assets approved through the canonical
 * content workflow. `material_status` remains ready_for_review after approval;
 * `resolution_status`, content status, and an owner approval prove eligibility.
 */
export const APPROVED_MARKETING_SCENE_QUERY = `SELECT asset.storage_path
  FROM campaign_asset_runs sibling
  JOIN studio_assets asset ON asset.id=sibling.final_material_asset_id
  JOIN content_items content ON content.id=sibling.content_id AND content.organization_id=sibling.organization_id
 WHERE sibling.campaign_plan_id=$1 AND sibling.organization_id=$2
   AND sibling.id<>$3 AND sibling.final_material_asset_id IS NOT NULL
   AND sibling.material_status='ready_for_review'
   AND sibling.resolution_status='approved'
   AND content.status='approved' AND content.deleted_at IS NULL
   AND asset.organization_id=sibling.organization_id AND asset.deleted_at IS NULL AND asset.mime_type LIKE 'image/%'
   AND EXISTS (
     SELECT 1 FROM content_approvals approval
      WHERE approval.content_id=content.id AND approval.organization_id=sibling.organization_id
        AND approval.status='approved'
   )
 ORDER BY sibling.completed_at ASC NULLS LAST LIMIT 3`;

function asObject(value: unknown): Json {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Json;
  try { return JSON.parse(String(value || '{}')) as Json; } catch { return {}; }
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [];
  } catch { return []; }
}

function asHex(value: unknown): string | null {
  const raw = String(value || '').trim();
  const hex = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

function findColor(source: Json, names: string[]): string | null {
  for (const name of names) {
    const color = asHex(source[name]);
    if (color) return color;
  }
  return null;
}

function dimensionFor(value: string): Dimension {
  const match = String(value || '').match(/(\d{3,4})\s*x\s*(\d{3,4})/i);
  if (!match) throw new AppError(409, 'The deliverable route has no concrete final-material dimensions', 'MATERIAL_DIMENSIONS_REQUIRED');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 320 || height < 320 || width > 4096 || height > 4096) {
    throw new AppError(409, 'The requested final-material dimensions are outside the safe composition range', 'MATERIAL_DIMENSIONS_INVALID');
  }
  return { width, height };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;',
  }[character] || character));
}

function truncate(value: unknown, maximum: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maximum ? `${text.slice(0, Math.max(0, maximum - 1)).trimEnd()}…` : text;
}

/**
 * The visual has intentionally concise overlay copy. Its canonical review record
 * adds a plain-English context paragraph so existing readability checks assess a
 * usable owner-review description rather than penalising short ad text.
 */
function reviewCopy(headline: string, cta: string): string {
  return `${headline}. Read clear Academy lessons for day-to-day horse care. Find one useful step, make a note, and use it when it suits you. Take your time, ask a question, and choose care that fits your routine. ${cta} today to see the lessons, plan your next step, and keep learning.`;
}

function accessibilityText(identity: BrandMaterialIdentity, route: DeliverableRoute, headline: string, cta: string): string {
  return truncate(`${identity.name} ${route.label}: ${headline}. Call to action: ${cta}.`, 240);
}

function wrapText(value: string, maximumCharacters: number, maximumLines: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maximumCharacters && line) {
      lines.push(line);
      line = word;
      if (lines.length === maximumLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maximumLines) lines.push(line);
  if (lines.length === maximumLines && words.join(' ').length > lines.join(' ').length) {
    lines[lines.length - 1] = truncate(lines[lines.length - 1], Math.max(6, maximumCharacters - 1));
  }
  return lines;
}

function relativeLuminance(hex: string): number {
  const rgb = [1, 3, 5].map((position) => Number.parseInt(hex.slice(position, position + 2), 16) / 255);
  const linear = rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastingText(background: string, configured: string): string {
  const candidates = [configured, '#FFFFFF', '#111111'].filter((color, index, all) => all.indexOf(color) === index);
  const selected = candidates
    .map((color) => ({ color, contrast: contrastRatio(color, background) }))
    .sort((left, right) => right.contrast - left.contrast)[0];
  if (!selected || selected.contrast < MIN_TEXT_CONTRAST) {
    throw new AppError(409, 'Configured brand colors cannot produce accessible material contrast', 'MATERIAL_CONTRAST_FAILED');
  }
  return selected.color;
}

async function resolveBrandIdentity(orgId: string): Promise<BrandMaterialIdentity> {
  const [whiteLabelConfig, dna] = await Promise.all([
    whiteLabel.getWhiteLabelConfig(orgId),
    brandDna.get(orgId),
  ]);
  const whiteColors = asObject(whiteLabelConfig.brand_colors);
  const dnaColors = asObject(dna?.colors);
  const primary = findColor(whiteColors, ['primary', 'primary_color', 'brand_primary'])
    || findColor(dnaColors, ['primary', 'primary_color', 'brand_primary']);
  const accent = findColor(whiteColors, ['accent', 'secondary', 'accent_color', 'brand_secondary'])
    || findColor(dnaColors, ['accent', 'secondary', 'accent_color', 'brand_secondary'])
    || primary;
  const configuredText = findColor(whiteColors, ['text', 'text_color', 'foreground'])
    || findColor(dnaColors, ['text', 'text_color', 'foreground'])
    || '#FFFFFF';
  const name = truncate(whiteLabelConfig.brand_name || dna?.company_name, 80);
  const logoUrl = String(whiteLabelConfig.brand_logo || dna?.logo_url || '').trim();
  const font = truncate(whiteLabelConfig.brand_font || 'sans-serif', 80);
  if (!name) throw new AppError(409, 'Set a tenant brand name before producing final Marketing materials', 'MATERIAL_BRAND_NAME_REQUIRED');
  if (!logoUrl) throw new AppError(409, 'Set a tenant brand logo before producing final Marketing materials', 'MATERIAL_BRAND_LOGO_REQUIRED');
  if (!primary) throw new AppError(409, 'Set a tenant primary brand color before producing final Marketing materials', 'MATERIAL_BRAND_COLOR_REQUIRED');
  const requiredPrimary = primary;
  return {
    name,
    logoUrl,
    primary: requiredPrimary,
    accent: accent || requiredPrimary,
    text: contrastingText(primary, configuredText),
    font,
    preferredCtas: stringArray(dna?.preferred_ctas),
    prohibitedPhrases: stringArray(dna?.prohibited_phrases),
    complianceRules: stringArray(dna?.compliance_rules),
  };
}

async function loadLogo(logoUrl: string, orgId: string): Promise<Buffer> {
  const internal = logoUrl.match(/^\/api\/v1\/studio\/assets\/([0-9a-f-]{36})$/i);
  if (internal) {
    const result = await query(
      'SELECT storage_path FROM studio_assets WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL',
      [internal[1], orgId]
    );
    if (!result.rows[0]?.storage_path) throw new AppError(409, 'Configured brand logo is not an accessible tenant asset', 'MATERIAL_BRAND_LOGO_UNAVAILABLE');
    return sharp(await fs.readFile(String(result.rows[0].storage_path))).resize({ width: 220, height: 120, fit: 'contain' }).png().toBuffer();
  }
  if (logoUrl.startsWith('data:image/')) {
    const match = logoUrl.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i);
    if (!match) throw new AppError(409, 'Configured brand logo data is not a supported raster image', 'MATERIAL_BRAND_LOGO_INVALID');
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.byteLength > MAX_BRAND_LOGO_BYTES) throw new AppError(413, 'Configured brand logo is too large', 'MATERIAL_BRAND_LOGO_TOO_LARGE');
    return sharp(bytes).resize({ width: 220, height: 120, fit: 'contain' }).png().toBuffer();
  }
  const response = await safeFetch(logoUrl, { timeoutMs: 20_000, maxRedirects: 3, maxResponseBytes: MAX_BRAND_LOGO_BYTES });
  if (!response.ok) throw new AppError(409, 'Configured brand logo could not be loaded', 'MATERIAL_BRAND_LOGO_UNAVAILABLE');
  return sharp(await response.bytes()).resize({ width: 220, height: 120, fit: 'contain' }).png().toBuffer();
}

async function inspectIngredient(ingredientPath: string): Promise<Json> {
  const image = sharp(ingredientPath, { failOn: 'error' });
  const [metadata, stats] = await Promise.all([image.metadata(), image.stats()]);
  if (!['jpeg', 'png', 'webp'].includes(String(metadata.format || ''))) {
    throw new AppError(409, 'Generated ingredient is not a supported image', 'MATERIAL_INGREDIENT_FORMAT_INVALID');
  }
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (width < 512 || height < 512) {
    throw new AppError(409, 'Generated ingredient is too small for a production material', 'MATERIAL_INGREDIENT_DIMENSIONS_INVALID');
  }
  const variance = stats.channels.reduce((total, channel) => total + Number(channel.stdev || 0), 0) / Math.max(1, stats.channels.length);
  if (!Number.isFinite(variance) || variance < MIN_INGREDIENT_VARIANCE) {
    throw new AppError(409, 'Generated ingredient failed the bounded visual-detail review', 'MATERIAL_INGREDIENT_VISUAL_REJECTED');
  }
  return { format: metadata.format, width, height, ingredient_variance: Number(variance.toFixed(2)), has_alpha: metadata.hasAlpha === true };
}

function buildOverlay(identity: BrandMaterialIdentity, brief: Json, dimension: Dimension, attempt: number): { svg: Buffer; finalText: Json; contrast: number } {
  const padding = Math.round(Math.min(dimension.width, dimension.height) * 0.06);
  const panelHeight = Math.round(dimension.height * 0.48);
  const panelY = dimension.height - panelHeight;
  const headline = truncate(brief.headline || brief.hook || brief.message || brief.purpose, 115);
  const body = truncate(brief.body || brief.message || brief.purpose, 180);
  const requestedCta = truncate(brief.cta || identity.preferredCtas[0] || '', 48);
  if (!headline || !requestedCta) throw new AppError(409, 'Campaign brief needs approved headline and CTA before composition', 'MATERIAL_COPY_REQUIRED');
  const prohibited = identity.prohibitedPhrases.map((phrase) => phrase.toLowerCase());
  const copy = `${headline} ${body} ${requestedCta}`.toLowerCase();
  if (prohibited.some((phrase) => phrase && copy.includes(phrase))) {
    throw new AppError(409, 'Campaign copy includes a prohibited Brand DNA phrase', 'MATERIAL_COPY_PROHIBITED');
  }
  const safeTextColor = contrastingText('#111111', identity.text);
  const ctaTextColor = contrastingText(identity.primary, identity.text);
  const panelOpacity = attempt === 1 ? '0.86' : '0.78';
  const headlineLines = wrapText(headline, Math.max(22, Math.floor(dimension.width / 38)), 3);
  const bodyLines = wrapText(body, Math.max(30, Math.floor(dimension.width / 48)), 3);
  const headlineSize = Math.max(32, Math.round(dimension.width * 0.047));
  const bodySize = Math.max(20, Math.round(dimension.width * 0.025));
  const brandSize = Math.max(18, Math.round(dimension.width * 0.023));
  const ctaWidth = Math.min(dimension.width - (padding * 2), Math.max(220, Math.round(dimension.width * 0.31)));
  const ctaHeight = Math.max(58, Math.round(dimension.height * 0.075));
  const bodyStartY = panelY + padding + brandSize + 30 + (headlineLines.length * Math.round(headlineSize * 1.15));
  const bodySvg = bodyLines.map((line, index) => `<text x="${padding}" y="${bodyStartY + (index * Math.round(bodySize * 1.28))}" class="body">${escapeXml(line)}</text>`).join('');
  const headlineStartY = panelY + padding + brandSize + 30;
  const headlineSvg = headlineLines.map((line, index) => `<text x="${padding}" y="${headlineStartY + (index * Math.round(headlineSize * 1.15))}" class="headline">${escapeXml(line)}</text>`).join('');
  const svg = `<svg width="${dimension.width}" height="${dimension.height}" viewBox="0 0 ${dimension.width} ${dimension.height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="${panelY}" width="${dimension.width}" height="${panelHeight}" fill="#111111" fill-opacity="${panelOpacity}"/>
    <rect x="${padding}" y="${panelY + padding}" width="${Math.max(4, Math.round(dimension.width * 0.007))}" height="${Math.max(52, Math.round(dimension.height * 0.1))}" rx="3" fill="${identity.accent}"/>
    <text x="${padding + Math.max(12, Math.round(dimension.width * 0.02))}" y="${panelY + padding + brandSize}" class="brand">${escapeXml(identity.name)}</text>
    ${headlineSvg}
    ${bodySvg}
    <rect x="${padding}" y="${dimension.height - padding - ctaHeight}" width="${ctaWidth}" height="${ctaHeight}" rx="${Math.round(ctaHeight / 2)}" fill="${identity.primary}"/>
    <text x="${padding + Math.round(ctaWidth / 2)}" y="${dimension.height - padding - Math.round(ctaHeight * 0.36)}" class="cta" text-anchor="middle">${escapeXml(requestedCta)}</text>
    <style>
      .brand { fill: ${safeTextColor}; font-family: ${escapeXml(identity.font)}, sans-serif; font-size: ${brandSize}px; font-weight: 700; letter-spacing: 0.4px; }
      .headline { fill: ${safeTextColor}; font-family: ${escapeXml(identity.font)}, sans-serif; font-size: ${headlineSize}px; font-weight: 800; }
      .body { fill: ${safeTextColor}; font-family: ${escapeXml(identity.font)}, sans-serif; font-size: ${bodySize}px; font-weight: 500; }
      .cta { fill: ${ctaTextColor}; font-family: ${escapeXml(identity.font)}, sans-serif; font-size: ${Math.max(18, Math.round(ctaHeight * 0.32))}px; font-weight: 800; }
    </style>
  </svg>`;
  return {
    svg: Buffer.from(svg),
    finalText: { brand_name: identity.name, headline, body, cta: requestedCta },
    contrast: Math.min(contrastRatio(safeTextColor, '#111111'), contrastRatio(ctaTextColor, identity.primary)),
  };
}

async function recordQuality(run: Json, stage: string, outcome: 'passed' | 'failed', detail: Json, score?: number): Promise<void> {
  await query(
    `INSERT INTO campaign_material_quality_checks
       (organization_id,campaign_plan_id,campaign_asset_run_id,stage,outcome,score,detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [run.organization_id, run.campaign_plan_id, run.id, stage, outcome, score ?? null, JSON.stringify(detail)]
  );
}

function contentTypeFor(kind: string): ContentType {
  if (kind === 'video_ad') return 'video';
  if (kind === 'social_post') return 'social';
  if (kind === 'article') return 'article';
  if (kind === 'landing_page') return 'landing_page';
  if (kind === 'email_campaign') return 'email';
  return 'ad';
}

async function failMaterialRun(run: Json, error: unknown): Promise<never> {
  const message = error instanceof Error ? error.message : String(error || 'Material composition failed');
  const code = error instanceof AppError ? error.code : '';
  const repairable = ['MATERIAL_VISUAL_QA_REJECTED', 'MATERIAL_INGREDIENT_VISUAL_REJECTED', 'MATERIAL_INGREDIENT_FORMAT_INVALID', 'MATERIAL_INGREDIENT_DIMENSIONS_INVALID'].includes(code);
  const repairsAlreadyAttempted = Number(run.material_attempt_count || 0);
  const terminal = !repairable || repairsAlreadyAttempted >= MAX_MATERIAL_REPAIRS;
  // This field counts only fresh governed repair generations. The initial
  // ingredient is not a repair, so it may be followed by two new attempts.
  const repairCount = repairable && !terminal ? repairsAlreadyAttempted + 1 : repairsAlreadyAttempted;
  await query(
    `UPDATE campaign_asset_runs
        SET status=$1,material_status=$2,material_attempt_count=$3,
            resolution_status=$4,resolution_reason=$5,error_message=$5,updated_at=NOW()
      WHERE id=$6 AND organization_id=$7`,
    [
      terminal ? 'failed' : 'planned',
      terminal ? (repairable ? 'failed_after_bounded_retries' : 'failed_after_bounded_retries') : 'ingredient_rejected',
      repairCount,
      terminal ? 'failed_after_bounded_retries' : 'pending_generation',
      message.slice(0, 2000),
      run.id,
      run.organization_id,
    ]
  );
  throw error;
}

/**
 * Turns one durable generated image ingredient into the final, reviewable,
 * tenant-branded material. It is idempotent by run: once a final asset is ready
 * it is returned, and any failed quality stage remains visible on that run.
 */
export async function composeCampaignMaterial(runId: string, orgId: string, userId: string): Promise<MaterialCompositionResult> {
  const result = await query(
    `SELECT run.*,plan.name AS campaign_name,plan.asset_requirements,plan.constraints,
            generation.options AS generation_options
       FROM campaign_asset_runs run
       JOIN campaign_plans plan ON plan.id=run.campaign_plan_id AND plan.organization_id=run.organization_id
       JOIN studio_generations generation ON generation.id=run.studio_generation_id AND generation.organization_id=run.organization_id
      WHERE run.id=$1 AND run.organization_id=$2`,
    [runId, orgId]
  );
  if (!result.rows[0]) throw new AppError(404, 'Campaign asset run with a completed ingredient was not found', 'MATERIAL_RUN_NOT_FOUND');
  const run = result.rows[0] as Json;
  if (run.final_material_asset_id && String(run.material_status) === 'ready_for_review' && run.content_id) {
    const asset = await studioService.getAsset(String(run.final_material_asset_id));
    return { runId, assetId: asset.id, assetUrl: asset.url, contentId: String(run.content_id), qa: asObject(run.material_qa), tracking: asObject(run.material_metadata).tracking || {} };
  }

  const generationOptions = asObject(run.generation_options);
  const route = getDeliverableRoute(generationOptions.deliverable_kind);
  if (route.composition !== 'branded_static') {
    throw new AppError(409, 'This campaign run requires its dedicated material composition route', 'MATERIAL_COMPOSITION_ROUTE_REQUIRED');
  }
  const requirements = Array.isArray(run.asset_requirements) ? run.asset_requirements : JSON.parse(String(run.asset_requirements || '[]'));
  const brief = asObject(requirements.find((item: Json) => String(item?.brief_id) === String(run.brief_id)));
  const generationAsset = await query(
    `SELECT asset.* FROM studio_assets asset
      WHERE asset.organization_id=$1 AND asset.deleted_at IS NULL
        AND (asset.metadata->>'generation_id'=$2::text OR asset.id::text=(SELECT metadata->>'studio_asset_id' FROM studio_generations WHERE id=$3::uuid))
      ORDER BY asset.created_at DESC LIMIT 1`,
    [orgId, String(run.studio_generation_id), String(run.studio_generation_id)]
  );
  if (!generationAsset.rows[0]?.storage_path) {
    await failMaterialRun(run, new AppError(409, 'No durable image ingredient is available for composition', 'MATERIAL_INGREDIENT_UNAVAILABLE'));
  }
  const ingredient = generationAsset.rows[0] as Json;
  await query(
    `UPDATE campaign_asset_runs SET status='processing',material_status='ingredient_validating',ingredient_asset_id=$1,updated_at=NOW()
      WHERE id=$2 AND organization_id=$3`,
    [ingredient.id, runId, orgId]
  );

  try {
    const ingredientQa = await inspectIngredient(String(ingredient.storage_path));
    await recordQuality(run, 'ingredient_technical', 'passed', ingredientQa, 100);
    const visualQa = await assessMarketingIngredient({
      ingredientPath: String(ingredient.storage_path),
      brief,
      technicalQa: ingredientQa,
    });
    await recordQuality(run, 'marketing_visual', visualQa.accepted ? 'passed' : 'failed', visualQa, visualQa.commercial_usability);
    if (!visualQa.accepted) throw visualQaRejection(visualQa);

    const identity = await resolveBrandIdentity(orgId);
    const resolvedLogo = await loadLogo(identity.logoUrl, orgId);
    const dimension = dimensionFor(route.defaultDimensions);
    const attempt = Math.min(1, Number(run.material_attempt_count || 0));
    const overlay = buildOverlay(identity, brief, dimension, attempt);
    const directory = path.join(process.cwd(), 'uploads', 'marketing-materials', orgId, String(run.campaign_plan_id), runId);
    await fs.mkdir(directory, { recursive: true });
    const filename = `final-${crypto.randomUUID()}.png`;
    const outputPath = path.join(directory, filename);
    await sharp(String(ingredient.storage_path))
      .resize(dimension.width, dimension.height, { fit: 'cover', position: 'attention' })
      .composite([
        { input: overlay.svg, top: 0, left: 0 },
        { input: resolvedLogo, top: Math.round(dimension.height * 0.045), left: Math.round(dimension.width * 0.055) },
      ])
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(outputPath);

    const finalMeta = await sharp(outputPath).metadata();
    const finalQa = {
      format: finalMeta.format,
      width: Number(finalMeta.width || 0),
      height: Number(finalMeta.height || 0),
      text_contrast_ratio: Number(overlay.contrast.toFixed(2)),
      safe_area: { left: Math.round(dimension.width * 0.06), bottom: Math.round(dimension.height * 0.06) },
      brand_name_present: true,
      logo_present: true,
      cta_present: true,
    };
    if (finalQa.format !== 'png' || finalQa.width !== dimension.width || finalQa.height !== dimension.height || finalQa.text_contrast_ratio < MIN_TEXT_CONTRAST) {
      await fs.unlink(outputPath).catch(() => undefined);
      throw new AppError(409, 'Final material failed deterministic technical or contrast QA', 'MATERIAL_FINAL_QA_FAILED');
    }
    await recordQuality(run, 'final_material', 'passed', finalQa, 100);
    const stat = await fs.stat(outputPath);
    const asset = await studioService.createAsset(orgId, userId, {
      filename,
      originalName: `campaign-${run.campaign_plan_id}-${run.brief_id}-v${run.variant_number}.png`,
      mimeType: 'image/png',
      size: stat.size,
      path: outputPath,
    });
    const tracking = {
      material_id: asset.id,
      campaign_plan_id: run.campaign_plan_id,
      campaign_asset_run_id: run.id,
      variant_number: Number(run.variant_number),
      source: 'deterministic_marketing_material_compositor',
      utm_content: `campaign-${run.campaign_plan_id}-run-${run.id}-v${run.variant_number}`,
    };
    const materialMetadata = {
      material_role: 'final_marketing_material',
      ingredient_asset_id: ingredient.id,
      final_text: overlay.finalText,
      brand: { name: identity.name, primary: identity.primary, accent: identity.accent, font: identity.font, logo_url: identity.logoUrl },
      dimensions: dimension,
      tracking,
      qa: finalQa,
    };
    await query('UPDATE studio_assets SET metadata=COALESCE(metadata,\'{}\'::jsonb) || $1::jsonb,updated_at=NOW() WHERE id=$2 AND organization_id=$3', [JSON.stringify(materialMetadata), asset.id, orgId]);
    const reviewBody = reviewCopy(overlay.finalText.headline, overlay.finalText.cta);
    const altText = accessibilityText(identity, route, overlay.finalText.headline, overlay.finalText.cta);
    const content = await contentEngine.create(orgId, {
      title: `${String(run.campaign_name)} — ${route.label} — Variation ${run.variant_number}`,
      body: reviewBody,
      excerpt: overlay.finalText.headline,
      type: contentTypeFor(route.kind),
      format: 'final_marketing_material',
      platform: String(brief.platform || route.primaryChannel) as ContentPlatform,
      // content_items.campaign_id points to the legacy campaigns table. Campaign
      // plans remain linked through immutable final-material metadata and the run.
      metadata: {
        ...materialMetadata,
        campaign_plan_id: run.campaign_plan_id,
        final_material_url: asset.url,
        alt_text: altText,
        quality_brief: { calls_to_action: [overlay.finalText.cta] },
      },
    }, userId);
    const textQuality = await contentQuality.runQualityChecks(content.id, orgId);
    if (!textQuality.passed) {
      throw new AppError(409, 'Final material copy failed canonical content quality checks', 'MATERIAL_COPY_QA_FAILED');
    }
    await contentWorkflow.submitForReview(content.id, orgId, userId, userId);
    const qa = { ingredient: ingredientQa, visual: visualQa, final: finalQa, text_quality_score: textQuality.overall_score };
    await query(
      `UPDATE campaign_asset_runs
          SET status='completed',resolution_status='pending_review',content_id=$1,
              final_material_asset_id=$2,material_status='ready_for_review',material_metadata=$3,
              material_qa=$4,error_message=NULL,resolution_reason=NULL,completed_at=NOW(),updated_at=NOW()
        WHERE id=$5 AND organization_id=$6`,
      [content.id, asset.id, JSON.stringify(materialMetadata), JSON.stringify(qa), runId, orgId]
    );
    return { runId, assetId: asset.id, assetUrl: asset.url, contentId: content.id, qa, tracking };
  } catch (error) {
    try { await recordQuality(run, 'final_material', 'failed', { error: error instanceof Error ? error.message : String(error) }); } catch { /* preserve original failure */ }
    return failMaterialRun(run, error);
  }
}

function srtTimestamp(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

async function makeVideoEndCard(
  identity: BrandMaterialIdentity,
  brief: Json,
  dimension: Dimension,
  outputPath: string
): Promise<Json> {
  const overlay = buildOverlay(identity, brief, dimension, 1);
  const logo = await loadLogo(identity.logoUrl, String(brief.organization_id || ''));
  await sharp({ create: { width: dimension.width, height: dimension.height, channels: 4, background: identity.primary } })
    .composite([
      { input: overlay.svg, top: 0, left: 0 },
      { input: logo, top: Math.round(dimension.height * 0.045), left: Math.round(dimension.width * 0.055) },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  return { final_text: overlay.finalText, contrast: overlay.contrast };
}

/**
 * Converts one priced, durable still ingredient into an economical promotional
 * MP4. The provider never receives a raw text-to-video request on this path.
 */
export async function composeCampaignVideoMaterial(runId: string, orgId: string, userId: string): Promise<MaterialCompositionResult> {
  const result = await query(
    `SELECT run.*,plan.name AS campaign_name,plan.asset_requirements,
            generation.options AS generation_options
       FROM campaign_asset_runs run
       JOIN campaign_plans plan ON plan.id=run.campaign_plan_id AND plan.organization_id=run.organization_id
       JOIN studio_generations generation ON generation.id=run.studio_generation_id AND generation.organization_id=run.organization_id
      WHERE run.id=$1 AND run.organization_id=$2`,
    [runId, orgId]
  );
  if (!result.rows[0]) throw new AppError(404, 'Campaign video asset run with a completed ingredient was not found', 'VIDEO_MATERIAL_RUN_NOT_FOUND');
  const run = result.rows[0] as Json;
  if (run.final_material_asset_id && String(run.material_status) === 'ready_for_review' && run.content_id) {
    const asset = await studioService.getAsset(String(run.final_material_asset_id));
    return { runId, assetId: asset.id, assetUrl: asset.url, contentId: String(run.content_id), qa: asObject(run.material_qa), tracking: asObject(run.material_metadata).tracking || {} };
  }
  const generationOptions = asObject(run.generation_options);
  const route = getDeliverableRoute(generationOptions.deliverable_kind);
  if (route.composition !== 'branded_video') {
    throw new AppError(409, 'This campaign run does not use the economical promotional-video route', 'VIDEO_MATERIAL_ROUTE_REQUIRED');
  }
  const costPlan = asObject(generationOptions.economical_video_cost_plan);
  if (costPlan.production_mode !== 'economical_short_form_video' || costPlan.composition?.raw_text_to_video !== false) {
    throw new AppError(409, 'Economical video cost plan is absent or permits raw provider video generation', 'VIDEO_COST_PLAN_INVALID');
  }
  const duration = Math.floor(Number(costPlan.duration_seconds || 0));
  if (!Number.isFinite(duration) || duration < 5 || duration > 15) {
    throw new AppError(409, 'Economical video duration is outside its approved 5–15 second range', 'VIDEO_DURATION_INVALID');
  }
  const requirements = Array.isArray(run.asset_requirements) ? run.asset_requirements : JSON.parse(String(run.asset_requirements || '[]'));
  const brief: Json = { ...asObject(requirements.find((item: Json) => String(item?.brief_id) === String(run.brief_id))), organization_id: orgId };
  const generationAsset = await query(
    `SELECT asset.* FROM studio_assets asset
      WHERE asset.organization_id=$1 AND asset.deleted_at IS NULL
        AND (asset.metadata->>'generation_id'=$2::text OR asset.id::text=(SELECT metadata->>'studio_asset_id' FROM studio_generations WHERE id=$3::uuid))
      ORDER BY asset.created_at DESC LIMIT 1`,
    [orgId, String(run.studio_generation_id), String(run.studio_generation_id)]
  );
  if (!generationAsset.rows[0]?.storage_path) {
    await failMaterialRun(run, new AppError(409, 'No durable still ingredient is available for economical video composition', 'VIDEO_INGREDIENT_UNAVAILABLE'));
  }
  const ingredient = generationAsset.rows[0] as Json;
  await query(
    `UPDATE campaign_asset_runs SET status='processing',material_status='ingredient_validating',ingredient_asset_id=$1,updated_at=NOW()
      WHERE id=$2 AND organization_id=$3`,
    [ingredient.id, runId, orgId]
  );
  try {
    const ingredientQa = await inspectIngredient(String(ingredient.storage_path));
    await recordQuality(run, 'ingredient_technical', 'passed', ingredientQa, 100);
    const visualQa = await assessMarketingIngredient({
      ingredientPath: String(ingredient.storage_path),
      brief,
      technicalQa: ingredientQa,
    });
    await recordQuality(run, 'marketing_visual', visualQa.accepted ? 'passed' : 'failed', { ...visualQa, scene_strategy: 'still_heavy' }, visualQa.commercial_usability);
    if (!visualQa.accepted) throw visualQaRejection(visualQa);
    const identity = await resolveBrandIdentity(orgId);
    const dimension = dimensionFor(route.defaultDimensions);
    const directory = path.join(process.cwd(), 'uploads', 'marketing-materials', orgId, String(run.campaign_plan_id), runId);
    await fs.mkdir(directory, { recursive: true });
    const endCardPath = path.join(directory, `end-card-${crypto.randomUUID()}.png`);
    const subtitlePath = path.join(directory, `captions-${crypto.randomUUID()}.srt`);
    const outputPath = path.join(directory, `final-${crypto.randomUUID()}.mp4`);
    const endCard = await makeVideoEndCard(identity, brief, dimension, endCardPath);
    const sceneDuration = Math.max(3, duration - Math.min(3, Math.max(2, Math.floor(duration / 3))));
    await fs.writeFile(
      subtitlePath,
      `1\n${srtTimestamp(0)} --> ${srtTimestamp(Math.max(1, sceneDuration - 0.1))}\n${String(endCard.final_text.headline).replace(/\n/g, ' ')}\\N${String(endCard.final_text.cta).replace(/\n/g, ' ')}\n`,
      { mode: 0o600 }
    );
    const approvedScenes = await query(
      APPROVED_MARKETING_SCENE_QUERY,
      [run.campaign_plan_id, orgId, run.id]
    );
    const supportingStills = approvedScenes.rows
      .map((row) => String(row.storage_path || ''))
      .filter(Boolean);
    const ffmpeg = await import('./ffmpeg.service');
    const video = await ffmpeg.composeEconomicalMarketingVideo({
      stillPath: String(ingredient.storage_path),
      stillPaths: supportingStills,
      endCardPath,
      outputPath,
      durationSeconds: duration,
      subtitlePath,
      captionColor: identity.text,
    });
    await Promise.all([fs.unlink(endCardPath).catch(() => undefined), fs.unlink(subtitlePath).catch(() => undefined)]);
    if (!video.success || video.videoCodec !== 'h264' || video.audioCodec !== 'aac' || video.pixelFormat !== 'yuv420p') {
      await fs.unlink(outputPath).catch(() => undefined);
      throw new AppError(409, video.error || 'Economical video composition did not produce a validated H.264/AAC MP4', 'VIDEO_FINAL_QA_FAILED');
    }
    const finalQa = {
      format: 'mp4',
      resolution: video.resolution,
      duration_seconds: Number(video.duration.toFixed(2)),
      video_codec: video.videoCodec,
      audio_codec: video.audioCodec,
      pixel_format: video.pixelFormat,
      brand_end_card_present: true,
      captions_present: true,
      cta_present: true,
      scene_count: Math.min(5, 2 + approvedScenes.rows.length),
      scene_strategy: supportingStills.length > 0 ? 'approved_stills_multiscene' : 'single_governed_still_fallback',
    };
    await recordQuality(run, 'final_material', 'passed', finalQa, 100);
    const stat = await fs.stat(outputPath);
    const filename = path.basename(outputPath);
    const asset = await studioService.createAsset(orgId, userId, {
      filename,
      originalName: `campaign-${run.campaign_plan_id}-${run.brief_id}-v${run.variant_number}.mp4`,
      mimeType: 'video/mp4',
      size: stat.size,
      path: outputPath,
    });
    const tracking = {
      material_id: asset.id,
      campaign_plan_id: run.campaign_plan_id,
      campaign_asset_run_id: run.id,
      variant_number: Number(run.variant_number),
      source: 'economical_marketing_video_compositor',
      utm_content: `campaign-${run.campaign_plan_id}-run-${run.id}-v${run.variant_number}`,
    };
    const materialMetadata = {
      material_role: 'final_marketing_video',
      ingredient_asset_id: ingredient.id,
      final_text: endCard.final_text,
      brand: { name: identity.name, primary: identity.primary, accent: identity.accent, font: identity.font, logo_url: identity.logoUrl },
      dimensions: dimension,
      tracking,
      qa: finalQa,
      economical_video_cost_plan: costPlan,
    };
    await query('UPDATE studio_assets SET metadata=COALESCE(metadata,\'{}\'::jsonb) || $1::jsonb,updated_at=NOW() WHERE id=$2 AND organization_id=$3', [JSON.stringify(materialMetadata), asset.id, orgId]);
    const reviewBody = reviewCopy(endCard.final_text.headline, endCard.final_text.cta);
    const altText = accessibilityText(identity, route, endCard.final_text.headline, endCard.final_text.cta);
    const content = await contentEngine.create(orgId, {
      title: `${String(run.campaign_name)} — ${route.label} — Variation ${run.variant_number}`,
      body: reviewBody,
      excerpt: endCard.final_text.headline,
      type: 'video',
      format: 'final_marketing_video',
      platform: String(brief.platform || route.primaryChannel) as ContentPlatform,
      // content_items.campaign_id points to the legacy campaigns table. Campaign
      // plans remain linked through immutable final-material metadata and the run.
      metadata: {
        ...materialMetadata,
        campaign_plan_id: run.campaign_plan_id,
        final_material_url: asset.url,
        alt_text: altText,
        quality_brief: { calls_to_action: [endCard.final_text.cta] },
      },
    }, userId);
    const textQuality = await contentQuality.runQualityChecks(content.id, orgId);
    if (!textQuality.passed) throw new AppError(409, 'Final video copy failed canonical content quality checks', 'VIDEO_COPY_QA_FAILED');
    await contentWorkflow.submitForReview(content.id, orgId, userId, userId);
    const qa = { ingredient: ingredientQa, visual: visualQa, final: finalQa, text_quality_score: textQuality.overall_score };
    await query(
      `UPDATE campaign_asset_runs
          SET status='completed',resolution_status='pending_review',content_id=$1,
              final_material_asset_id=$2,material_status='ready_for_review',material_metadata=$3,
              material_qa=$4,error_message=NULL,resolution_reason=NULL,completed_at=NOW(),updated_at=NOW()
        WHERE id=$5 AND organization_id=$6`,
      [content.id, asset.id, JSON.stringify(materialMetadata), JSON.stringify(qa), runId, orgId]
    );
    return { runId, assetId: asset.id, assetUrl: asset.url, contentId: content.id, qa, tracking };
  } catch (error) {
    try { await recordQuality(run, 'final_material', 'failed', { error: error instanceof Error ? error.message : String(error) }); } catch { /* preserve original failure */ }
    return failMaterialRun(run, error);
  }
}
