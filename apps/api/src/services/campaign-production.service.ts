import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import type { ContentPlatform, ContentType, GenerateContentRequest } from '../types';
import { generationQueue } from './studio.service';
import * as studioService from './studio.service';

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

function assetPrompt(plan: Record<string, any>, brief: Record<string, any>, variant: number): string {
  return `Create variation ${variant} of this internally validated campaign asset brief.
Use the validated strategy and business facts as the only source of claims. Preserve the offer, central concept and CTA while adapting structure and length to the specified channel. Never invent facts, statistics, testimonials, guarantees, certifications or prices.

VALIDATED CAMPAIGN:
${JSON.stringify({ brief: asObject(plan.brief), creative_concept: asObject(plan.creative_concept), messaging_plan: asObject(plan.messaging_plan), constraints: asObject(plan.constraints) }, null, 2)}

ASSET BRIEF:
${JSON.stringify(brief, null, 2)}`;
}

export async function queueCampaignProduction(planId: string, orgId: string, userId: string): Promise<Record<string, unknown>[]> {
  const result = await query('SELECT * FROM campaign_plans WHERE id=$1 AND organization_id=$2', [planId, orgId]);
  if (result.rows.length === 0) throw new NotFoundError('Campaign plan');
  const plan = result.rows[0] as Record<string, any>;
  if (String(plan.strategy_validation_status || 'pending') !== 'valid') {
    throw new AppError(409, 'Resolve campaign strategy validation exceptions before generating assets', 'CAMPAIGN_PLAN_VALIDATION_REQUIRED');
  }
  const requirements = Array.isArray(plan.asset_requirements)
    ? plan.asset_requirements : JSON.parse(String(plan.asset_requirements || '[]'));
  if (requirements.length === 0) throw new AppError(409, 'The campaign has no asset briefs', 'CAMPAIGN_ASSETS_MISSING');

  for (let index = 0; index < requirements.length; index += 1) {
    const brief = asObject(requirements[index]);
    const briefId = String(brief.brief_id || `brief-${index + 1}`).slice(0, 255);
    const variants = Math.max(1, Math.min(Number(brief.variations || 1), 3));
    for (let variant = 1; variant <= variants; variant += 1) {
      const operation = mediaOperation(String(brief.format || brief.content_type || ''));
      const inserted = await query(
        `INSERT INTO campaign_asset_runs
           (organization_id,campaign_plan_id,brief_id,variant_number,generation_kind,status,created_by)
         VALUES ($1,$2,$3,$4,$5,'planned',$6)
         ON CONFLICT (campaign_plan_id,brief_id,variant_number)
         DO UPDATE SET updated_at=NOW()
         RETURNING *`,
        [orgId, planId, briefId, variant, operation ? 'media' : 'text', userId]
      );
      const existingRun = inserted.rows[0];
      if (['queueing','queued','processing','pending_control','completed'].includes(String(existingRun.status))) continue;

      // Claim this variation atomically. Concurrent requests cannot enqueue the
      // same asset, while a deliberate retry gets a distinct durable attempt.
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
        if (operation) {
          const generation = run.studio_generation_id
            ? await studioService.retryGeneration(String(run.studio_generation_id), orgId, userId)
            : await studioService.createGeneration(orgId, userId, {
              type: operation,
              prompt,
              options: {
                campaign_plan_id: planId,
                brief_id: briefId,
                variant_number: variant,
                idempotency_key: `campaign-asset:${run.id}`,
                quantity: Number(brief.duration_seconds || 1),
                accessibility_text: brief.accessibility_requirements || [],
              },
            });
          await query(
            `UPDATE campaign_asset_runs SET studio_generation_id=$1,status='queued',updated_at=NOW() WHERE id=$2`,
            [generation.id, run.id]
          );
        } else {
          const request: GenerateContentRequest = {
            type: contentType(String(brief.format || ''), String(brief.platform || '')),
            platform: (brief.platform || undefined) as ContentPlatform | undefined,
            title: `${String(plan.name)} - ${String(brief.purpose || brief.format || briefId)} - variation ${variant}`,
            prompt,
            campaign_plan_id: planId,
            brief_id: briefId,
            audience: JSON.stringify(asObject(plan.brief).audience_segments || []),
            objective: String(asObject(plan.brief).objective || plan.goal || ''),
            offer: String(asObject(plan.brief).offer || ''),
            calls_to_action: asObject(plan.brief).calls_to_action || [],
            prohibited_claims: asObject(plan.constraints).prohibited_claims || [],
            idempotency_key: `campaign-asset:${run.id}`,
          };
          const job = await generationQueue.add('campaign-text', {
            kind: 'campaign-text', runId: run.id, organizationId: orgId, userId, request,
          }, {
            jobId: `campaign-text:${run.id}:attempt:${attempt}`,
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
  }
  return listCampaignProduction(planId, orgId);
}

export async function listCampaignProduction(planId: string, orgId: string): Promise<Record<string, unknown>[]> {
  return (await query(
    `SELECT * FROM campaign_asset_runs WHERE campaign_plan_id=$1 AND organization_id=$2
     ORDER BY brief_id,variant_number`, [planId, orgId]
  )).rows;
}
