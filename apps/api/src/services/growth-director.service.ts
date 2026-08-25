import crypto from 'crypto';
import { query, transaction } from '../config/database';
import { ensureMarketingWorkforce } from './marketing-workforce.service';
import { queueCampaignProduction } from './campaign-production.service';
import { schedulePostThroughControlCentre } from './controlled-social-publishing.service';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { contextEngine } from './context-engine.service';
import { generatePlan, type CampaignPlan } from './campaign-planner.service';
import { legacyProductLine, normalizeProductScopes } from '../utils/product-scope';
import * as contentEngine from './content-engine.service';
import * as contentWorkflow from './content-workflow.service';

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function productScopes(primary: unknown, legacy?: unknown): string[] {
  const direct = normalizeProductScopes(primary);
  return direct.length > 0 ? direct : normalizeProductScopes(legacy);
}

function scopeLabel(scopes: string[]): string {
  return scopes.length > 0 ? scopes.join('+') : 'unclassified';
}

async function scheduleApprovedSocialAssets(cycleId: string, organizationId: string, campaignPlanId: string): Promise<{
  eligible: number; scheduled: number; existing: number; held: number;
}> {
  const assets = await query(
    `SELECT DISTINCT ON (content.id,connection.id)
            content.*,run.id AS campaign_asset_run_id,
            connection.id AS connection_id,post.id AS existing_post_id
     FROM campaign_asset_runs run
     JOIN content_items content
       ON content.id=run.content_id AND content.organization_id=run.organization_id
     JOIN social_connections connection
       ON connection.organization_id=content.organization_id
      AND LOWER(connection.platform)=LOWER(content.platform)
      AND connection.status='active'
     LEFT JOIN social_posts post
       ON post.organization_id=content.organization_id
      AND post.content_id=content.id
      AND post.connection_id=connection.id
      AND post.status NOT IN ('failed')
     WHERE run.organization_id=$1 AND run.campaign_plan_id=$2
       AND run.status='completed' AND content.status='approved'
       AND content.type='social' AND content.deleted_at IS NULL
     ORDER BY content.id,connection.id,post.created_at DESC NULLS LAST`,
    [organizationId, campaignPlanId]
  );
  let scheduled = 0;
  let existing = 0;
  let held = 0;
  for (const [index, content] of assets.rows.entries()) {
    if (content.existing_post_id) {
      existing += 1;
      await markAssetResolution(content, organizationId, 'approved_and_scheduled', 'An idempotent governed social post already exists');
      continue;
    }
    const metadata = objectValue(content.metadata);
    const delivery = objectValue(metadata.delivery);
    const social = objectValue(delivery.social);
    try {
      await schedulePostThroughControlCentre({
        organizationId,
        connectionId: String(content.connection_id),
        body: String(social.body ?? content.body ?? ''),
        requestedBy: 'system',
        contentId: String(content.id),
        campaignId: content.campaign_id ? String(content.campaign_id) : undefined,
        mediaUrls: stringArray(social.media_urls ?? metadata.media_urls),
        hashtags: stringArray(social.hashtags ?? metadata.hashtags),
        scheduledAt: new Date(Date.now() + (index + 1) * 60_000).toISOString(),
        idempotencyKey: `growth-cycle:${cycleId}:social:${content.id}:${content.connection_id}`,
      });
      scheduled += 1;
      await markAssetResolution(content, organizationId, 'approved_and_scheduled', 'Scheduled through Control Centre');
    } catch (error) {
      if (error instanceof AppError && ['RELAUNCH_APPROVAL_REQUIRED', 'RELAUNCH_ACTION_BLOCKED'].includes(error.code)) {
        held += 1;
        continue;
      }
      throw error;
    }
  }
  return { eligible: assets.rows.length, scheduled, existing, held };
}

