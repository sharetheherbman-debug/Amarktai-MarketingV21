import { query } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

// Types
export interface LicenseValidation {
  valid: boolean;
  orgId: string;
  plan: string;
  status: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  usage: Record<string, number>;
  expires_at: string | null;
  grace_period: boolean;
  errors: string[];
}

export interface UsageCheck {
  allowed: boolean;
  metric: string;
  current: number;
  limit: number;
  percentage: number;
  warning: boolean;
}

// ─── License Validation ──────────────────────────────────────────────────────

export async function validateLicense(orgId: string): Promise<LicenseValidation> {
  const errors: string[] = [];

  // Get subscription
  const subResult = await query(
    `SELECT bs.*, bp.slug as plan_slug, bp.name as plan_name, bp.features, bp.limits
     FROM billing_subscriptions bs
     JOIN billing_plans bp ON bs.plan_id = bp.id
     WHERE bs.organization_id = $1
     ORDER BY bs.created_at DESC LIMIT 1`,
    [orgId]
  );

  if (subResult.rows.length === 0) {
    return {
      valid: false,
      orgId,
      plan: 'none',
      status: 'no_subscription',
      features: {},
      limits: {},
      usage: {},
      expires_at: null,
      grace_period: false,
      errors: ['No active subscription found'],
    };
  }

  const sub = subResult.rows[0];
  const status = sub.status as string;
  const planSlug = sub.plan_slug as string;

  // Check subscription status
  if (status === 'canceled') {
    errors.push('Subscription has been canceled');
  }

  if (status === 'past_due') {
    errors.push('Payment is past due');
  }

  // Check trial expiry
  if (status === 'trialing' && sub.trial_end) {
    const trialEnd = new Date(sub.trial_end as string);
    if (trialEnd < new Date()) {
      errors.push('Trial period has expired');
    }
  }

  // Check period end
  if (sub.current_period_end) {
    const periodEnd = new Date(sub.current_period_end as string);
    if (periodEnd < new Date() && status === 'active') {
      errors.push('Billing period has ended');
    }
  }

  // Get current usage
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const usageResult = await query(
    'SELECT metric, SUM(quantity) as total FROM billing_usage WHERE organization_id = $1 AND period_start >= $2 GROUP BY metric',
    [orgId, periodStart]
  );

  const usage: Record<string, number> = {};
  for (const row of usageResult.rows) {
    usage[row.metric as string] = parseInt(row.total as string);
  }

  // Parse limits
  const limits = typeof sub.limits === 'string' ? JSON.parse(sub.limits) : (sub.limits as Record<string, number>) || {};

  // Check usage against limits
  for (const [metric, limitValue] of Object.entries(limits)) {
    const limit = limitValue as number;
    if (limit === -1) continue; // unlimited
    const current = usage[metric] || 0;
    if (current > limit) {
      errors.push(`Usage limit exceeded for ${metric}: ${current}/${limit}`);
    }
  }

  // Parse features
  const features = typeof sub.features === 'string' ? JSON.parse(sub.features) : {};
  const featureFlags: Record<string, boolean> = {};
  if (Array.isArray(features)) {
    features.forEach((f: string) => { featureFlags[f] = true; });
  }

  const gracePeriod = status === 'past_due';
  const valid = errors.length === 0 || gracePeriod;

  return {
    valid,
    orgId,
    plan: planSlug,
    status,
    features: featureFlags,
    limits,
    usage,
    expires_at: sub.current_period_end as string | null,
    grace_period: gracePeriod,
    errors,
  };
}

// ─── Usage Enforcement ───────────────────────────────────────────────────────

export async function checkUsageLimit(orgId: string, metric: string, requestedQuantity: number = 1): Promise<UsageCheck> {
  // Get plan limits
  const subResult = await query(
    `SELECT bp.limits FROM billing_subscriptions bs
     JOIN billing_plans bp ON bs.plan_id = bp.id
     WHERE bs.organization_id = $1 AND bs.status IN ('active', 'trialing')
     ORDER BY bs.created_at DESC LIMIT 1`,
    [orgId]
  );

  if (subResult.rows.length === 0) {
    return { allowed: true, metric, current: 0, limit: -1, percentage: 0, warning: false };
  }

  const limits = typeof subResult.rows[0].limits === 'string'
    ? JSON.parse(subResult.rows[0].limits as string)
    : (subResult.rows[0].limits as Record<string, number>) || {};

  const limit = limits[metric] ?? -1;
  if (limit === -1) {
    return { allowed: true, metric, current: 0, limit: -1, percentage: 0, warning: false };
  }

  // Get current usage
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const usageResult = await query(
    'SELECT COALESCE(SUM(quantity), 0) as total FROM billing_usage WHERE organization_id = $1 AND metric = $2 AND period_start >= $3',
    [orgId, metric, periodStart]
  );

  const current = parseInt(usageResult.rows[0].total as string);
  const percentage = limit > 0 ? (current / limit) * 100 : 0;

  return {
    allowed: current + requestedQuantity <= limit,
    metric,
    current,
    limit,
    percentage,
    warning: percentage >= 80,
  };
}

