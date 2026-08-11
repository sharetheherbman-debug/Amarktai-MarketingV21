import { query, transaction } from '../config/database';
import { AppError, ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import { executionPayloadHash } from './relaunch-execution-gate.service';

const CHANNELS = ['content', 'social', 'email', 'advertising', 'seo', 'analytics'] as const;
type Channel = typeof CHANNELS[number];
type OperatingMode = 'manual' | 'approval' | 'autonomous';

export interface RelaunchPolicyInput {
  operating_mode?: OperatingMode;
  emergency_stop?: boolean;
  daily_generation_credit_limit?: number;
  per_action_credit_limit?: number;
  daily_ad_budget_pence?: number;
  per_campaign_ad_limit_pence?: number;
  approval_credit_threshold?: number;
  approval_ad_threshold_pence?: number;
  allowed_channels?: Channel[];
  require_approval_for_new_channel?: boolean;
  require_approval_for_new_audience?: boolean;
  require_approval_for_price_claims?: boolean;
  timezone?: string;
  active_from?: string | null;
  active_until?: string | null;
  reason?: string;
}

export interface ProposedAction {
  action_type: string;
  channel: Channel;
  title: string;
  summary?: string;
  requested_credits?: number;
  requested_ad_spend_pence?: number;
  idempotency_key: string;
  payload?: Record<string, unknown>;
  requested_by?: 'system' | 'user' | 'application';
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return (value as T) ?? fallback;
}

function nonNegativeInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new AppError(400, `${field} must be a non-negative integer`, 'RELAUNCH_POLICY_INVALID');
  }
  return number;
}

function optionalDate(value: string | null | undefined, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(400, `${field} must be a valid date`, 'RELAUNCH_POLICY_INVALID');
  return date;
}

function policyView(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    emergency_stop: row.emergency_stop === true,
    allowed_channels: parseJson<string[]>(row.allowed_channels, []),
    daily_generation_credit_limit: Number(row.daily_generation_credit_limit || 0),
    per_action_credit_limit: Number(row.per_action_credit_limit || 0),
    daily_ad_budget_pence: Number(row.daily_ad_budget_pence || 0),
    per_campaign_ad_limit_pence: Number(row.per_campaign_ad_limit_pence || 0),
    approval_credit_threshold: Number(row.approval_credit_threshold || 0),
    approval_ad_threshold_pence: Number(row.approval_ad_threshold_pence || 0),
    version: Number(row.version || 0),
  };
}

