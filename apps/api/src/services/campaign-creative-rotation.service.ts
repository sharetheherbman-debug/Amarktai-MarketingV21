import crypto from 'crypto';
import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { schedulePostThroughControlCentre } from './controlled-social-publishing.service';

export interface PlanCreativeRotationInput {
  organizationId: string;
  campaignPlanId: string;
  connectionId: string;
  startAt: string;
  spacingHours?: number;
  fatigueWindowHours?: number;
  maxSlots?: number;
  userId: string;
  requestedBy?: 'user' | 'system' | 'application';
}

function asObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  try { return JSON.parse(String(value || '{}')) as Record<string, any>; } catch { return {}; }
}

function parseDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date <= new Date()) {
    throw new AppError(400, 'Rotation start time must be a valid future timestamp', 'ROTATION_START_INVALID');
  }
  return date;
}

function boundedHours(value: unknown, fallback: number, minimum: number, maximum: number, code: string): number {
  const hours = Math.floor(Number(value ?? fallback));
  if (!Number.isFinite(hours) || hours < minimum || hours > maximum) {
    throw new AppError(400, `Rotation timing must be between ${minimum} and ${maximum} hours`, code);
  }
  return hours;
}

function isControlHold(error: unknown): boolean {
  return error instanceof AppError && ['RELAUNCH_APPROVAL_REQUIRED', 'RELAUNCH_ACTION_BLOCKED'].includes(error.code);
}

function bodyForContent(content: Record<string, any>): string {
  const metadata = asObject(content.metadata);
  const finalText = asObject(metadata.final_text);
  return [finalText.headline, finalText.body, finalText.cta, content.body]
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join('\n\n')
    .slice(0, 2200);
}