async function persistPerformanceLearning(organizationId: string, campaignPlanId: string): Promise<Record<string, unknown>> {
  const performance = await query(
    `SELECT content.id,content.title,content.platform,run.product_line,run.product_lines,
            COUNT(event.id)::int AS event_count,
            COALESCE(SUM(event.value_pence),0)::bigint AS value_pence
     FROM campaign_asset_runs run
     JOIN content_items content
       ON content.id=run.content_id AND content.organization_id=run.organization_id
     LEFT JOIN marketing_performance_events event
       ON event.organization_id=content.organization_id
      AND event.content_id=content.id
      AND (
        jsonb_array_length(COALESCE(run.product_lines,'[]'::jsonb))=0
        OR run.product_lines ? event.product_line
        OR (run.product_line IS NOT NULL AND event.product_line=run.product_line)
      )
      AND event.occurred_at>=NOW()-INTERVAL '30 days'
     WHERE run.organization_id=$1 AND run.campaign_plan_id=$2
       AND run.status='completed' AND content.deleted_at IS NULL
     GROUP BY content.id,content.title,content.platform,run.product_line,run.product_lines
     ORDER BY value_pence DESC,event_count DESC,content.id
     LIMIT 100`,
    [organizationId, campaignPlanId]
  );
  for (const row of performance.rows) {
    await query(
      `UPDATE content_items SET performance_summary=$1,updated_at=NOW()
       WHERE id=$2 AND organization_id=$3`,
      [JSON.stringify({
        attribution_window_days: 30,
        event_count: Number(row.event_count || 0),
        value_pence: Number(row.value_pence || 0),
        measured_at: new Date().toISOString(),
      }), row.id, organizationId]
    );
  }
  const winner = performance.rows.find((row) => Number(row.event_count || 0) > 0 || Number(row.value_pence || 0) > 0);
  if (!winner) return { measured_assets: performance.rows.length, winner: null, reason: 'No attributable performance evidence yet' };

  const platform = String(winner.platform || 'unclassified');
  const winnerScopes = productScopes(winner.product_lines, winner.product_line);
  const winnerLegacy = legacyProductLine(winnerScopes);
  await query(
    `INSERT INTO owner_marketing_preferences
       (organization_id,preference_type,preference_key,weight,evidence_count,examples)
     VALUES ($1,'performance_winner',$2,1,1,$3)
     ON CONFLICT (organization_id,preference_type,preference_key)
     DO UPDATE SET weight=LEAST(10,owner_marketing_preferences.weight+0.1),
                   evidence_count=owner_marketing_preferences.evidence_count+1,
                   examples=EXCLUDED.examples,updated_at=NOW()`,
    [organizationId, `${scopeLabel(winnerScopes)}:${platform}`, JSON.stringify([{ content_id: winner.id, title: winner.title,
      product_lines: winnerScopes, product_line: winnerLegacy,
      event_count: Number(winner.event_count || 0), value_pence: Number(winner.value_pence || 0) }])]
  );
  await query(
    `INSERT INTO marketing_change_events
       (organization_id,source_type,source_id,event_type,materiality,summary,payload)
     SELECT $1,'performance',$2,'performance_learning','material',$3,$4
     WHERE NOT EXISTS (
       SELECT 1 FROM marketing_change_events
       WHERE organization_id=$1 AND source_type='performance' AND source_id=$2
         AND event_type='performance_learning' AND status='pending'
     )`,
    [organizationId, winner.id,
      `Attributable ${scopeLabel(winnerScopes)} performance favours ${String(winner.title || winner.id)} on ${platform}`,
      JSON.stringify({ campaign_plan_id: campaignPlanId, content_id: winner.id, platform,
        product_lines: winnerScopes, product_line: winnerLegacy,
        event_count: Number(winner.event_count || 0), value_pence: Number(winner.value_pence || 0) })]
  );
  return { measured_assets: performance.rows.length, winner: { content_id: winner.id, platform,
    product_lines: winnerScopes, product_line: winnerLegacy,
    event_count: Number(winner.event_count || 0), value_pence: Number(winner.value_pence || 0) } };
}