async function ensurePolicy(organizationId: string): Promise<Record<string, unknown>> {
  await query(
    `INSERT INTO relaunch_control_policies (organization_id)
     VALUES ($1)
     ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId]
  );
  const result = await query('SELECT * FROM relaunch_control_policies WHERE organization_id=$1', [organizationId]);
  if (result.rows.length === 0) throw new NotFoundError('Relaunch control policy');
  return result.rows[0];
}

async function requireManager(organizationId: string, userId: string): Promise<void> {
  const result = await query(
    'SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2',
    [organizationId, userId]
  );
  if (result.rows.length === 0 || !['owner', 'admin'].includes(String(result.rows[0].role))) {
    throw new ForbiddenError('Only organization owners and admins may change relaunch controls');
  }
}

export async function getControlCentre(organizationId: string): Promise<Record<string, unknown>> {
  const policy = policyView(await ensurePolicy(organizationId));
  const [wallet, creditsToday, connections, events, decisions] = await Promise.all([
    query(
      `SELECT available_credits,reserved_credits,lifetime_spent_credits,currency
       FROM generation_credit_wallets WHERE organization_id=$1`,
      [organizationId]
    ),
    query(
      `SELECT COALESCE(SUM(credits),0)::bigint AS credits
       FROM generation_credit_ledger
       WHERE organization_id=$1 AND entry_type='settlement' AND direction='debit'
         AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London'`,
      [organizationId]
    ),
    query(
      `SELECT ip.category,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE ic.status='active')::int AS active,
              COUNT(*) FILTER (WHERE ic.health_status='healthy')::int AS healthy
       FROM integration_connections ic
       JOIN integration_providers ip ON ip.id=ic.provider_id
       WHERE ic.organization_id=$1
       GROUP BY ip.category
       ORDER BY ip.category`,
      [organizationId]
    ),
    query(
      `SELECT event_type,COUNT(*)::int AS count,MAX(occurred_at) AS last_occurred_at
       FROM application_conversion_events
       WHERE application_id IN (
         SELECT application_id FROM application_connectors WHERE default_organization_id=$1
       )
       GROUP BY event_type ORDER BY MAX(occurred_at) DESC LIMIT 12`,
      [organizationId]
    ),
    query(
      `SELECT id,action_type,channel,title,summary,status,requested_credits,
              requested_ad_spend_pence,requested_by,decision_reason,created_at,decided_at
       FROM relaunch_action_decisions
       WHERE organization_id=$1
       ORDER BY created_at DESC LIMIT 30`,
      [organizationId]
    ),
  ]);

  const dailyCreditLimit = Number(policy.daily_generation_credit_limit || 0);
  const usedCredits = Number(creditsToday.rows[0]?.credits || 0);
  const walletRow = wallet.rows[0] || {
    available_credits: 0,
    reserved_credits: 0,
    lifetime_spent_credits: 0,
    currency: 'GBP',
  };
  const activeFrom = policy.active_from ? new Date(String(policy.active_from)) : null;
  const activeUntil = policy.active_until ? new Date(String(policy.active_until)) : null;
  const inWindow = (!activeFrom || activeFrom <= new Date()) && (!activeUntil || activeUntil > new Date());
  const emergencyStop = policy.emergency_stop === true;
  const operatingMode = String(policy.operating_mode);

  return {
    policy,
    runtime: {
      state: emergencyStop ? 'stopped' : operatingMode === 'manual' ? 'manual' : inWindow ? 'ready' : 'outside_schedule',
      can_execute_autonomously: !emergencyStop && operatingMode === 'autonomous' && inWindow,
      in_active_window: inWindow,
    },
    wallet: {
      available_credits: Number(walletRow.available_credits || 0),
      reserved_credits: Number(walletRow.reserved_credits || 0),
      lifetime_spent_credits: Number(walletRow.lifetime_spent_credits || 0),
      currency: 'GBP',
    },
    today: {
      generation_credits_used: usedCredits,
      generation_credits_remaining: dailyCreditLimit === 0 ? 0 : Math.max(0, dailyCreditLimit - usedCredits),
      daily_generation_credit_limit: dailyCreditLimit,
      daily_ad_budget_pence: Number(policy.daily_ad_budget_pence || 0),
      recorded_ad_spend_pence: 0,
    },
    connections: connections.rows.map((row) => ({
      category: row.category,
      total: Number(row.total || 0),
      active: Number(row.active || 0),
      healthy: Number(row.healthy || 0),
    })),
    conversion_events: events.rows,
    decisions: decisions.rows.map((row) => ({
      ...row,
      requested_credits: Number(row.requested_credits || 0),
      requested_ad_spend_pence: Number(row.requested_ad_spend_pence || 0),
    })),
  };
}