export async function enforceUsageLimit(orgId: string, metric: string, quantity: number = 1): Promise<void> {
  const check = await checkUsageLimit(orgId, metric, quantity);
  if (!check.allowed) {
    throw new AppError(
      429,
      `Usage limit exceeded for ${metric}. Current: ${check.current}, Limit: ${check.limit}`,
      'USAGE_LIMIT_EXCEEDED'
    );
  }
}

// ─── Overage Detection ───────────────────────────────────────────────────────

export async function detectOverages(orgId: string): Promise<Array<{ metric: string; current: number; limit: number; overage: number }>> {
  const subResult = await query(
    `SELECT bp.limits FROM billing_subscriptions bs
     JOIN billing_plans bp ON bs.plan_id = bp.id
     WHERE bs.organization_id = $1 AND bs.status IN ('active', 'trialing')
     ORDER BY bs.created_at DESC LIMIT 1`,
    [orgId]
  );

  if (subResult.rows.length === 0) return [];

  const limits = typeof subResult.rows[0].limits === 'string'
    ? JSON.parse(subResult.rows[0].limits as string)
    : (subResult.rows[0].limits as Record<string, number>) || {};

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const usageResult = await query(
    'SELECT metric, SUM(quantity) as total FROM billing_usage WHERE organization_id = $1 AND period_start >= $2 GROUP BY metric',
    [orgId, periodStart]
  );

  const overages: Array<{ metric: string; current: number; limit: number; overage: number }> = [];

  for (const row of usageResult.rows) {
    const metric = row.metric as string;
    const current = parseInt(row.total as string);
    const limit = limits[metric] ?? -1;

    if (limit !== -1 && current > limit) {
      overages.push({
        metric,
        current,
        limit,
        overage: current - limit,
      });
    }
  }

  return overages;
}

// ─── Grace Period Management ─────────────────────────────────────────────────

export async function checkGracePeriod(orgId: string): Promise<{ inGracePeriod: boolean; expiresAt: string | null }> {
  const result = await query(
    `SELECT status, current_period_end FROM billing_subscriptions
     WHERE organization_id = $1 AND status = 'past_due'
     ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  );

  if (result.rows.length === 0) {
    return { inGracePeriod: false, expiresAt: null };
  }

  const periodEnd = result.rows[0].current_period_end as string;
  // Grace period is 7 days after period end
  const graceEnd = new Date(periodEnd);
  graceEnd.setDate(graceEnd.getDate() + 7);

  return {
    inGracePeriod: graceEnd > new Date(),
    expiresAt: graceEnd.toISOString(),
  };
}

// ─── Automatic Suspension ────────────────────────────────────────────────────

export async function suspendOrganization(orgId: string, reason: string): Promise<void> {
  await query(
    "UPDATE organizations SET status = 'suspended', updated_at = NOW() WHERE id = $1",
    [orgId]
  );

  await query(
    "UPDATE billing_subscriptions SET status = 'suspended', metadata = jsonb_set(COALESCE(metadata, '{}'), '{suspension_reason}', $1) WHERE organization_id = $2 AND status IN ('active', 'past_due')",
    [JSON.stringify(reason), orgId]
  );

  logger.warn(`Organization suspended: ${orgId} - ${reason}`);
}

export async function reactivateOrganization(orgId: string): Promise<void> {
  await query(
    "UPDATE organizations SET status = 'active', updated_at = NOW() WHERE id = $1",
    [orgId]
  );

  await query(
    "UPDATE billing_subscriptions SET status = 'active', metadata = metadata - 'suspension_reason' WHERE organization_id = $1 AND status = 'suspended'",
    [orgId]
  );

  logger.info(`Organization reactivated: ${orgId}`);
}