async function recordEvent(cycleId: string, organizationId: string, phase: string, eventType: string, detail: Record<string, unknown>): Promise<void> {
  await query(
    `INSERT INTO autonomous_growth_events (cycle_id,organization_id,phase,event_type,detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [cycleId, organizationId, phase, eventType, JSON.stringify(detail)]
  );
}

type FinalAssetResolution = 'approved' | 'approved_and_scheduled' | 'retired_by_owner' | 'replaced'
  | 'failed_after_bounded_retries' | 'owner_clarification_required';

async function markAssetResolution(
  run: Record<string, unknown>,
  organizationId: string,
  resolution: FinalAssetResolution,
  reason: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await query(
    `UPDATE campaign_asset_runs SET resolution_status=$1,resolution_reason=$2,resolved_at=NOW(),updated_at=NOW()
     WHERE id=$3 AND organization_id=$4`,
    [resolution, reason, run.campaign_asset_run_id || run.id, organizationId]
  );
  await recordAssetResolutionEvent(run, organizationId, resolution, reason, detail);
}

async function recordAssetResolutionEvent(
  run: Record<string, unknown>,
  organizationId: string,
  resolution: FinalAssetResolution,
  reason: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  await query(
    `INSERT INTO campaign_asset_resolution_events
       (organization_id,campaign_plan_id,campaign_asset_run_id,content_id,content_version,resolution_status,reason,detail)
     SELECT $1,campaign_plan_id,id,content_id,$2,$3,$4,$5
     FROM campaign_asset_runs
     WHERE id=$6 AND organization_id=$1
       AND NOT EXISTS (
         SELECT 1 FROM campaign_asset_resolution_events event
         WHERE event.campaign_asset_run_id=campaign_asset_runs.id
           AND event.content_version=$2
           AND event.resolution_status=$3
       )`,
    [organizationId, Number(run.version || run.resolved_content_version || 1), resolution, reason,
      JSON.stringify(detail), run.campaign_asset_run_id || run.id]
  );
}

async function getWorkspaceOwner(organizationId: string): Promise<string> {
  const owner = await query(
    `SELECT user_id FROM organization_members
     WHERE organization_id=$1 AND role='owner'
     ORDER BY created_at ASC LIMIT 1`,
    [organizationId]
  );
  if (owner.rows.length === 0) throw new Error('Organization has no owner');
  return String(owner.rows[0].user_id);
}

async function selectOrCreateCampaignPlan(
  cycle: Record<string, unknown>,
  organizationId: string
): Promise<{ plan: CampaignPlan | Record<string, unknown>; created: boolean; contextEvidence: Record<string, unknown> }> {
  if (cycle.campaign_plan_id) {
    const attached = await query(
      `SELECT * FROM campaign_plans WHERE id=$1 AND organization_id=$2`,
      [cycle.campaign_plan_id, organizationId]
    );
    if (attached.rows.length > 0) return { plan: attached.rows[0], created: false, contextEvidence: { reused_attached_plan: true } };
  }
  const opportunity = objectValue(cycle.opportunity);
  const opportunityScopes = productScopes(opportunity.product_lines, opportunity.product_line);
  const scopeFilter = opportunityScopes.length > 0 ? opportunityScopes : null;
  const current = String(cycle.trigger_type) === 'manual' ? { rows: [] } : await query(
    `SELECT plan.* FROM campaign_plans plan
     WHERE plan.organization_id=$1 AND plan.strategy_validation_status='valid'
       AND plan.status<>'archived' AND plan.updated_at>=NOW()-INTERVAL '30 days'
       AND (
         $3::text[] IS NULL
         OR plan.product_lines ?| $3::text[]
         OR plan.product_line = ANY($3::text[])
       )
       AND NOT EXISTS (
         SELECT 1 FROM autonomous_growth_cycles active
         WHERE active.campaign_plan_id=plan.id AND active.id<>$2
           AND active.status NOT IN ('completed','failed','paused')
       )
     ORDER BY CASE plan.status WHEN 'approved' THEN 1 WHEN 'review' THEN 2 ELSE 3 END,
              plan.updated_at DESC LIMIT 1`,
    [organizationId, cycle.id, scopeFilter]
  );
  if (current.rows.length > 0) return { plan: current.rows[0], created: false, contextEvidence: {
    reused_current_plan: true,
    product_lines: opportunityScopes,
    product_line: legacyProductLine(opportunityScopes),
  } };
  const opportunitySummary = String(opportunity.summary || opportunity.source || cycle.objective || 'scheduled baseline growth opportunity');
  const context = await contextEngine.assemble({
    orgId: organizationId,
    includeBrandDna: true,
    includeKnowledge: true,
    includeHistory: false,
    knowledgeQuery: `${String(cycle.objective || '')} ${opportunitySummary}`,
  });
  const ownerId = await getWorkspaceOwner(organizationId);
  const date = new Date().toISOString().slice(0, 10);
  const scopeText = opportunityScopes.length > 0 ? ` for product/service scopes ${opportunityScopes.join(', ')}` : '';
  const plan = await generatePlan(organizationId, {
    name: `Autonomous growth opportunity — ${date}`,
    goal: String(cycle.objective || 'Identify and advance the strongest evidence-backed organic growth opportunity'),
    target_audience: 'Use the primary audience and personas in Brand DNA and connected business knowledge.',
    budget_cents: 0,
    product_lines: opportunityScopes,
    products: `Select the most relevant current product, plan, feature or approved offer from the shared business brain${scopeText}. Cycle opportunity: ${opportunitySummary}`,
    location: 'Use configured market and location knowledge only.',
    objective_stage: 'conversion',
    offer: 'Use only an approved current offer from structured connector or owner knowledge; otherwise avoid offer-dependent claims.',
    success_criteria: ['qualified organic engagement', 'attributable traffic', 'signup or conversion evidence'],
    generation_credit_limit: Number(cycle.generation_credit_ceiling || 0),
    idempotency_key: `growth-cycle:${String(cycle.id)}:campaign-plan:v1`,
  }, ownerId);
  return {
    plan,
    created: true,
    contextEvidence: {
      assembled_at: new Date().toISOString(),
      trigger_type: cycle.trigger_type,
      opportunity: opportunitySummary,
      product_lines: opportunityScopes,
      product_line: legacyProductLine(opportunityScopes),
      brand_dna_available: Boolean(context.brandDna),
      shared_business_brain_available: Boolean(context.knowledge),
    },
  };
}

async function submitQualityPassedAssets(campaignPlanId: string, organizationId: string, ownerId: string): Promise<void> {
  const assets = await query(
    `SELECT run.id AS campaign_asset_run_id,run.*,content.id AS content_id,
            content.version,content.status AS content_status,content.workflow_state
     FROM campaign_asset_runs run
     LEFT JOIN content_items content
       ON content.id=run.content_id AND content.organization_id=run.organization_id
     WHERE run.organization_id=$1 AND run.campaign_plan_id=$2
       AND run.status='completed'
       AND (run.generation_kind='text' OR run.material_status='ready_for_review')
       AND run.resolution_status IN ('pending_generation','pending_review')`,
    [organizationId, campaignPlanId]
  );
  for (const asset of assets.rows) {
    if (!asset.content_id) {
      await markAssetResolution(asset, organizationId, 'owner_clarification_required', 'Generated media has no governed content approval record');
      continue;
    }
    if (String(asset.workflow_state) === 'needs_revision') {
      await markAssetResolution(asset, organizationId, 'failed_after_bounded_retries', 'Asset failed bounded pre-review quality repair');
      continue;
    }
    if (String(asset.content_status) === 'approved') {
      await markAssetResolution(asset, organizationId, 'approved', 'Owner approval already recorded');
      continue;
    }
    if (String(asset.content_status) === 'review') {
      await query(
        `UPDATE campaign_asset_runs SET resolution_status='pending_review',resolved_content_version=$1,updated_at=NOW()
         WHERE id=$2 AND organization_id=$3`,
        [asset.version, asset.campaign_asset_run_id, organizationId]
      );
      continue;
    }
    if (String(asset.workflow_state) !== 'ready_for_review') continue;
    await contentWorkflow.submitForReview(String(asset.content_id), organizationId, ownerId, ownerId);
    await query(
      `UPDATE campaign_asset_runs SET resolution_status='pending_review',resolved_content_version=$1,updated_at=NOW()
       WHERE id=$2 AND organization_id=$3`,
      [asset.version, asset.campaign_asset_run_id, organizationId]
    );
  }
}

async function processOwnerFeedback(campaignPlanId: string, organizationId: string, ownerId: string): Promise<void> {
  const feedbackRuns = await query(
    `SELECT run.id AS campaign_asset_run_id,run.*,content.id AS content_id,content.version,
            content.status AS content_status,content.metadata AS content_metadata,
            plan.asset_requirements
     FROM campaign_asset_runs run
     JOIN content_items content
       ON content.id=run.content_id AND content.organization_id=run.organization_id
     JOIN campaign_plans plan
       ON plan.id=run.campaign_plan_id AND plan.organization_id=run.organization_id
     WHERE run.organization_id=$1 AND run.campaign_plan_id=$2
       AND run.resolution_status IN ('revision_requested','rejection_received','revision_generated')
     ORDER BY run.updated_at,run.id`,
    [organizationId, campaignPlanId]
  );
  for (const run of feedbackRuns.rows) {
    const feedback = objectValue(run.owner_feedback);
    const decision = String(feedback.decision || run.resolution_status);
    const comments = String(feedback.comments || '').trim();
    const originalVersion = Number(feedback.content_version || run.resolved_content_version || run.version || 1);
    const approvalId = String(feedback.approval_id || `run-${run.campaign_asset_run_id}-v${originalVersion}`);
    const priorRevision = objectValue(objectValue(run.content_metadata).owner_feedback_revision);
    if (String(run.resolution_status) !== 'revision_generated' && String(priorRevision.approval_id || '') === approvalId) {
      await query(
        `UPDATE campaign_asset_runs SET resolution_status='revision_generated',resolved_content_version=$1,
           feedback_attempt_count=GREATEST(feedback_attempt_count,1),
           resolution_reason='Recovered generated owner-feedback revision; owner review submission pending',
           resolved_at=NULL,updated_at=NOW() WHERE id=$2 AND organization_id=$3`,
        [run.version, run.campaign_asset_run_id, organizationId]
      );
      run.resolution_status = 'revision_generated';
      run.resolved_content_version = run.version;
      await recordAssetResolutionEvent({ ...run, resolved_content_version: originalVersion, version: originalVersion }, organizationId, 'replaced',
        decision === 'rejected' ? 'Rejected exact version replaced using owner feedback' : 'Change-requested exact version replaced by a targeted revision',
        { approval_id: approvalId, original_version: originalVersion, replacement_version: run.version });
    }
    if (String(run.resolution_status) === 'revision_generated') {
      try {
        if (String(run.content_status || '') !== 'review') {
          await contentWorkflow.submitForReview(String(run.content_id), organizationId, ownerId, ownerId);
        }
        await query(
          `UPDATE campaign_asset_runs SET resolution_status='pending_review',resolution_reason=NULL,
             resolved_at=NULL,updated_at=NOW() WHERE id=$1 AND organization_id=$2`,
          [run.campaign_asset_run_id, organizationId]
        );
      } catch (error) {
        const attempts = Number(run.feedback_attempt_count || 0) + 1;
        const message = error instanceof Error ? error.message : String(error);
        if (attempts >= 3) {
          await query(
            `UPDATE campaign_asset_runs SET resolution_status='failed_after_bounded_retries',
               feedback_attempt_count=$1,resolution_reason=$2,resolved_at=NOW(),updated_at=NOW()
             WHERE id=$3 AND organization_id=$4`,
            [attempts, message.slice(0, 2000), run.campaign_asset_run_id, organizationId]
          );
          await recordAssetResolutionEvent(run, organizationId, 'failed_after_bounded_retries', message.slice(0, 2000), { approval_id: approvalId, attempts });
        } else {
          await query(
            `UPDATE campaign_asset_runs SET feedback_attempt_count=$1,resolution_reason=$2,updated_at=NOW()
             WHERE id=$3 AND organization_id=$4`,
            [attempts, message.slice(0, 2000), run.campaign_asset_run_id, organizationId]
          );
        }
      }
      continue;
    }
    let replace = decision !== 'rejected';
    if (decision === 'rejected') {
      const requirements = Array.isArray(run.asset_requirements)
        ? run.asset_requirements : JSON.parse(String(run.asset_requirements || '[]'));
      const stillRequired = requirements.some((item: unknown) =>
        String(objectValue(item).brief_id || '') === String(run.brief_id)
      );
      const sibling = await query(
        `SELECT id FROM campaign_asset_runs
         WHERE organization_id=$1 AND campaign_plan_id=$2 AND brief_id=$3 AND id<>$4
           AND resolution_status NOT IN ('retired_by_owner','replaced','failed_after_bounded_retries')
         LIMIT 1`,
        [organizationId, campaignPlanId, run.brief_id, run.campaign_asset_run_id]
      );
      replace = stillRequired && sibling.rows.length === 0;
    }
    if (!replace) {
      await markAssetResolution(run, organizationId, 'retired_by_owner', comments || 'Owner rejected this version; another asset resolves the requirement', { approval_id: approvalId, original_version: originalVersion });
      continue;
    }
    try {
      const revised = await contentEngine.reviseContentFromOwnerFeedback(
        String(run.content_id), organizationId, ownerId, {
          instruction: comments || (decision === 'rejected' ? 'Create a materially different replacement.' : 'Revise this asset for owner review.'),
          decision: decision === 'rejected' ? 'rejected' : 'changes_requested',
          approval_id: approvalId,
          idempotency_key: `owner-feedback:${approvalId}:content:${run.content_id}`,
        }
      );
      await query(
        `UPDATE campaign_asset_runs SET resolution_status='revision_generated',resolved_content_version=$1,
           feedback_attempt_count=feedback_attempt_count+1,resolution_reason='Revision generated; owner review submission pending',
           resolved_at=NULL,updated_at=NOW() WHERE id=$2 AND organization_id=$3`,
        [revised.version, run.campaign_asset_run_id, organizationId]
      );
      await recordAssetResolutionEvent({ ...run, resolved_content_version: originalVersion, version: originalVersion }, organizationId, 'replaced', decision === 'rejected'
        ? 'Rejected exact version replaced using owner feedback'
        : 'Change-requested exact version replaced by a targeted revision',
      { approval_id: approvalId, original_version: originalVersion, replacement_version: revised.version });
      await contentWorkflow.submitForReview(revised.id, organizationId, ownerId, ownerId);
      await query(
        `UPDATE campaign_asset_runs SET resolution_status='pending_review',resolved_content_version=$1,
           resolution_reason=NULL,resolved_at=NULL,updated_at=NOW()
         WHERE id=$2 AND organization_id=$3`,
        [revised.version, run.campaign_asset_run_id, organizationId]
      );
    } catch (error) {
      const attempts = Number(run.feedback_attempt_count || 0) + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= 3) {
        await query(
          `UPDATE campaign_asset_runs SET resolution_status='failed_after_bounded_retries',
             feedback_attempt_count=$1,resolution_reason=$2,resolved_at=NOW(),updated_at=NOW()
           WHERE id=$3 AND organization_id=$4`,
          [attempts, message.slice(0, 2000), run.campaign_asset_run_id, organizationId]
        );
        await markAssetResolution(run, organizationId, 'failed_after_bounded_retries', message.slice(0, 2000), { approval_id: approvalId, attempts });
      } else {
        await query(
          `UPDATE campaign_asset_runs SET feedback_attempt_count=$1,resolution_reason=$2,updated_at=NOW()
           WHERE id=$3 AND organization_id=$4`,
          [attempts, message.slice(0, 2000), run.campaign_asset_run_id, organizationId]
        );
      }
    }
  }
}

export async function observeOrganization(organizationId: string): Promise<string | null> {
  await ensureMarketingWorkforce(organizationId);
  return transaction(async (client) => {
    const change = await client.query(
      `SELECT * FROM marketing_change_events
       WHERE organization_id=$1 AND status='pending'
       ORDER BY CASE materiality WHEN 'critical' THEN 1 WHEN 'material' THEN 2 ELSE 3 END,created_at
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [organizationId]
    );
    if (change.rows.length === 0) return null;
    const event = change.rows[0];
    const eventPayload = objectValue(event.payload);
    const eventScopes = productScopes(eventPayload.product_lines, eventPayload.product_line);
    const cycle = await client.query(
      `INSERT INTO autonomous_growth_cycles
         (organization_id,status,trigger_type,trigger_ref,objective,opportunity,next_run_at)
       VALUES ($1,'observing','knowledge_change',$2,$3,$4,NOW()) RETURNING id`,
      [organizationId, event.id, `Respond to ${event.event_type}`, JSON.stringify({
        summary: event.summary,
        materiality: event.materiality,
        product_lines: eventScopes,
        product_line: legacyProductLine(eventScopes),
      })]
    );
    await client.query("UPDATE marketing_change_events SET status='consumed',consumed_at=NOW() WHERE id=$1", [event.id]);
    await client.query(
      `INSERT INTO autonomous_growth_events (cycle_id,organization_id,phase,event_type,detail)
       VALUES ($1,$2,'observing','material_change_observed',$3)`,
      [cycle.rows[0].id, organizationId, JSON.stringify({ change_event_id: event.id, summary: event.summary, product_lines: eventScopes })]
    );
    return String(cycle.rows[0].id);
  });
}

