import crypto from 'crypto';
import { query, transaction } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export type ExecutionChannel = 'content' | 'social' | 'email' | 'advertising' | 'seo' | 'analytics';

export interface ExecutionRequest {
  action_type: string;
  channel: ExecutionChannel;
  title: string;
  summary?: string;
  requested_credits?: number;
  requested_ad_spend_pence?: number;
  idempotency_key: string;
  payload?: Record<string, unknown>;
  requested_by?: 'system' | 'user' | 'application';
  requested_by_user_id?: string | null;
}

export interface ExecutionDecision {
  id: string;
  status: string;
  decision_reason: string | null;
  requested_credits: number;
  requested_ad_spend_pence: number;
}

const APPROVAL_TTL_MINUTES = Math.max(
  1,
  Number.parseInt(process.env.RELAUNCH_APPROVAL_TTL_MINUTES || '30', 10) || 30
);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function executionPayloadHash(payload: Record<string, unknown> = {}): string {
  return crypto.createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

function asNonNegativeInteger(value: unknown, field: string): number {
  const number = Number(value || 0);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new AppError(400, `${field} must be a non-negative integer`, 'RELAUNCH_ACTION_INVALID');
  }
  return number;
}

function parseChannels(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapDecision(row: Record<string, unknown>): ExecutionDecision {
  return {
    id: String(row.id),
    status: String(row.status),
    decision_reason: row.decision_reason ? String(row.decision_reason) : null,
    requested_credits: Number(row.requested_credits || 0),
    requested_ad_spend_pence: Number(row.requested_ad_spend_pence || 0),
  };
}

function temporaryBlock(reason: string, credits: number, adSpendPence: number): ExecutionDecision {
  return {
    id: '',
    status: 'blocked',
    decision_reason: reason,
    requested_credits: credits,
    requested_ad_spend_pence: adSpendPence,
  };
}

function throwForDecision(decision: ExecutionDecision): never {
  const message = decision.decision_reason || 'The Relaunch Control Centre did not approve this action';
  if (decision.status === 'pending') {
    throw new AppError(409, message, 'RELAUNCH_APPROVAL_REQUIRED');
  }
  throw new AppError(423, message, 'RELAUNCH_ACTION_BLOCKED');
}

/**
 * Authorize a real external action before delivery.
 *
 * Hard-limit and approval decisions are persisted and idempotent. Temporary
 * holds—emergency stop, operating window and daily budgets—are returned without
 * creating a permanent decision so the same action is evaluated again later.
 */
export async function requireExecutionApproval(
  organizationId: string,
  request: ExecutionRequest
): Promise<ExecutionDecision> {
  if (!request.action_type?.trim() || !request.title?.trim() || !request.idempotency_key?.trim()) {
    throw new AppError(400, 'action_type, title and idempotency_key are required', 'RELAUNCH_ACTION_INVALID');
  }

  const requestedCredits = asNonNegativeInteger(request.requested_credits, 'requested_credits');
  const requestedAdSpend = asNonNegativeInteger(request.requested_ad_spend_pence, 'requested_ad_spend_pence');

  const decision = await transaction(async (client) => {
    await client.query(
      `INSERT INTO relaunch_control_policies (organization_id)
       VALUES ($1) ON CONFLICT (organization_id) DO NOTHING`,
      [organizationId]
    );

    const policyResult = await client.query(
      'SELECT * FROM relaunch_control_policies WHERE organization_id=$1 FOR UPDATE',
      [organizationId]
    );
    const policy = policyResult.rows[0] as Record<string, unknown>;
    if (!policy) throw new AppError(500, 'Relaunch policy is unavailable', 'RELAUNCH_POLICY_MISSING');

    const payload = request.payload || {};
    const payloadHash = executionPayloadHash(payload);
    const recordTemporaryBlock = async (reason: string): Promise<ExecutionDecision> => {
      await client.query(
        `INSERT INTO relaunch_control_audit
           (organization_id,actor_user_id,event_type,next_state,reason)
         VALUES ($1,$2,'action_temporarily_blocked',$3,$4)`,
        [
          organizationId,
          request.requested_by_user_id || null,
          JSON.stringify({
            action_type: request.action_type,
            channel: request.channel,
            idempotency_key: request.idempotency_key,
            payload_hash: payloadHash,
            requested_credits: requestedCredits,
            requested_ad_spend_pence: requestedAdSpend,
          }),
          reason,
        ]
      );
      return temporaryBlock(reason, requestedCredits, requestedAdSpend);
    };

    if (policy.emergency_stop === true) {
      return recordTemporaryBlock('Emergency stop is active');
    }

    const existing = await client.query(
      `SELECT * FROM relaunch_action_decisions
       WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE`,
      [organizationId, request.idempotency_key.trim()]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0] as Record<string, unknown>;
      const recordedHash = String(row.payload_hash || executionPayloadHash(
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {}
      ));
      if (recordedHash !== payloadHash) {
        throw new AppError(
          409,
          'The approved action payload does not match this execution request',
          'RELAUNCH_APPROVAL_PAYLOAD_MISMATCH'
        );
      }
      if (Number(row.policy_version || 0) !== Number(policy.version || 0)) {
        throw new AppError(
          409,
          'The control policy changed; request a fresh decision',
          'RELAUNCH_DECISION_STALE'
        );
      }
      const expiresAt = row.approval_expires_at ? new Date(String(row.approval_expires_at)) : null;
      if (String(row.status) === 'approved' && expiresAt && expiresAt <= new Date()) {
        throw new AppError(409, 'The action approval expired', 'RELAUNCH_APPROVAL_EXPIRED');
      }
      return mapDecision(row);
    }

    const now = new Date();
    const activeFrom = policy.active_from ? new Date(String(policy.active_from)) : null;
    const activeUntil = policy.active_until ? new Date(String(policy.active_until)) : null;
    const outsideWindow = Boolean((activeFrom && activeFrom > now) || (activeUntil && activeUntil <= now));
    const allowedChannels = parseChannels(policy.allowed_channels);
    const channelAllowed = allowedChannels.includes(request.channel);
    const operatingMode = String(policy.operating_mode || 'manual');
    const perActionCreditLimit = Number(policy.per_action_credit_limit || 0);
    const perCampaignAdLimit = Number(policy.per_campaign_ad_limit_pence || 0);
    const approvalCreditThreshold = Number(policy.approval_credit_threshold || 0);
    const approvalAdThreshold = Number(policy.approval_ad_threshold_pence || 0);
    const dailyCreditLimit = Number(policy.daily_generation_credit_limit || 0);
    const dailyAdLimit = Number(policy.daily_ad_budget_pence || 0);
    const campaignPlanId = typeof payload.campaign_plan_id === 'string' ? payload.campaign_plan_id : '';
    let campaignCreditLimit = 0;
    let campaignCreditsCommitted = 0;
    let campaignPlanExecutable = true;
    if (request.action_type === 'generation' && campaignPlanId) {
      const planResult = await client.query(
        `SELECT status,generation_credit_limit FROM campaign_plans
         WHERE id=$1 AND organization_id=$2`,
        [campaignPlanId, organizationId]
      );
      campaignPlanExecutable = planResult.rows.length > 0 && String(planResult.rows[0].status) === 'approved';
      campaignCreditLimit = Number(planResult.rows[0]?.generation_credit_limit || 0);
      const committed = await client.query(
        `SELECT COALESCE(SUM(requested_credits),0)::bigint AS used
         FROM relaunch_action_decisions
         WHERE organization_id=$1 AND action_type='generation'
           AND payload->>'campaign_plan_id'=$2
           AND status IN ('pending','approved','running','completed')`,
        [organizationId, campaignPlanId]
      );
      campaignCreditsCommitted = Number(committed.rows[0]?.used || 0);
    }

    const creditUsage = await client.query(
      `SELECT COALESCE(SUM(credits),0)::bigint AS used
       FROM generation_credit_ledger
       WHERE organization_id=$1 AND entry_type='settlement' AND direction='debit'
         AND created_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2`,
      [organizationId, String(policy.timezone || 'Europe/London')]
    );
    const creditsUsedToday = Number(creditUsage.rows[0]?.used || 0);

    const recordedAdSpend = await client.query(
      `SELECT COALESCE(SUM(requested_ad_spend_pence),0)::bigint AS used
       FROM relaunch_action_decisions
       WHERE organization_id=$1 AND status IN ('running','completed')
         AND created_at >= date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2`,
      [organizationId, String(policy.timezone || 'Europe/London')]
    );
    const adSpendToday = Number(recordedAdSpend.rows[0]?.used || 0);

    const overActionCredit = perActionCreditLimit > 0 && requestedCredits > perActionCreditLimit;
    const overCampaignAd = perCampaignAdLimit > 0 && requestedAdSpend > perCampaignAdLimit;
    const overDailyCredit = dailyCreditLimit > 0 && creditsUsedToday + requestedCredits > dailyCreditLimit;
    const overDailyAd = dailyAdLimit > 0 && adSpendToday + requestedAdSpend > dailyAdLimit;
    const overCampaignCredits = campaignCreditLimit > 0
      && campaignCreditsCommitted + requestedCredits > campaignCreditLimit;

    if (outsideWindow) {
      return recordTemporaryBlock('The action is outside the configured operating window');
    }
    if (overDailyCredit) {
      return recordTemporaryBlock('Daily Generation Credit limit exceeded');
    }
    if (overDailyAd) {
      return recordTemporaryBlock('Daily advertising budget exceeded');
    }
    if (!campaignPlanExecutable) {
      return recordTemporaryBlock('The campaign strategy must be approved before asset generation');
    }
    if (overCampaignCredits) {
      return recordTemporaryBlock('Campaign Generation Credit limit exceeded');
    }

    let status: 'approved' | 'pending' | 'blocked';
    let reason: string;
    if (overActionCredit) {
      status = 'blocked';
      reason = 'Per-action Generation Credit limit exceeded';
    } else if (overCampaignAd) {
      status = 'blocked';
      reason = 'Per-campaign advertising limit exceeded';
    } else {
      const requiresApproval = operatingMode !== 'autonomous'
        || !channelAllowed
        || requestedCredits > approvalCreditThreshold
        || requestedAdSpend > approvalAdThreshold;
      status = requiresApproval ? 'pending' : 'approved';
      reason = requiresApproval
        ? 'Policy requires approval'
        : 'Approved automatically within policy';
    }

    const inserted = await client.query(
      `INSERT INTO relaunch_action_decisions
         (organization_id,action_type,channel,title,summary,status,requested_credits,
          requested_ad_spend_pence,policy_version,requested_by,requested_by_user_id,
          decision_reason,idempotency_key,payload,payload_hash,decided_at,approval_expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         CASE WHEN $6='approved' THEN NOW() ELSE NULL END,
         CASE WHEN $6='approved' THEN NOW() + ($16 || ' minutes')::interval ELSE NULL END)
       RETURNING *`,
      [
        organizationId,
        request.action_type.trim(),
        request.channel,
        request.title.trim(),
        request.summary || null,
        status,
        requestedCredits,
        requestedAdSpend,
        Number(policy.version || 0),
        request.requested_by || 'system',
        request.requested_by_user_id || null,
        reason,
        request.idempotency_key.trim(),
        JSON.stringify(payload),
        payloadHash,
        APPROVAL_TTL_MINUTES,
      ]
    );
    return mapDecision(inserted.rows[0]);
  });

  if (decision.status === 'approved') return decision;
  throwForDecision(decision);
}

export async function markExecutionRunning(decisionId: string): Promise<void> {
  const result = await query(
    `UPDATE relaunch_action_decisions decision
     SET status='running',started_at=NOW(),updated_at=NOW()
     FROM relaunch_control_policies policy
     WHERE decision.id=$1
       AND decision.organization_id=policy.organization_id
       AND decision.status='approved'
       AND policy.emergency_stop=FALSE
       AND decision.policy_version=policy.version
       AND (decision.approval_expires_at IS NULL OR decision.approval_expires_at > NOW())
     RETURNING decision.id`,
    [decisionId]
  );
  if (result.rows.length === 0) {
    throw new AppError(409, 'The approved action is no longer executable', 'RELAUNCH_DECISION_STALE');
  }
}

export async function markExecutionCompleted(decisionId: string): Promise<void> {
  await query(
    `UPDATE relaunch_action_decisions SET status='completed',completed_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND status='running'`,
    [decisionId]
  );
}

export async function markExecutionFailed(decisionId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error || 'Execution failed');
  await query(
    `UPDATE relaunch_action_decisions SET status='failed',decision_reason=$2,completed_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND status='running'`,
    [decisionId, message.slice(0, 2000)]
  );
}
