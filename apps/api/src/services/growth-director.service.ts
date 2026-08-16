import crypto from 'crypto';
import { query, transaction } from '../config/database';
import { ensureMarketingWorkforce } from './marketing-workforce.service';
import { queueCampaignProduction } from './campaign-production.service';
import { schedulePostThroughControlCentre } from './controlled-social-publishing.service';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

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

async function scheduleApprovedSocialAssets(cycleId: string, organizationId: string, campaignPlanId: string): Promise<{
  eligible: number; scheduled: number; existing: number; held: number;
}> {
  const assets = await query(
    `SELECT DISTINCT ON (content.id,connection.id)
            content.*,connection.id AS connection_id,post.id AS existing_post_id
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
    if (content.existing_post_id) { existing += 1; continue; }
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
    `SELECT content.id,content.title,content.platform,
            COUNT(event.id)::int AS event_count,
            COALESCE(SUM(event.value_pence),0)::bigint AS value_pence
     FROM campaign_asset_runs run
     JOIN content_items content
       ON content.id=run.content_id AND content.organization_id=run.organization_id
     LEFT JOIN marketing_performance_events event
       ON event.organization_id=content.organization_id
      AND event.content_id=content.id
      AND event.occurred_at>=NOW()-INTERVAL '30 days'
     WHERE run.organization_id=$1 AND run.campaign_plan_id=$2
       AND run.status='completed' AND content.deleted_at IS NULL
     GROUP BY content.id,content.title,content.platform
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
  await query(
    `INSERT INTO owner_marketing_preferences
       (organization_id,preference_type,preference_key,weight,evidence_count,examples)
     VALUES ($1,'performance_winner',$2,1,1,$3)
     ON CONFLICT (organization_id,preference_type,preference_key)
     DO UPDATE SET weight=LEAST(10,owner_marketing_preferences.weight+0.1),
                   evidence_count=owner_marketing_preferences.evidence_count+1,
                   examples=EXCLUDED.examples,updated_at=NOW()`,
    [organizationId, platform, JSON.stringify([{ content_id: winner.id, title: winner.title,
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
      `Attributable performance favours ${String(winner.title || winner.id)} on ${platform}`,
      JSON.stringify({ campaign_plan_id: campaignPlanId, content_id: winner.id, platform,
        event_count: Number(winner.event_count || 0), value_pence: Number(winner.value_pence || 0) })]
  );
  return { measured_assets: performance.rows.length, winner: { content_id: winner.id, platform,
    event_count: Number(winner.event_count || 0), value_pence: Number(winner.value_pence || 0) } };
}

async function recordEvent(cycleId: string, organizationId: string, phase: string, eventType: string, detail: Record<string, unknown>): Promise<void> {
  await query(
    `INSERT INTO autonomous_growth_events (cycle_id,organization_id,phase,event_type,detail)
     VALUES ($1,$2,$3,$4,$5)`,
    [cycleId, organizationId, phase, eventType, JSON.stringify(detail)]
  );
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
    const cycle = await client.query(
      `INSERT INTO autonomous_growth_cycles
         (organization_id,status,trigger_type,trigger_ref,objective,opportunity,next_run_at)
       VALUES ($1,'observing','knowledge_change',$2,$3,$4,NOW()) RETURNING id`,
      [organizationId, event.id, `Respond to ${event.event_type}`, JSON.stringify({ summary: event.summary, materiality: event.materiality })]
    );
    await client.query("UPDATE marketing_change_events SET status='consumed',consumed_at=NOW() WHERE id=$1", [event.id]);
    await client.query(
      `INSERT INTO autonomous_growth_events (cycle_id,organization_id,phase,event_type,detail)
       VALUES ($1,$2,'observing','material_change_observed',$3)`,
      [cycle.rows[0].id, organizationId, JSON.stringify({ change_event_id: event.id, summary: event.summary })]
    );
    return String(cycle.rows[0].id);
  });
}

export async function ensureBaselineCycle(organizationId: string): Promise<string | null> {
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
      if (status === 'observing') {
        await query("UPDATE autonomous_growth_cycles SET status='planning',next_run_at=NOW(),claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
        await recordEvent(cycleId, orgId, 'planning', 'business_brain_reviewed', {});
      } else if (status === 'planning') {
        const plan = await query(
          `SELECT id,created_by FROM campaign_plans
           WHERE organization_id=$1 AND strategy_validation_status='valid'
           ORDER BY updated_at DESC LIMIT 1`, [orgId]
        );
        if (plan.rows.length === 0) {
          await query("UPDATE autonomous_growth_cycles SET next_run_at=NOW()+INTERVAL '1 hour',claim_token=NULL,claimed_at=NULL,updated_at=NOW(),state=jsonb_set(state,'{waiting_for}','\"validated_campaign_plan\"') WHERE id=$1", [cycleId]);
        } else {
          await query("UPDATE autonomous_growth_cycles SET status='producing',campaign_plan_id=$1,next_run_at=NOW(),claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$2", [plan.rows[0].id, cycleId]);
          await recordEvent(cycleId, orgId, 'producing', 'validated_strategy_selected', { campaign_plan_id: plan.rows[0].id });
        }
      } else if (status === 'producing') {
        const owner = await query(
          `SELECT user_id FROM organization_members WHERE organization_id=$1
           ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1`, [orgId]
        );
        if (owner.rows.length === 0) throw new Error('Organization has no production owner');
        await queueCampaignProduction(String(claimed.rows[0].campaign_plan_id), orgId, String(owner.rows[0].user_id));
        await query("UPDATE autonomous_growth_cycles SET status='quality_review',next_run_at=NOW()+INTERVAL '2 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
        await recordEvent(cycleId, orgId, 'quality_review', 'production_queued', {});
      } else if (status === 'quality_review') {
        const runs = await query(
          `SELECT COUNT(*)::int total,
                  COUNT(*) FILTER (WHERE status='completed')::int completed,
                  COUNT(*) FILTER (WHERE status='failed')::int failed
           FROM campaign_asset_runs WHERE campaign_plan_id=$1 AND organization_id=$2`,
          [claimed.rows[0].campaign_plan_id, orgId]
        );
        const counts = runs.rows[0];
        if (Number(counts.total) > 0 && Number(counts.total) === Number(counts.completed)) {
          await query("UPDATE autonomous_growth_cycles SET status='awaiting_owner_approval',next_run_at=NOW()+INTERVAL '10 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
          await recordEvent(cycleId, orgId, 'awaiting_owner_approval', 'quality_gate_completed', { assets: Number(counts.total) });
        } else if (Number(counts.failed) > 0 && Number(claimed.rows[0].attempt_count) >= 4) {
          throw new Error('Campaign production exceeded bounded retry limit');
        } else {
          await query("UPDATE autonomous_growth_cycles SET next_run_at=NOW()+INTERVAL '5 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
        }
      } else if (status === 'awaiting_owner_approval') {
        const approval = await query(
          `SELECT COUNT(*)::int total,
                  COUNT(*) FILTER (WHERE content.status='approved')::int approved
           FROM campaign_asset_runs run
           JOIN content_items content
             ON content.id=run.content_id AND content.organization_id=run.organization_id
           WHERE run.organization_id=$1 AND run.campaign_plan_id=$2
             AND run.status='completed' AND content.deleted_at IS NULL`,
          [orgId, claimed.rows[0].campaign_plan_id]
        );
        if (Number(approval.rows[0].approved) > 0) {
          await query("UPDATE autonomous_growth_cycles SET status='distributing',next_run_at=NOW(),claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
          await recordEvent(cycleId, orgId, 'distributing', 'owner_approved_content_available', approval.rows[0]);
        } else {
          await query("UPDATE autonomous_growth_cycles SET next_run_at=NOW()+INTERVAL '15 minutes',claim_token=NULL,claimed_at=NULL,updated_at=NOW() WHERE id=$1", [cycleId]);
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
