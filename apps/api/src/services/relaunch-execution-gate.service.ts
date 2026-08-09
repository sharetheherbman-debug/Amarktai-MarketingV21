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
 * The idempotency key permanently binds one external action to one decision.
 * An approved pending decision is reused on the next attempt; emergency stop is
 * checked again immediately before execution so an old approval cannot bypass a
 * newly activated stop.
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

  return transaction(async (client) => {
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

    if (policy.emergency_stop === true) {
      const existing = await client.query(
        `SELECT * FROM relaunch_action_decisions
         WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE`,
        [organizationId, request.idempotency_key.trim()]
      );
      if (existing.rows.length > 0 && String(existing.rows[0].status) !== 'completed') {
        await client.query(
          `UPDATE relaunch_action_decisions SET status='blocked',
             decision_reason='Emergency stop is active',updated_at=NOW()
           WHERE id=$1`,
          [existing.rows[0].id]
        );
      }
      throw new AppError(423, 'Emergency stop is active', 'RELAUNCH_ACTION_BLOCKED');
    }

    const existing = await client.query(
      `SELECT * FROM relaunch_action_decisions
       WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE`,
      [organizationId, request.idempotency_key.trim()]
    );
    if (existing.rows.length > 0) {
      const decision = mapDecision(existing.rows[0]);
      if (decision.status === 'approved') return decision;
      throwForDecision(decision);
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

    let status: 'approved' | 'pending' | 'blocked';
    let reason: string;
    if (outsideWindow) {
      status = 'blocked';
      reason = 'The action is outside the configured operating window';
    } else if (overActionCredit) {
      status = 'blocked';
      reason = 'Per-action Generation Credit limit exceeded';
    } else if (overCampaignAd) {
      status = 'blocked';
      reason = 'Per-campaign advertising limit exceeded';
    } else if (overDailyCredit) {
      status = 'blocked';
      reason = 'Daily Generation Credit limit exceeded';
    } else if (overDailyAd) {
      status = 'blocked';
      reason = 'Daily advertising budget exceeded';
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
          decision_reason,idempotency_key,payload,decided_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
         CASE WHEN $6='approved' THEN NOW() ELSE NULL END)
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
        JSON.stringify(request.payload || {}),
      ]
    );

    const decision = mapDecision(inserted.rows[0]);
    if (decision.status === 'approved') return decision;
    throwForDecision(decision);
  });
}

export async function markExecutionRunning(decisionId: string): Promise<void> {
  const result = await query(
    `UPDATE relaunch_action_decisions SET status='running',started_at=NOW(),updated_at=NOW()
     WHERE id=$1 AND status='approved' RETURNING id`,
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