export async function updatePolicy(
  organizationId: string,
  userId: string,
  input: RelaunchPolicyInput
): Promise<Record<string, unknown>> {
  await requireManager(organizationId, userId);
  const previous = policyView(await ensurePolicy(organizationId));
  const channels = input.allowed_channels === undefined
    ? previous.allowed_channels as string[]
    : [...new Set(input.allowed_channels.map(String))];
  if (channels.some((channel) => !CHANNELS.includes(channel as Channel))) {
    throw new AppError(400, 'allowed_channels contains an unsupported channel', 'RELAUNCH_POLICY_INVALID');
  }
  const operatingMode = input.operating_mode ?? previous.operating_mode as OperatingMode;
  if (!['manual', 'approval', 'autonomous'].includes(String(operatingMode))) {
    throw new AppError(400, 'operating_mode is invalid', 'RELAUNCH_POLICY_INVALID');
  }
  const activeFrom = optionalDate(input.active_from, 'active_from');
  const activeUntil = optionalDate(input.active_until, 'active_until');
  if (activeFrom && activeUntil && activeUntil <= activeFrom) {
    throw new AppError(400, 'active_until must be after active_from', 'RELAUNCH_POLICY_INVALID');
  }
  const timezone = input.timezone === undefined ? String(previous.timezone || 'Europe/London') : String(input.timezone).trim();
  try { Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(); }
  catch { throw new AppError(400, 'timezone is invalid', 'RELAUNCH_POLICY_INVALID'); }

  return transaction(async (client) => {
    const currentResult = await client.query(
      'SELECT * FROM relaunch_control_policies WHERE organization_id=$1 FOR UPDATE',
      [organizationId]
    );
    const current = policyView(currentResult.rows[0]);
    const values = {
      operating_mode: operatingMode,
      emergency_stop: input.emergency_stop ?? current.emergency_stop,
      daily_generation_credit_limit: input.daily_generation_credit_limit === undefined
        ? Number(current.daily_generation_credit_limit)
        : nonNegativeInteger(input.daily_generation_credit_limit, 'daily_generation_credit_limit'),
      per_action_credit_limit: input.per_action_credit_limit === undefined
        ? Number(current.per_action_credit_limit)
        : nonNegativeInteger(input.per_action_credit_limit, 'per_action_credit_limit'),
      daily_ad_budget_pence: input.daily_ad_budget_pence === undefined
        ? Number(current.daily_ad_budget_pence)
        : nonNegativeInteger(input.daily_ad_budget_pence, 'daily_ad_budget_pence'),
      per_campaign_ad_limit_pence: input.per_campaign_ad_limit_pence === undefined
        ? Number(current.per_campaign_ad_limit_pence)
        : nonNegativeInteger(input.per_campaign_ad_limit_pence, 'per_campaign_ad_limit_pence'),
      approval_credit_threshold: input.approval_credit_threshold === undefined
        ? Number(current.approval_credit_threshold)
        : nonNegativeInteger(input.approval_credit_threshold, 'approval_credit_threshold'),
      approval_ad_threshold_pence: input.approval_ad_threshold_pence === undefined
        ? Number(current.approval_ad_threshold_pence)
        : nonNegativeInteger(input.approval_ad_threshold_pence, 'approval_ad_threshold_pence'),
      allowed_channels: channels,
      require_approval_for_new_channel: input.require_approval_for_new_channel ?? current.require_approval_for_new_channel,
      require_approval_for_new_audience: input.require_approval_for_new_audience ?? current.require_approval_for_new_audience,
      require_approval_for_price_claims: input.require_approval_for_price_claims ?? current.require_approval_for_price_claims,
      timezone,
      active_from: activeFrom === undefined ? current.active_from : activeFrom,
      active_until: activeUntil === undefined ? current.active_until : activeUntil,
    };

    const updated = await client.query(
      `UPDATE relaunch_control_policies SET
         operating_mode=$2,emergency_stop=$3,daily_generation_credit_limit=$4,
         per_action_credit_limit=$5,daily_ad_budget_pence=$6,
         per_campaign_ad_limit_pence=$7,approval_credit_threshold=$8,
         approval_ad_threshold_pence=$9,allowed_channels=$10,
         require_approval_for_new_channel=$11,require_approval_for_new_audience=$12,
         require_approval_for_price_claims=$13,timezone=$14,active_from=$15,
         active_until=$16,version=version+1,updated_by_user_id=$17,updated_at=NOW()
       WHERE organization_id=$1 RETURNING *`,
      [
        organizationId, values.operating_mode, values.emergency_stop,
        values.daily_generation_credit_limit, values.per_action_credit_limit,
        values.daily_ad_budget_pence, values.per_campaign_ad_limit_pence,
        values.approval_credit_threshold, values.approval_ad_threshold_pence,
        JSON.stringify(values.allowed_channels), values.require_approval_for_new_channel,
        values.require_approval_for_new_audience, values.require_approval_for_price_claims,
        values.timezone, values.active_from, values.active_until, userId,
      ]
    );
    const next = policyView(updated.rows[0]);
    await client.query(
      `INSERT INTO relaunch_control_audit
         (organization_id,actor_user_id,event_type,previous_state,next_state,reason)
       VALUES ($1,$2,'policy_updated',$3,$4,$5)`,
      [organizationId, userId, JSON.stringify(current), JSON.stringify(next), input.reason || null]
    );
    return next;
  });
}