export async function ensureBaselineCycle(organizationId: string): Promise<string | null> {
  await ensureMarketingWorkforce(organizationId);
  const existing = await query(
    `SELECT id FROM autonomous_growth_cycles
     WHERE organization_id=$1 AND started_at > NOW()-INTERVAL '24 hours' LIMIT 1`,
    [organizationId]
  );
  if (existing.rows.length > 0) return null;
  const cycle = await query(
    `INSERT INTO autonomous_growth_cycles (organization_id,status,trigger_type,objective,opportunity,next_run_at)
     VALUES ($1,'observing','scheduled','Continuous organic growth review','{"source":"scheduled_baseline"}',NOW()) RETURNING id`,
    [organizationId]
  );
  await recordEvent(String(cycle.rows[0].id), organizationId, 'observing', 'scheduled_observation_started', {});
  return String(cycle.rows[0].id);
}

export async function createOwnerGrowthCycle(input: {
  organizationId: string;
  userId: string;
  objective: string;
  productLines?: string[];
  idempotencyKey: string;
  generationCreditCeiling: number;
}): Promise<Record<string, unknown>> {
  const objective = input.objective.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const scopes = normalizeProductScopes(input.productLines || []).sort();
  if (objective.length < 10 || objective.length > 10_000) {
    throw new AppError(400, 'Objective must contain 10 to 10,000 characters', 'GROWTH_OBJECTIVE_INVALID');
  }
  if (!idempotencyKey || idempotencyKey.length > 255) {
    throw new AppError(400, 'A valid idempotency key is required', 'GROWTH_IDEMPOTENCY_INVALID');
  }
  if (!Number.isSafeInteger(input.generationCreditCeiling) || input.generationCreditCeiling <= 0) {
    throw new AppError(400, 'Generation Credit ceiling must be a positive integer', 'GROWTH_CREDIT_CEILING_INVALID');
  }
  await ensureMarketingWorkforce(input.organizationId);

  return transaction(async (client) => {
    await client.query(
      `INSERT INTO relaunch_control_policies (organization_id)
       VALUES ($1) ON CONFLICT (organization_id) DO NOTHING`,
      [input.organizationId]
    );
    const policyResult = await client.query(
      'SELECT * FROM relaunch_control_policies WHERE organization_id=$1 FOR UPDATE',
      [input.organizationId]
    );
    const policy = policyResult.rows[0] as Record<string, unknown>;
    if (policy.emergency_stop === true) {
      throw new AppError(409, 'Emergency Stop is active', 'EMERGENCY_STOP_ACTIVE');
    }

    const existing = await client.query(
      `SELECT * FROM autonomous_growth_cycles
       WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE`,
      [input.organizationId, idempotencyKey]
    );
    if (existing.rows[0]) {
      const row = existing.rows[0] as Record<string, unknown>;
      const existingScopes = productScopes(row.product_lines).sort();
      if (
        String(row.originating_instruction || row.objective || '') !== objective
        || Number(row.generation_credit_ceiling || 0) !== input.generationCreditCeiling
        || JSON.stringify(existingScopes) !== JSON.stringify(scopes)
      ) {
        throw new AppError(409, 'Idempotency key was already used for a different autonomous run', 'GROWTH_IDEMPOTENCY_CONFLICT');
      }
      return row;
    }

    const opportunity = {
      source: 'owner_instruction',
      summary: objective,
      product_lines: scopes,
      product_line: legacyProductLine(scopes),
    };
    const state = {
      originating_instruction: objective,
      governance_mode_at_start: String(policy.operating_mode || 'manual'),
      policy_version_at_start: Number(policy.version || 0),
      generation_credit_ceiling: input.generationCreditCeiling,
      initiated_by: 'owner',
    };
    const cycle = await client.query(
      `INSERT INTO autonomous_growth_cycles
         (organization_id,status,trigger_type,objective,originating_instruction,
          opportunity,product_lines,generation_credit_ceiling,idempotency_key,
          initiated_by_user_id,state,next_run_at)
       VALUES ($1,'observing','manual',$2,$2,$3,$4,$5,$6,$7,$8,NOW())
       RETURNING *`,
      [
        input.organizationId,
        objective,
        JSON.stringify(opportunity),
        JSON.stringify(scopes),
        input.generationCreditCeiling,
        idempotencyKey,
        input.userId,
        JSON.stringify(state),
      ]
    );
    await client.query(
      `INSERT INTO autonomous_growth_events
         (cycle_id,organization_id,phase,event_type,detail)
       VALUES ($1,$2,'observing','owner_objective_received',$3)`,
      [cycle.rows[0].id, input.organizationId, JSON.stringify({
        originating_instruction: objective,
        product_lines: scopes,
        generation_credit_ceiling: input.generationCreditCeiling,
        governance_mode: String(policy.operating_mode || 'manual'),
      })]
    );
    return cycle.rows[0] as Record<string, unknown>;
  });
}

