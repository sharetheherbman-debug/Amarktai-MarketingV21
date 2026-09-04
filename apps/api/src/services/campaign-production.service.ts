import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import type { ContentPlatform, ContentType, GenerateContentRequest } from '../types';
import { getGenerationQueue } from './studio.service';
import * as studioService from './studio.service';
import { legacyProductLine, normalizeProductScopes } from '../utils/product-scope';
import { getDeliverableRoute, type MarketingGenerationOperation } from './marketing-deliverable-registry.service';
import { routeMarketingGeneration } from './marketing-generation-policy.service';
import { composeCampaignMaterial, composeCampaignVideoMaterial } from './marketing-material-compositor.service';
import { buildEconomicalVideoCostPlan } from './economical-video-policy.service';
import { findOrImportCampaignStockAsset, findReusableStudioAsset, useLibraryItem } from './library-tools.service';
import { getItem as getLibraryItem } from './marketing-library.service';

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object') return value as Record<string, any>;
  try { return JSON.parse(String(value || '{}')) as Record<string, any>; } catch { return {}; }
}

function mediaOperation(format: string): string | null {
  const value = format.toLowerCase();
  if (/video|reel|film|clip/.test(value)) return 'text_to_video';
  if (/image|photo|graphic|banner|carousel|visual/.test(value)) return 'text_to_image';
  if (/audio|voice|podcast|narration/.test(value)) return 'text_to_speech';
  return null;
}

function contentType(format: string, platform: string): ContentType {
  const value = `${format} ${platform}`.toLowerCase();
  if (/email|newsletter/.test(value)) return /newsletter/.test(value) ? 'newsletter' : 'email';
  if (/landing/.test(value)) return 'landing_page';
  if (/advert|\bad\b/.test(value)) return 'ad';
  if (/social|facebook|instagram|linkedin|threads|\bx\b/.test(value)) return 'social';
  if (/article|thought|education|long.form/.test(value)) return 'article';
  return 'blog';
}

function planScopes(plan: Record<string, any>): string[] {
  const raw = typeof plan.product_lines === 'string'
    ? (() => { try { return JSON.parse(plan.product_lines); } catch { return []; } })()
    : plan.product_lines;
  return normalizeProductScopes(Array.isArray(raw) && raw.length > 0 ? raw : plan.product_line);
}

export type CampaignRunSpec = {
  brief: Record<string, any>;
  briefId: string;
  variant: number;
  canonicalRoute: ReturnType<typeof getDeliverableRoute> | null;
  operation: string | null;
};

/** The sole run-expansion path used before durable campaign_asset_runs upserts. */
export function buildCampaignRunSpecs(requirements: unknown[]): CampaignRunSpec[] {
  const specs: CampaignRunSpec[] = [];
  requirements.forEach((requirement, index) => {
    const brief = asObject(requirement);
    const briefId = String(brief.brief_id || `brief-${index + 1}`).slice(0, 255);
    const variationLimit = brief.governed_owner_deliverable === true ? 12 : 3;
    const variants = Math.max(1, Math.min(Number(brief.variations || 1), variationLimit));
    const canonicalRoute = brief.governed_owner_deliverable === true
      ? getDeliverableRoute(brief.deliverable_kind)
      : null;
    const operation = canonicalRoute?.ingredientOperation || mediaOperation(String(brief.format || brief.content_type || ''));
    for (let variant = 1; variant <= variants; variant += 1) {
      specs.push({ brief, briefId, variant, canonicalRoute, operation });
    }
  });
  return specs;
}

function assetPrompt(plan: Record<string, any>, brief: Record<string, any>, variant: number): string {
  const scopes = planScopes(plan);
  return `Create variation ${variant} of this internally validated marketing deliverable.
Use the validated strategy and business facts as the only source of claims. Preserve the offer, central concept and CTA while adapting composition, hook, pacing and hierarchy to the specified channel. Never invent facts, statistics, testimonials, guarantees, certifications, prices, product capability or proof. Keep facts from different products/services correctly attributed when multiple scopes are selected.

MARKETING QUALITY REQUIREMENTS:
- Produce a conversion-oriented promotional deliverable, not a generic aesthetic image or filler content.
- Make the subject, offer context and campaign objective immediately clear for the intended platform.
- Use a polished layout with clean focal hierarchy, suitable contrast and safe negative space for deterministic branded overlays where relevant.
- Do not generate textual claims, logos, watermarks, UI or illegible pseudo-text inside visual media. Those are applied only by an approved composition step.
- Respect the campaign visual direction, voice, approved CTA and accessibility requirements.
- This output remains pending review until the durable quality and approval gates complete; do not imply that unreviewed media is client-ready.

VALIDATED CAMPAIGN:
${JSON.stringify({ product_lines: scopes.length > 0 ? scopes : ['unclassified'], brief: asObject(plan.brief), creative_concept: asObject(plan.creative_concept), messaging_plan: asObject(plan.messaging_plan), constraints: asObject(plan.constraints) }, null, 2)}

ASSET BRIEF:
${JSON.stringify(brief, null, 2)}`;
}