export async function setEmergencyStop(
  organizationId: string,
  userId: string,
  stopped: boolean,
  reason: string
): Promise<Record<string, unknown>> {
  if (!reason?.trim()) throw new AppError(400, 'A reason is required', 'RELAUNCH_REASON_REQUIRED');
  return updatePolicy(organizationId, userId, { emergency_stop: stopped, reason: reason.trim() });
}

export async function proposeAction(
  organizationId: string,
  userId: string,
  action: ProposedAction
): Promise<Record<string, unknown>> {
  if (!CHANNELS.includes(action.channel)) throw new AppError(400, 'Unsupported action channel', 'RELAUNCH_ACTION_INVALID');
  if (!action.action_type?.trim() || !action.title?.trim() || !action.idempotency_key?.trim()) {
    throw new AppError(400, 'action_type, title and idempotency_key are required', 'RELAUNCH_ACTION_INVALID');
  }
  const policy = policyView(await ensurePolicy(organizationId));
  const requestedCredits = nonNegativeInteger(action.requested_credits || 0, 'requested_credits');
  const requestedAd = nonNegativeInteger(action.requested_ad_spend_pence || 0, 'requested_ad_spend_pence');
  const allowed = (policy.allowed_channels as string[]).includes(action.channel);
  const stopped = policy.emergency_stop === true;
  const overActionCredit = Number(policy.per_action_credit_limit || 0) > 0 && requestedCredits > Number(policy.per_action_credit_limit);
  const overCampaignAd = Number(policy.per_campaign_ad_limit_pence || 0) > 0 && requestedAd > Number(policy.per_campaign_ad_limit_pence);
  const requiresApproval = String(policy.operating_mode) !== 'autonomous'
    || !allowed
    || requestedCredits > Number(policy.approval_credit_threshold || 0)
    || requestedAd > Number(policy.approval_ad_threshold_pence || 0);
  const status = stopped || overActionCredit || overCampaignAd ? 'blocked' : requiresApproval ? 'pending' : 'approved';
  const reason = stopped ? 'Emergency stop is active'
    : overActionCredit ? 'Per-action Generation Credit limit exceeded'
    : overCampaignAd ? 'Per-campaign advertising limit exceeded'
    : requiresApproval ? 'Policy requires approval'
    : 'Approved automatically within policy';

  const result = await query(
    `INSERT INTO relaunch_action_decisions
       (organization_id,action_type,channel,title,summary,status,requested_credits,
        requested_ad_spend_pence,policy_version,requested_by,requested_by_user_id,
        decision_reason,idempotency_key,payload,payload_hash,decided_at,approval_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
       CASE WHEN $6='approved' THEN NOW() ELSE NULL END,
       CASE WHEN $6='approved' THEN NOW() + interval '30 minutes' ELSE NULL END)
     ON CONFLICT (organization_id,idempotency_key) DO UPDATE SET
       idempotency_key=EXCLUDED.idempotency_key
     RETURNING *`,
    [
      organizationId, action.action_type.trim(), action.channel, action.title.trim(),
      action.summary || null, status, requestedCredits, requestedAd, Number(policy.version || 0),
      action.requested_by || 'user', userId, reason, action.idempotency_key.trim(),
      JSON.stringify(action.payload || {}), executionPayloadHash(action.payload || {}),
    ]
  );
  return result.rows[0];
}

export async function decideAction(
  organizationId: string,
  userId: string,
  actionId: string,
  decision: 'approved' | 'rejected' | 'cancelled',
  reason: string
): Promise<Record<string, unknown>> {
  await requireManager(organizationId, userId);
  if (!reason?.trim()) throw new AppError(400, 'A decision reason is required', 'RELAUNCH_REASON_REQUIRED');
  const result = await query(
    `UPDATE relaunch_action_decisions SET
       status=$4,decided_by_user_id=$3,decision_reason=$5,decided_at=NOW(),
       approval_expires_at=CASE WHEN $4='approved' THEN NOW() + interval '30 minutes' ELSE NULL END,
       updated_at=NOW()
     WHERE id=$1 AND organization_id=$2 AND status IN ('pending','approved')
     RETURNING *`,
    [actionId, organizationId, userId, decision, reason.trim()]
  );
  if (result.rows.length === 0) throw new NotFoundError('Pending relaunch action');
  return result.rows[0];
}