export async function getOwnerGrowthCycle(
  cycleId: string,
  organizationId: string
): Promise<Record<string, unknown>> {
  const cycleResult = await query(
    `SELECT cycle.*,policy.operating_mode,policy.emergency_stop,policy.version AS current_policy_version
     FROM autonomous_growth_cycles cycle
     LEFT JOIN relaunch_control_policies policy ON policy.organization_id=cycle.organization_id
     WHERE cycle.id=$1 AND cycle.organization_id=$2`,
    [cycleId, organizationId]
  );
  if (!cycleResult.rows[0]) throw new AppError(404, 'Autonomous growth cycle not found', 'GROWTH_CYCLE_NOT_FOUND');
  const cycle = cycleResult.rows[0] as Record<string, unknown>;
  const campaignPlanId = cycle.campaign_plan_id ? String(cycle.campaign_plan_id) : null;
  const [events, work] = await Promise.all([
    query(
      `SELECT id,phase,event_type,detail,created_at FROM autonomous_growth_events
       WHERE cycle_id=$1 AND organization_id=$2 ORDER BY created_at,id`,
      [cycleId, organizationId]
    ),
    campaignPlanId
      ? query(
        `SELECT run.id AS campaign_asset_run_id,run.status,run.resolution_status,
                run.content_id,run.studio_generation_id,content.campaign_id,
                asset.id AS studio_asset_id,asset.url AS studio_asset_url
         FROM campaign_asset_runs run
         LEFT JOIN content_items content ON content.id=run.content_id AND content.organization_id=run.organization_id
         LEFT JOIN studio_assets asset ON asset.metadata->>'generation_id'=run.studio_generation_id::text AND asset.organization_id=run.organization_id
         WHERE run.organization_id=$1 AND run.campaign_plan_id=$2
         ORDER BY run.created_at,asset.created_at`,
        [organizationId, campaignPlanId]
      )
      : Promise.resolve({ rows: [] }),
  ]);
  const rows = work.rows as Array<Record<string, unknown>>;
  return {
    ...cycle,
    campaign_plan_ids: campaignPlanId ? [campaignPlanId] : [],
    campaign_ids: [...new Set(rows.map((row) => row.campaign_id).filter(Boolean).map(String))],
    content_ids: [...new Set(rows.map((row) => row.content_id).filter(Boolean).map(String))],
    generation_ids: [...new Set(rows.map((row) => row.studio_generation_id).filter(Boolean).map(String))],
    asset_ids: [...new Set(rows.map((row) => row.studio_asset_id).filter(Boolean).map(String))],
    assets: rows.filter((row) => row.studio_asset_id).map((row) => ({ id: row.studio_asset_id, url: row.studio_asset_url })),
    work: rows,
    events: events.rows,
  };
}