export async function queueCampaignProduction(planId: string, orgId: string, userId: string): Promise<Record<string, unknown>[]> {
  const result = await query('SELECT * FROM campaign_plans WHERE id=$1 AND organization_id=$2', [planId, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Campaign plan');
  const plan = result.rows[0] as Record<string, any>;
  const productLines = planScopes(plan);
  const productLine = legacyProductLine(productLines);
  if (String(plan.strategy_validation_status || 'pending') !== 'valid') {
    throw new AppError(409, 'Resolve campaign strategy validation exceptions before generating assets', 'CAMPAIGN_PLAN_VALIDATION_REQUIRED');
  }
  const requirements = Array.isArray(plan.asset_requirements)
    ? plan.asset_requirements : JSON.parse(String(plan.asset_requirements || '[]'));
  if (requirements.length === 0) throw new AppError(409, 'The campaign has no asset briefs', 'CAMPAIGN_ASSETS_MISSING');

  for (const { brief, briefId, variant, canonicalRoute, operation } of buildCampaignRunSpecs(requirements)) {
      const inserted = await query(
        `INSERT INTO campaign_asset_runs
           (organization_id,campaign_plan_id,brief_id,variant_number,product_line,product_lines,generation_kind,status,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'planned',$8)
         ON CONFLICT (campaign_plan_id,brief_id,variant_number)
         DO UPDATE SET product_line=EXCLUDED.product_line,product_lines=EXCLUDED.product_lines,updated_at=NOW()
         RETURNING *`,
        [orgId, planId, briefId, variant, productLine, JSON.stringify(productLines), operation ? 'media' : 'text', userId]
      );
      const existingRun = inserted.rows[0];
      if (['queueing','queued','processing','pending_control','completed'].includes(String(existingRun.status))) continue;

      const claimed = await query(
        `UPDATE campaign_asset_runs
         SET status='queueing',resolution_status='pending_generation',
             attempt_count=attempt_count+1,error_message=NULL,updated_at=NOW()
         WHERE id=$1 AND status IN ('planned','failed','cancelled')
         RETURNING *`,
        [existingRun.id]
      );
      if (claimed.rows.length === 0) continue;
      const run = claimed.rows[0];
      const attempt = Number(run.attempt_count);
      const prompt = assetPrompt(plan, brief, variant);

      try {
        if (operation && operation !== 'text_generation') {
          const requestedDuration = Number(brief.duration_seconds || 0);
          const boundedVideoDuration = operation === 'text_to_video'
            ? Math.max(5, Math.min(15, requestedDuration || 15))
            : undefined;
          const premiumPermitted = brief.premium_permitted === true
            && asObject(plan.constraints).premium_generation_approved === true;
          const requestedLibraryId=String(brief.library_item_id||brief.library_layout_id||brief.library_video_recipe_id||'');
          const requestedLibraryItem=requestedLibraryId?await getLibraryItem(orgId,requestedLibraryId):null;
          if(requestedLibraryItem&&requestedLibraryItem.approval_status!=='approved') throw new AppError(409,'The selected Marketing Library item requires owner approval','LIBRARY_ITEM_APPROVAL_REQUIRED');
          const modelRoute = await routeMarketingGeneration({
            organizationId: orgId,
            operation: operation as MarketingGenerationOperation,
            tier: brief.generation_tier || brief.production_tier || 'recommended',
            quantity: 1,
            campaignCreditLimit: Number(plan.generation_credit_limit || 0),
            premiumPermitted,
            requiredFormat: canonicalRoute?.defaultDimensions || String(brief.default_dimensions || brief.dimensions_or_length || ''),
          });
          const recipeDuration=Number(asObject(requestedLibraryItem?.definition).duration_seconds||0);
          const reusableDuration=operation==='text_to_video'?Math.max(5,Math.min(15,requestedDuration||recipeDuration||15)):undefined;
          const libraryVideoCostPlan=canonicalRoute?.composition==='branded_video'?buildEconomicalVideoCostPlan(reusableDuration||brief.duration_seconds,modelRoute):null;
          const existingLibraryAsset = requestedLibraryItem?.studio_asset_id ? requestedLibraryItem : await findReusableStudioAsset(orgId,{
            platform:String(brief.platform || canonicalRoute?.primaryChannel || '') || undefined,
            tags:[String(brief.purpose || ''),String(brief.format || ''),canonicalRoute?.kind || ''].filter(Boolean),
          });
          const stockSearchText=[brief.visual_direction,brief.subject,brief.purpose,brief.message,brief.format]
            .map((value)=>String(value||'').trim()).filter(Boolean).join(' ').slice(0,160);
          const reusable = existingLibraryAsset || ((canonicalRoute?.composition === 'branded_static' || canonicalRoute?.composition === 'branded_video')
            ? await findOrImportCampaignStockAsset(orgId,userId,{
                query:stockSearchText || String(asObject(plan.brief).offer || plan.goal || plan.name),
                platform:String(brief.platform || canonicalRoute?.primaryChannel || '') || undefined,
                tags:[String(brief.purpose || ''),String(brief.format || ''),canonicalRoute?.kind || ''].filter(Boolean),
                mediaType:'photo',
              })
            : null);
          if (reusable && (canonicalRoute?.composition === 'branded_static' || canonicalRoute?.composition === 'branded_video')) {
            const libraryGenerationOptions = {
              deliverable_kind:canonicalRoute.kind,material_type:canonicalRoute.materialType,composition_mode:canonicalRoute.composition,
              duration_seconds:reusableDuration,economical_video_cost_plan:libraryVideoCostPlan,
            };
            await query(
              `UPDATE campaign_asset_runs SET ingredient_asset_id=$1,status='processing',material_status='ingredient_validating',
                 material_metadata=COALESCE(material_metadata,'{}'::jsonb) || $2::jsonb,updated_at=NOW() WHERE id=$3 AND organization_id=$4`,
              [reusable.studio_asset_id,JSON.stringify({library_item_id:reusable.id,library_reused:true,stock_first:reusable.source_kind==='stock_provider',library_generation_options:libraryGenerationOptions,library_layout:requestedLibraryItem?.kind?.includes('layout')?requestedLibraryItem.definition:null,library_video_recipe:requestedLibraryItem?.kind==='video_recipe'?requestedLibraryItem.definition:null}),run.id,orgId]
            );
            await useLibraryItem(orgId,String(reusable.id),{campaignPlanId:planId,campaignRunId:String(run.id)});
            if(canonicalRoute.composition === 'branded_video') await composeCampaignVideoMaterial(String(run.id),orgId,userId);
            else await composeCampaignMaterial(String(run.id),orgId,userId);
            continue;
          }
          const economicalVideoCostPlan = canonicalRoute?.composition === 'branded_video'
            ? buildEconomicalVideoCostPlan(boundedVideoDuration || brief.duration_seconds, modelRoute)
            : null;
          const existingGeneration = run.studio_generation_id
            ? await studioService.getGeneration(String(run.studio_generation_id), orgId)
            : null;
          if (existingGeneration?.status === 'completed' && (canonicalRoute?.composition === 'branded_static' || canonicalRoute?.composition === 'branded_video')) {
            if (canonicalRoute.composition === 'branded_video') {
              await composeCampaignVideoMaterial(String(run.id), orgId, userId);
            } else {
              await composeCampaignMaterial(String(run.id), orgId, userId);
            }
            continue;
          }
          const generation = run.studio_generation_id
            ? await studioService.retryGeneration(String(run.studio_generation_id), orgId, userId)
            : await studioService.createGeneration(orgId, userId, {
              type: operation,
              model: modelRoute.modelId,
              prompt,
              options: {
                campaign_plan_id: planId,
                brief_id: briefId,
                variant_number: variant,
                product_line: productLine,
                product_lines: productLines,
                idempotency_key: `campaign-asset:${run.id}`,
                // A variation is one governed provider request. Duration is never a
                // quantity: this avoids accidentally creating many paid jobs.
                quantity: 1,
                duration_seconds: boundedVideoDuration,
                production_mode: brief.production_mode || (operation === 'text_to_video' ? 'economical_short_form_video' : 'branded_marketing_asset'),
                accessibility_text: brief.accessibility_requirements || [],
                deliverable_kind: canonicalRoute?.kind || null,
                material_type: canonicalRoute?.materialType || null,
                composition_mode: canonicalRoute?.composition || null,
                model_routing: modelRoute,
                economical_video_cost_plan: economicalVideoCostPlan,
                library_item_id: requestedLibraryItem?.id || null,
                library_layout: requestedLibraryItem?.kind?.includes('layout') ? requestedLibraryItem.definition : null,
                library_video_recipe: requestedLibraryItem?.kind === 'video_recipe' ? requestedLibraryItem.definition : null,
              },
            });
          await query(
            `UPDATE campaign_asset_runs SET studio_generation_id=$1,status='queued',updated_at=NOW() WHERE id=$2`,
            [generation.id, run.id]
          );
        } else {
          const request = {
            type: contentType(String(brief.format || ''), String(brief.platform || '')),
            platform: (brief.platform || undefined) as ContentPlatform | undefined,
            title: `${String(plan.name)} - ${String(brief.purpose || brief.format || briefId)} - variation ${variant}`,
            prompt,
            campaign_plan_id: planId,
            brief_id: briefId,
            product_line: (productLine || undefined) as GenerateContentRequest['product_line'],
            product_lines: productLines,
            audience: JSON.stringify(asObject(plan.brief).audience_segments || []),
            objective: String(asObject(plan.brief).objective || plan.goal || ''),
            offer: String(asObject(plan.brief).offer || ''),
            calls_to_action: asObject(plan.brief).calls_to_action || [],
            prohibited_claims: asObject(plan.constraints).prohibited_claims || [],
            idempotency_key: `campaign-asset:${run.id}`,
            deliverable_kind: canonicalRoute?.kind,
            composition_mode: canonicalRoute?.composition,
            material_type: canonicalRoute?.materialType,
            channel: canonicalRoute?.primaryChannel || String(brief.platform || ''),
            requires_owner_approval: canonicalRoute?.requiresOwnerApproval ?? true,
            dimensions_or_format: canonicalRoute?.defaultDimensions || String(brief.dimensions_or_length || ''),
          } as GenerateContentRequest & { product_lines: string[] };
          const job = await getGenerationQueue().add('campaign-text', {
            kind: 'campaign-text', runId: run.id, organizationId: orgId, userId, request,
          }, {
            jobId: `campaign-text-${run.id}-attempt-${attempt}`,
            attempts: 60,
            backoff: { type: 'fixed', delay: 30_000 },
            removeOnComplete: { age: 86400 },
            removeOnFail: { age: 604800 },
          });
          await query(
            `UPDATE campaign_asset_runs SET queue_job_id=$1,status='queued',updated_at=NOW() WHERE id=$2`,
            [String(job.id), run.id]
          );
        }
      } catch (error) {
        await query(
          `UPDATE campaign_asset_runs SET status='failed',error_message=$1,updated_at=NOW() WHERE id=$2`,
          [error instanceof Error ? error.message.slice(0, 2000) : 'Asset could not be queued', run.id]
        );
      }
  }
  return listCampaignProduction(planId, orgId);
}

/**
 * Queues a distinct governed replacement ingredient after the existing run's
 * visual gate rejects its prior ingredient. The campaign run stays canonical;
 * only its Studio generation changes, so a repair can never create a second
 * final material or silently replay an already approved one.
 */
export async function queueCampaignMaterialRepair(input: {
  runId: string;
  organizationId: string;
  userId: string;
}): Promise<string | null> {
  const source = await query(
    `SELECT run.*, plan.asset_requirements,plan.constraints,plan.generation_credit_limit,
            plan.product_line,plan.product_lines, generation.options AS generation_options
       FROM campaign_asset_runs run
       JOIN campaign_plans plan ON plan.id=run.campaign_plan_id AND plan.organization_id=run.organization_id
       LEFT JOIN studio_generations generation ON generation.id=run.studio_generation_id AND generation.organization_id=run.organization_id
      WHERE run.id=$1 AND run.organization_id=$2`,
    [input.runId, input.organizationId]
  );
  if (!source.rows[0]) throw new NotFoundError('Campaign asset run');
  const run = source.rows[0] as Record<string, any>;
  if (String(run.material_status) !== 'ingredient_rejected' || String(run.resolution_status) !== 'pending_generation') return null;
  const claimed = await query(
    `UPDATE campaign_asset_runs
        SET status='queueing',resolution_status='repair_queueing',updated_at=NOW()
      WHERE id=$1 AND organization_id=$2 AND material_status='ingredient_rejected'
        AND resolution_status='pending_generation' AND status='planned'
      RETURNING *`,
    [input.runId, input.organizationId]
  );
  if (!claimed.rows[0]) return null;
  const claimedRun = claimed.rows[0] as Record<string, any>;
  const requirements = Array.isArray(run.asset_requirements) ? run.asset_requirements : JSON.parse(String(run.asset_requirements || '[]'));
  const brief = asObject(requirements.find((item: Record<string, any>) => String(item?.brief_id) === String(run.brief_id)));
  const previousOptions = asObject(run.generation_options);
  const route = getDeliverableRoute(previousOptions.deliverable_kind || brief.deliverable_kind);
  if (!route.composition || !route.ingredientOperation) {
    throw new AppError(409, 'Rejected campaign material has no canonical governed ingredient route', 'MATERIAL_REPAIR_ROUTE_REQUIRED');
  }
  const latestVisualQa = await query(
    `SELECT detail FROM campaign_material_quality_checks
      WHERE campaign_asset_run_id=$1 AND organization_id=$2 AND stage='marketing_visual' AND outcome='failed'
      ORDER BY created_at DESC LIMIT 1`,
    [input.runId, input.organizationId]
  );
  const visualQa = asObject(latestVisualQa.rows[0]?.detail);
  const repairs = Array.isArray(visualQa.repair_instructions)
    ? visualQa.repair_instructions.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8)
    : [];
  const repairInstructions = repairs.length > 0
    ? repairs.join('\n- ')
    : 'Use a professional campaign-relevant subject with clear safe negative space. Do not render text, logos, watermarks, fake claims or visual artifacts.';
  const plan = { ...run, product_lines: run.product_lines, product_line: run.product_line };
  const premiumPermitted = brief.premium_permitted === true && asObject(run.constraints).premium_generation_approved === true;
  try {
    const modelRoute = await routeMarketingGeneration({
      organizationId: input.organizationId,
      operation: route.ingredientOperation as MarketingGenerationOperation,
      tier: brief.generation_tier || brief.production_tier || 'recommended',
      quantity: 1,
      campaignCreditLimit: Number(run.generation_credit_limit || 0),
      premiumPermitted,
      requiredFormat: route.defaultDimensions,
    });
    const repairAttempt = Number(claimedRun.material_attempt_count || 0);
    const prompt = `${assetPrompt(plan, brief, Number(run.variant_number))}\n\nVISUAL QA REPAIR REQUIRED:\n- ${repairInstructions}\nCreate a new corrected ingredient. Do not reuse the rejected image.`;
    const generation = await studioService.createGeneration(input.organizationId, input.userId, {
      type: route.ingredientOperation,
      model: modelRoute.modelId,
      prompt,
      options: {
        ...previousOptions,
        campaign_plan_id: run.campaign_plan_id,
        brief_id: run.brief_id,
        variant_number: Number(run.variant_number),
        quantity: 1,
        idempotency_key: `campaign-asset:${run.id}:repair:${repairAttempt}`,
        repair_of_generation_id: run.studio_generation_id,
        repair_attempt: repairAttempt,
        repair_instructions: repairs,
        model_routing: modelRoute,
      },
    });
    const repairEvidence = {
      repair_attempt: repairAttempt,
      rejected_generation_id: run.studio_generation_id,
      replacement_generation_id: generation.id,
      rejection_reasons: Array.isArray(visualQa.rejection_reasons) ? visualQa.rejection_reasons : [],
      repair_instructions: repairs,
      queued_at: new Date().toISOString(),
    };
    await query(
      `UPDATE campaign_asset_runs
          SET studio_generation_id=$1,status='queued',material_status='pending_ingredient',
              resolution_status='pending_generation',ingredient_asset_id=NULL,error_message=NULL,
              material_metadata=jsonb_set(COALESCE(material_metadata,'{}'::jsonb),'{repair_history}',
                COALESCE(material_metadata->'repair_history','[]'::jsonb) || $2::jsonb,true),updated_at=NOW()
        WHERE id=$3 AND organization_id=$4`,
      [generation.id, JSON.stringify([repairEvidence]), input.runId, input.organizationId]
    );
    return generation.id;
  } catch (error) {
    await query(
      `UPDATE campaign_asset_runs
          SET status='failed',material_status='failed_after_bounded_retries',resolution_status='failed_after_bounded_retries',
              resolution_reason=$1,error_message=$1,updated_at=NOW()
        WHERE id=$2 AND organization_id=$3`,
      [error instanceof Error ? error.message.slice(0, 2000) : 'Governed repair could not be queued', input.runId, input.organizationId]
    );
    throw error;
  }
}

export async function listCampaignProduction(planId: string, orgId: string): Promise<Record<string, unknown>[]> {
  return (await query(
    `SELECT * FROM campaign_asset_runs WHERE campaign_plan_id=$1 AND organization_id=$2
     ORDER BY brief_id,variant_number`, [planId, orgId]
  )).rows;
}