export async function planCampaignCreativeRotation(input: PlanCreativeRotationInput): Promise<Array<Record<string, unknown>>> {
  const startAt = parseDate(input.startAt);
  const spacingHours = boundedHours(input.spacingHours, 48, 24, 336, 'ROTATION_SPACING_INVALID');
  const fatigueWindowHours = boundedHours(input.fatigueWindowHours, 168, 24, 720, 'ROTATION_FATIGUE_INVALID');
  const maxSlots = Math.max(1, Math.min(12, Math.floor(Number(input.maxSlots || 12))));
  const plan = await query(
    `SELECT id,name FROM campaign_plans WHERE id=$1 AND organization_id=$2`,
    [input.campaignPlanId, input.organizationId]
  );
  if (!plan.rows[0]) throw new NotFoundError('Campaign plan');
  const connection = await query(
    `SELECT id,platform FROM social_connections
      WHERE id=$1 AND organization_id=$2 AND status='active'`,
    [input.connectionId, input.organizationId]
  );
  if (!connection.rows[0]) throw new AppError(409, 'An active organization-owned social connection is required before rotation scheduling', 'ROTATION_CONNECTION_REQUIRED');
  const platform = String(connection.rows[0].platform);
  const candidates = await query(
    `SELECT run.id AS run_id,run.variant_number,run.final_material_asset_id,run.material_metadata,
            content.id AS content_id,content.body,content.metadata,asset.url AS final_material_url
       FROM campaign_asset_runs run
       JOIN content_items content ON content.id=run.content_id AND content.organization_id=run.organization_id
       JOIN studio_assets asset ON asset.id=run.final_material_asset_id AND asset.organization_id=run.organization_id AND asset.deleted_at IS NULL
      WHERE run.organization_id=$1 AND run.campaign_plan_id=$2
        AND run.material_status='ready_for_review'
        AND run.resolution_status IN ('approved','approved_and_scheduled')
        AND content.status='approved'
      ORDER BY run.variant_number,run.id`,
    [input.organizationId, input.campaignPlanId]
  );
  if (candidates.rows.length === 0) {
    throw new AppError(409, 'Approve at least one finished branded campaign material before scheduling rotation', 'ROTATION_APPROVED_MATERIAL_REQUIRED');
  }

  const planned: Array<Record<string, unknown>> = [];
  let slotIndex = 0;
  for (const candidate of candidates.rows) {
    if (planned.length >= maxSlots) break;
    const scheduledAt = new Date(startAt.getTime() + (slotIndex * spacingHours * 60 * 60 * 1000));
    slotIndex++;
    const fatigue = await query(
      `SELECT id FROM campaign_creative_rotations
        WHERE organization_id=$1 AND content_id=$2 AND platform=$3
          AND status IN ('planning','awaiting_control','scheduled','published')
          AND scheduled_at > ($4::timestamptz - ($5::text || ' hours')::interval)
          AND scheduled_at <= ($4::timestamptz + ($5::text || ' hours')::interval)
        LIMIT 1`,
      [input.organizationId, candidate.content_id, platform, scheduledAt.toISOString(), String(fatigueWindowHours)]
    );
    if (fatigue.rows.length > 0) {
      planned.push({
        campaign_asset_run_id: candidate.run_id,
        variant_number: Number(candidate.variant_number),
        scheduled_at: scheduledAt.toISOString(),
        status: 'skipped_fatigue',
        reason: `This creative is within the ${fatigueWindowHours}-hour fatigue window.`,
      });
      continue;
    }
    const idempotencyKey = crypto.createHash('sha256').update(JSON.stringify({
      campaignPlanId: input.campaignPlanId,
      runId: candidate.run_id,
      connectionId: input.connectionId,
      scheduledAt: scheduledAt.toISOString(),
    })).digest('hex');
    const existing = await query(
      `SELECT * FROM campaign_creative_rotations
        WHERE organization_id=$1 AND idempotency_key=$2 LIMIT 1`,
      [input.organizationId, idempotencyKey]
    );
    const rotation = existing.rows[0] || (await query(
      `INSERT INTO campaign_creative_rotations
         (organization_id,campaign_plan_id,campaign_asset_run_id,content_id,connection_id,platform,scheduled_at,fatigue_window_hours,idempotency_key,rationale)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        input.organizationId,
        input.campaignPlanId,
        candidate.run_id,
        candidate.content_id,
        input.connectionId,
        platform,
        scheduledAt.toISOString(),
        fatigueWindowHours,
        idempotencyKey,
        JSON.stringify({ strategy: 'ordered_variant_rotation', spacing_hours: spacingHours, fatigue_window_hours: fatigueWindowHours }),
      ]
    )).rows[0];
    if (String(rotation.status) === 'scheduled' || String(rotation.status) === 'published' || String(rotation.status) === 'scheduling') {
      planned.push(rotation);
      continue;
    }
    const claim = await query(
      `UPDATE campaign_creative_rotations SET status='scheduling',updated_at=NOW()
        WHERE id=$1 AND organization_id=$2 AND status IN ('planning','awaiting_control','failed')
        RETURNING *`,
      [rotation.id, input.organizationId]
    );
    if (!claim.rows[0]) {
      planned.push(rotation);
      continue;
    }
    try {
      const post = await schedulePostThroughControlCentre({
        organizationId: input.organizationId,
        connectionId: input.connectionId,
        contentId: String(candidate.content_id),
        campaignId: undefined,
        body: bodyForContent(candidate),
        mediaUrls: [String(candidate.final_material_url)],
        scheduledAt: scheduledAt.toISOString(),
        userId: input.userId,
        requestedBy: input.requestedBy || 'user',
        idempotencyKey: `creative-rotation:${idempotencyKey}`,
      });
      const updated = await query(
        `UPDATE campaign_creative_rotations
            SET status='scheduled',social_post_id=$1,updated_at=NOW()
          WHERE id=$2 AND organization_id=$3 RETURNING *`,
        [post.id, rotation.id, input.organizationId]
      );
      await query(
        `UPDATE campaign_asset_runs
            SET resolution_status='approved_and_scheduled',updated_at=NOW()
          WHERE id=$1 AND organization_id=$2 AND resolution_status='approved'`,
        [candidate.run_id, input.organizationId]
      );
      planned.push(updated.rows[0]);
    } catch (error) {
      if (isControlHold(error)) {
        const updated = await query(
          `UPDATE campaign_creative_rotations
              SET status='awaiting_control',updated_at=NOW()
            WHERE id=$1 AND organization_id=$2 RETURNING *`,
          [rotation.id, input.organizationId]
        );
        planned.push({ ...updated.rows[0], external_gate: error instanceof Error ? error.message : 'Control Centre approval is required before scheduling.' });
      } else {
        await query(
          `UPDATE campaign_creative_rotations
              SET status='failed',rationale=COALESCE(rationale,'{}'::jsonb) || $1::jsonb,updated_at=NOW()
            WHERE id=$2 AND organization_id=$3`,
          [JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), rotation.id, input.organizationId]
        );
        throw error;
      }
    }
  }
  return planned;
}

export async function listCampaignCreativeRotations(campaignPlanId: string, organizationId: string): Promise<Array<Record<string, unknown>>> {
  return (await query(
    `SELECT rotation.*,post.status AS social_post_status,post.published_at,post.engagement,post.external_url
       FROM campaign_creative_rotations rotation
       LEFT JOIN social_posts post ON post.id=rotation.social_post_id AND post.organization_id=rotation.organization_id
      WHERE rotation.campaign_plan_id=$1 AND rotation.organization_id=$2
      ORDER BY rotation.scheduled_at,rotation.created_at`,
    [campaignPlanId, organizationId]
  )).rows;
}

/** Refreshes the campaign-facing result snapshot without changing social-post truth. */
export async function syncCampaignCreativeRotationResults(limit = 100): Promise<number> {
  const rows = await query(
    `SELECT rotation.id,post.status,post.published_at,post.engagement,post.external_url
       FROM campaign_creative_rotations rotation
       JOIN social_posts post ON post.id=rotation.social_post_id AND post.organization_id=rotation.organization_id
      WHERE rotation.status IN ('scheduled','published')
      ORDER BY rotation.updated_at ASC LIMIT $1`,
    [Math.max(1, Math.min(500, limit))]
  );
  for (const row of rows.rows) {
    const status = String(row.status) === 'published' ? 'published' : 'scheduled';
    await query(
      `UPDATE campaign_creative_rotations
          SET status=$1,result_snapshot=$2,updated_at=NOW()
        WHERE id=$3`,
      [status, JSON.stringify({ published_at: row.published_at || null, engagement: asObject(row.engagement), external_url: row.external_url || null }), row.id]
    );
  }
  return rows.rows.length;
}