export async function advanceGrowthCycles(limit = 20): Promise<number> {
  const due = await query(
    `SELECT cycle.* FROM autonomous_growth_cycles cycle
     WHERE cycle.status NOT IN ('completed','failed','paused')
       AND (cycle.next_run_at IS NULL OR cycle.next_run_at<=NOW())
     ORDER BY cycle.updated_at ASC LIMIT $1`,
    [limit]
  );
  let advanced = 0;
  for (const cycle of due.rows) {
    const cycleId = String(cycle.id);
    const orgId = String(cycle.organization_id);
    const token = crypto.randomUUID();
    const claimed = await query(
      `UPDATE autonomous_growth_cycles SET claim_token=$1,claimed_at=NOW(),attempt_count=attempt_count+1
       WHERE id=$2 AND (claimed_at IS NULL OR claimed_at<NOW()-INTERVAL '15 minutes') RETURNING *`,
      [token, cycleId]
    );
    if (claimed.rows.length === 0) continue;
    try {
      const status = String(claimed.rows[0].status);
      const currentPolicy = await query(
        'SELECT emergency_stop,operating_mode,version FROM relaunch_control_policies WHERE organization_id=$1',
        [orgId]
      );
      if (currentPolicy.rows[0]?.emergency_stop === true) {
        await query(
          "UPDATE autonomous_growth_cycles SET status='paused',next_run_at=NULL,claim_token=NULL,claimed_at=NULL,updated_at=NOW(),state=state || $1::jsonb WHERE id=$2",
          [JSON.stringify({ paused_by: 'emergency_stop', policy_version: Number(currentPolicy.rows[0].version || 0) }), cycleId]
        );
        await recordEvent(cycleId, orgId, 'paused', 'cycle_paused_by_emergency_stop', {
          policy_version: Number(currentPolicy.rows[0].version || 0),
        });
        advanced += 1;
        continue;
      }
      if (status === 'observing') {
        await query("UPDATE autonomous_growth_cycles SET status='planning',next_run_at=NOW(),claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
        await recordEvent(cycleId, orgId, 'planning', 'business_brain_reviewed', {});
      } else if (status === 'planning') {
        const selection = await selectOrCreateCampaignPlan(claimed.rows[0], orgId);
        const plan = selection.plan;
        if (String(plan.strategy_validation_status) === 'owner_clarification') {
          const clarification = Array.isArray(plan.owner_clarification) ? plan.owner_clarification : [];
          await query(
            `UPDATE autonomous_growth_cycles SET campaign_plan_id=$1,next_run_at=NOW()+INTERVAL '1 hour',
               claim_token=NULL,claimed_at=NULL,updated_at=NOW(),context_snapshot=$2,
               state=state || $3::jsonb WHERE id=$4`,
            [plan.id, JSON.stringify(selection.contextEvidence), JSON.stringify({
              waiting_for: 'owner_clarification', owner_clarification: clarification,
            }), cycleId]
          );
          await recordEvent(cycleId, orgId, 'planning', 'owner_clarification_required', {
            campaign_plan_id: plan.id, questions: clarification,
          });
        } else if (String(plan.strategy_validation_status) === 'valid') {
          await query(
            `UPDATE autonomous_growth_cycles SET status='producing',campaign_plan_id=$1,
               context_snapshot=$2,state=state-'waiting_for'-'owner_clarification',
               next_run_at=NOW(),claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$3`,
            [plan.id, JSON.stringify(selection.contextEvidence), cycleId]
          );
          await recordEvent(cycleId, orgId, 'producing', selection.created
            ? 'autonomous_strategy_created_and_validated' : 'suitable_validated_strategy_selected',
          { campaign_plan_id: plan.id, created_autonomously: selection.created });
        } else {
          throw new Error(`Campaign strategy validation returned ${String(plan.strategy_validation_status || 'unknown')}`);
        }
      } else if (status === 'producing') {
        const ownerId = await getWorkspaceOwner(orgId);
        await queueCampaignProduction(String(claimed.rows[0].campaign_plan_id), orgId, ownerId);
        await query("UPDATE autonomous_growth_cycles SET status='quality_review',next_run_at=NOW()+INTERVAL '2 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
        await recordEvent(cycleId, orgId, 'quality_review', 'production_queued', {});
      } else if (status === 'quality_review') {
        const runs = await query(
          `SELECT COUNT(*)::int total,
                  COUNT(*) FILTER (WHERE status='completed')::int completed,
                  COUNT(*) FILTER (WHERE status='failed')::int failed,
                  COUNT(*) FILTER (WHERE resolution_status='failed_after_bounded_retries')::int terminal_failed
           FROM campaign_asset_runs WHERE campaign_plan_id=$1 AND organization_id=$2`,
          [claimed.rows[0].campaign_plan_id, orgId]
        );
        const counts = runs.rows[0];
        if (Number(counts.failed) > 0 && Number(claimed.rows[0].attempt_count) < 4) {
          await queueCampaignProduction(String(claimed.rows[0].campaign_plan_id), orgId, await getWorkspaceOwner(orgId));
          await query("UPDATE autonomous_growth_cycles SET next_run_at=NOW()+INTERVAL '5 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
        } else {
          if (Number(counts.failed) > 0) {
            await query(
              `UPDATE campaign_asset_runs SET resolution_status='failed_after_bounded_retries',
                 resolution_reason=COALESCE(error_message,'Campaign generation failed after bounded retries'),
                 resolved_at=NOW(),updated_at=NOW()
               WHERE campaign_plan_id=$1 AND organization_id=$2 AND status='failed'`,
              [claimed.rows[0].campaign_plan_id, orgId]
            );
          }
          const resolved = Number(counts.completed) + Number(counts.terminal_failed) + Number(counts.failed);
          if (Number(counts.total) > 0 && resolved >= Number(counts.total)) {
            const ownerId = await getWorkspaceOwner(orgId);
            await submitQualityPassedAssets(String(claimed.rows[0].campaign_plan_id), orgId, ownerId);
            await query("UPDATE autonomous_growth_cycles SET status='awaiting_owner_approval',next_run_at=NOW()+INTERVAL '10 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
            await recordEvent(cycleId, orgId, 'awaiting_owner_approval', 'quality_gate_completed_and_owner_review_queued', { assets: Number(counts.total) });
          } else {
            await query("UPDATE autonomous_growth_cycles SET next_run_at=NOW()+INTERVAL '5 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
          }
        }
      } else if (status === 'awaiting_owner_approval') {
        const ownerId = await getWorkspaceOwner(orgId);
        await processOwnerFeedback(String(claimed.rows[0].campaign_plan_id), orgId, ownerId);
        await query(
          `UPDATE campaign_asset_runs run SET resolution_status='approved',
             resolved_content_version=content.version,resolution_reason='Owner approved exact content version',
             resolved_at=COALESCE(run.resolved_at,NOW()),updated_at=NOW()
           FROM content_items content
           WHERE run.organization_id=$1 AND run.campaign_plan_id=$2
             AND content.id=run.content_id AND content.organization_id=run.organization_id
             AND content.status='approved' AND run.resolution_status='pending_review'`,
          [orgId, claimed.rows[0].campaign_plan_id]
        );
        const approval = await query(
          `SELECT COUNT(*)::int total,
                  COUNT(*) FILTER (WHERE resolution_status IN
                    ('approved','approved_and_scheduled','retired_by_owner','replaced',
                     'failed_after_bounded_retries','owner_clarification_required'))::int resolved,
                  COUNT(*) FILTER (WHERE resolution_status IN ('approved','approved_and_scheduled'))::int approved,
                  COUNT(*) FILTER (WHERE resolution_status='retired_by_owner')::int retired,
                  COUNT(*) FILTER (WHERE resolution_status='failed_after_bounded_retries')::int failed,
                  COUNT(*) FILTER (WHERE resolution_status='owner_clarification_required')::int clarification
           FROM campaign_asset_runs
           WHERE organization_id=$1 AND campaign_plan_id=$2`,
          [orgId, claimed.rows[0].campaign_plan_id]
        );
        const summary = approval.rows[0];
        if (Number(summary.total) > 0 && Number(summary.resolved) >= Number(summary.total)) {
          await query(
            "UPDATE autonomous_growth_cycles SET status='distributing',next_run_at=NOW(),claim_token=NULL,claimed_at=NULL,updated_at=NOW(),state=jsonb_set(state,'{asset_resolution}',$1::jsonb) WHERE id=$2",
            [JSON.stringify(summary), cycleId]
          );
          await recordEvent(cycleId, orgId, 'distributing', 'all_required_assets_resolved', summary);
        } else {
          await query(
            "UPDATE autonomous_growth_cycles SET next_run_at=NOW()+INTERVAL '15 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW(),state=jsonb_set(state,'{asset_resolution}',$1::jsonb) WHERE id=$2",
            [JSON.stringify(summary), cycleId]
          );
          await recordEvent(cycleId, orgId, 'awaiting_owner_approval', 'required_assets_still_outstanding', summary);
        }
      } else if (status === 'distributing') {
        const distribution = await scheduleApprovedSocialAssets(cycleId, orgId, String(claimed.rows[0].campaign_plan_id));
        if (distribution.held > 0) {
          await query("UPDATE autonomous_growth_cycles SET next_run_at=NOW()+INTERVAL '15 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW(),state=jsonb_set(state,'{distribution}',$1::jsonb) WHERE id=$2", [JSON.stringify(distribution), cycleId]);
          await recordEvent(cycleId, orgId, 'distributing', 'distribution_held_by_control_policy', distribution);
        } else {
          await query("UPDATE autonomous_growth_cycles SET status='measuring',next_run_at=NOW()+INTERVAL '24 hours',claim_token=NULL,claimed_at=NULL,updated_at=NOW(),state=jsonb_set(state,'{distribution}',$1::jsonb) WHERE id=$2", [JSON.stringify(distribution), cycleId]);
          await recordEvent(cycleId, orgId, 'measuring', 'approved_distribution_scheduled', { ...distribution, external_actions_remain_controlled: true });
        }
      } else if (status === 'measuring') {
        const events = await query("SELECT COUNT(*)::int count FROM marketing_performance_events WHERE organization_id=$1 AND occurred_at>=NOW()-INTERVAL '7 days'", [orgId]);
        await query("UPDATE autonomous_growth_cycles SET status='optimizing',next_run_at=NOW(),claim_token=NULL,claimed_at=NULL,updated_at=NOW(),state=jsonb_set(state,'{recent_performance_events}',$1::jsonb) WHERE id=$2", [JSON.stringify(Number(events.rows[0].count)), cycleId]);
      } else if (status === 'optimizing') {
        const learning = await persistPerformanceLearning(orgId, String(claimed.rows[0].campaign_plan_id));
        await query("UPDATE autonomous_growth_cycles SET status='completed',completed_at=NOW(),next_run_at=NULL,claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
        await recordEvent(cycleId, orgId, 'completed', 'bounded_growth_iteration_completed', learning);
      }
      advanced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await query("UPDATE autonomous_growth_cycles SET status='failed',error_message=$1,claim_token=NULL,claimed_at=NULL,completed_at=NOW(),updated_at=NOW() WHERE id=$2", [message.slice(0, 2000), cycleId]);
      await recordEvent(cycleId, orgId, 'failed', 'cycle_failed', { error: message.slice(0, 500) });
      logger.error(`Autonomous growth cycle ${cycleId} failed`, error);
    }
  }
  return advanced;
}

export async function runGrowthDirector(limit = 20): Promise<{ organizations: number; advanced: number }> {
  const organizations = await query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT $1', [Math.max(1, Math.min(limit, 100))]);
  for (const row of organizations.rows) {
    const orgId = String(row.id);
    await observeOrganization(orgId);
    await ensureBaselineCycle(orgId);
  }
  return { organizations: organizations.rows.length, advanced: await advanceGrowthCycles(limit) };
}

export async function getGrowthStatus(organizationId: string): Promise<Record<string, unknown>> {
  await ensureMarketingWorkforce(organizationId);
  const [cycles, events, workforce] = await Promise.all([
    query('SELECT * FROM autonomous_growth_cycles WHERE organization_id=$1 ORDER BY updated_at DESC LIMIT 20', [organizationId]),
    query('SELECT * FROM autonomous_growth_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100', [organizationId]),
    query('SELECT id,name,system_role_key,status,last_used_at FROM agents WHERE organization_id=$1 AND is_system=TRUE AND deleted_at IS NULL ORDER BY name', [organizationId]),
  ]);
  return { cycles: cycles.rows, events: events.rows, workforce: workforce.rows };
}
