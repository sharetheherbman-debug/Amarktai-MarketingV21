import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';

export interface BillingPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tier: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  features: string[];
  limits: Record<string, number>;
  stripe_price_monthly_id: string | null;
  stripe_price_yearly_id: string | null;
  is_active: boolean;
  is_public: boolean;
  trial_days: number;
  sort_order: number;
  created_at: string;
}

export interface BillingSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  plan_name?: string;
  plan_slug?: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  status: string;
  billing_cycle: string;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_start: string | null;
  trial_end: string | null;
  canceled_at: string | null;
  cancel_at_period_end: boolean;
  default_payment_method: Record<string, unknown>;
  checkout_session_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingUsage {
  id: string;
  organization_id: string;
  metric: string;
  quantity: number;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface BillingInvoice {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  invoice_number: string | null;
  stripe_invoice_id?: string | null;
  status: string;
  amount_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  description: string | null;
  line_items: unknown[];
  due_date: string | null;
  paid_at: string | null;
  pdf_url: string | null;
  hosted_invoice_url?: string | null;
  created_at: string;
}

export interface TenantSettings {
  id: string;
  organization_id: string;
  custom_domain: string | null;
  ssl_enabled: boolean;
  branding: Record<string, unknown>;
  sso_enabled: boolean;
  sso_config: Record<string, unknown>;
  api_rate_limit: number;
  api_quota_monthly: number;
  storage_quota_bytes: number;
  features: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function listPlans(includeInactive = false): Promise<BillingPlan[]> {
  let sql = 'SELECT * FROM billing_plans';
  if (!includeInactive) sql += ' WHERE is_active=TRUE';
  sql += ' ORDER BY sort_order ASC';
  const result = await query(sql);
  return result.rows.map(mapPlanRow);
}

export async function getPlanBySlug(slug: string): Promise<BillingPlan> {
  const result = await query('SELECT * FROM billing_plans WHERE slug=$1', [slug]);
  if (result.rows.length === 0) throw new NotFoundError('Plan');
  return mapPlanRow(result.rows[0]);
}

export async function getPlanById(id: string): Promise<BillingPlan> {
  const result = await query('SELECT * FROM billing_plans WHERE id=$1', [id]);
  if (result.rows.length === 0) throw new NotFoundError('Plan');
  return mapPlanRow(result.rows[0]);
}

export async function getSubscription(orgId: string): Promise<BillingSubscription | null> {
  const result = await query(
    `SELECT bs.*,bp.name AS plan_name,bp.slug AS plan_slug
     FROM billing_subscriptions bs
     JOIN billing_plans bp ON bp.id=bs.plan_id
     WHERE bs.organization_id=$1 ORDER BY bs.created_at DESC LIMIT 1`,
    [orgId]
  );
  return result.rows.length > 0 ? mapSubscriptionRow(result.rows[0]) : null;
}

export async function recordUsage(orgId: string, metric: string, quantity: number): Promise<void> {
  if (!metric.trim() || !Number.isFinite(quantity) || quantity <= 0) {
    throw new AppError(400, 'A positive usage quantity and metric are required', 'USAGE_INVALID');
  }
  const sub = await getSubscription(orgId);
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  await query(
    `INSERT INTO billing_usage (organization_id,subscription_id,metric,quantity,period_start,period_end)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (organization_id,metric,period_start) DO UPDATE SET
       quantity=billing_usage.quantity+$4,updated_at=NOW()`,
    [orgId, sub?.id || null, metric, quantity, periodStart, periodEnd]
  );
}

export async function getUsage(orgId: string, metric?: string): Promise<BillingUsage[]> {
  let sql = 'SELECT * FROM billing_usage WHERE organization_id=$1';
  const params: unknown[] = [orgId];
  if (metric) { sql += ' AND metric=$2'; params.push(metric); }
  sql += ' ORDER BY period_start DESC,metric';
  const result = await query(sql, params);
  return result.rows.map(mapUsageRow);
}

export async function getCurrentUsage(orgId: string): Promise<Record<string, number>> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const result = await query(
    'SELECT metric,SUM(quantity) AS total FROM billing_usage WHERE organization_id=$1 AND period_start>=$2 GROUP BY metric',
    [orgId, periodStart]
  );
  return Object.fromEntries(result.rows.map((row) => [String(row.metric), Number(row.total || 0)]));
}

export async function checkLimit(orgId: string, metric: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sub = await getSubscription(orgId);
  if (!sub || !['active', 'trialing'].includes(sub.status)) return { allowed: false, current: 0, limit: 0 };
  const plan = await getPlanById(sub.plan_id);
  const limit = Number(plan.limits[metric] ?? -1);
  const current = (await getCurrentUsage(orgId))[metric] || 0;
  return { allowed: limit === -1 || current < limit, current, limit };
}

export async function listInvoices(orgId: string): Promise<BillingInvoice[]> {
  const result = await query('SELECT * FROM billing_invoices WHERE organization_id=$1 ORDER BY created_at DESC', [orgId]);
  return result.rows.map(mapInvoiceRow);
}

export async function getTenantSettings(orgId: string): Promise<TenantSettings> {
  const result = await query('SELECT * FROM tenant_settings WHERE organization_id=$1', [orgId]);
  if (result.rows.length > 0) return mapTenantRow(result.rows[0]);
  const inserted = await query('INSERT INTO tenant_settings (organization_id) VALUES ($1) RETURNING *', [orgId]);
  return mapTenantRow(inserted.rows[0]);
}

export async function updateTenantSettings(orgId: string, data: Partial<TenantSettings>): Promise<TenantSettings> {
  const existing = await getTenantSettings(orgId);
  const updates: string[] = [];
  const values: unknown[] = [];
  let index = 1;
  const add = (column: string, value: unknown) => { updates.push(`${column}=$${index++}`); values.push(value); };
  if (data.branding !== undefined) add('branding', JSON.stringify(data.branding));
  if (data.sso_enabled !== undefined) add('sso_enabled', data.sso_enabled);
  if (data.sso_config !== undefined) add('sso_config', JSON.stringify(data.sso_config));
  if (data.features !== undefined) add('features', JSON.stringify(data.features));
  if (updates.length === 0) return existing;
  updates.push('updated_at=NOW()');
  values.push(orgId);
  const result = await query(`UPDATE tenant_settings SET ${updates.join(',')} WHERE organization_id=$${index} RETURNING *`, values);
  return mapTenantRow(result.rows[0]);
}

export async function redeemCoupon(orgId: string, code: string): Promise<void> {
  const result = await query(
    `SELECT * FROM billing_coupons
     WHERE UPPER(code)=UPPER($1) AND is_active=TRUE AND valid_from<=NOW()`,
    [code.trim()]
  );
  if (result.rows.length === 0) throw new NotFoundError('Coupon');
  const coupon = result.rows[0];
  if (!coupon.stripe_promotion_code_id) {
    throw new AppError(409, 'Coupon is not linked to a Stripe promotion code', 'COUPON_NOT_CONFIGURED');
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
    throw new AppError(400, 'Coupon has expired', 'COUPON_EXPIRED');
  }
  if (coupon.max_redemptions && Number(coupon.redemption_count) >= Number(coupon.max_redemptions)) {
    throw new AppError(400, 'Coupon redemption limit reached', 'COUPON_LIMIT');
  }
  await transactionallyRedeemCoupon(orgId, String(coupon.id));
  logger.info(`Stripe-backed coupon redeemed: ${coupon.code} for org ${orgId}`);
}

async function transactionallyRedeemCoupon(orgId: string, couponId: string): Promise<void> {
  await query('BEGIN');
  try {
    const existing = await query(
      'SELECT 1 FROM billing_redemptions WHERE organization_id=$1 AND coupon_id=$2',
      [orgId, couponId]
    );
    if (existing.rows.length > 0) throw new AppError(400, 'Coupon already redeemed', 'COUPON_REDEEMED');
    await query('INSERT INTO billing_redemptions (organization_id,coupon_id) VALUES ($1,$2)', [orgId, couponId]);
    await query('UPDATE billing_coupons SET redemption_count=redemption_count+1 WHERE id=$1', [couponId]);
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

export async function getBillingEvents(orgId: string, limit = 50): Promise<Array<{ id: string; event_type: string; data: Record<string, unknown>; created_at: string }>> {
  const result = await query(
    'SELECT * FROM billing_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT $2',
    [orgId, Math.max(1, Math.min(Number(limit) || 50, 200))]
  );
  return result.rows.map((row) => ({
    id: String(row.id), event_type: String(row.event_type),
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as Record<string, unknown>) || {},
    created_at: String(row.created_at),
  }));
}

function mapPlanRow(row: Record<string, unknown>): BillingPlan {
  return {
    id: String(row.id), slug: String(row.slug), name: String(row.name),
    description: row.description ? String(row.description) : null, tier: String(row.tier),
    price_monthly_cents: Number(row.price_monthly_cents || 0), price_yearly_cents: Number(row.price_yearly_cents || 0),
    currency: String(row.currency || 'USD'),
    features: typeof row.features === 'string' ? JSON.parse(row.features) : (row.features as string[]) || [],
    limits: typeof row.limits === 'string' ? JSON.parse(row.limits) : (row.limits as Record<string, number>) || {},
    stripe_price_monthly_id: row.stripe_price_monthly_id ? String(row.stripe_price_monthly_id) : null,
    stripe_price_yearly_id: row.stripe_price_yearly_id ? String(row.stripe_price_yearly_id) : null,
    is_active: row.is_active === true, is_public: row.is_public === true,
    trial_days: Number(row.trial_days || 0), sort_order: Number(row.sort_order || 0), created_at: String(row.created_at),
  };
}

function mapSubscriptionRow(row: Record<string, unknown>): BillingSubscription {
  return {
    id: String(row.id), organization_id: String(row.organization_id), plan_id: String(row.plan_id),
    plan_name: row.plan_name ? String(row.plan_name) : undefined, plan_slug: row.plan_slug ? String(row.plan_slug) : undefined,
    stripe_subscription_id: row.stripe_subscription_id ? String(row.stripe_subscription_id) : null,
    stripe_customer_id: row.stripe_customer_id ? String(row.stripe_customer_id) : null,
    status: String(row.status), billing_cycle: String(row.billing_cycle),
    current_period_start: row.current_period_start ? String(row.current_period_start) : null,
    current_period_end: row.current_period_end ? String(row.current_period_end) : null,
    trial_start: row.trial_start ? String(row.trial_start) : null,
    trial_end: row.trial_end ? String(row.trial_end) : null,
    canceled_at: row.canceled_at ? String(row.canceled_at) : null,
    cancel_at_period_end: row.cancel_at_period_end === true,
    default_payment_method: typeof row.default_payment_method === 'string' ? JSON.parse(row.default_payment_method) : (row.default_payment_method as Record<string, unknown>) || {},
    checkout_session_id: row.checkout_session_id ? String(row.checkout_session_id) : null,
    created_at: String(row.created_at), updated_at: String(row.updated_at),
  };
}

function mapUsageRow(row: Record<string, unknown>): BillingUsage {
  return {
    id: String(row.id), organization_id: String(row.organization_id), metric: String(row.metric),
    quantity: Number(row.quantity || 0), period_start: String(row.period_start), period_end: String(row.period_end), created_at: String(row.created_at),
  };
}

function mapInvoiceRow(row: Record<string, unknown>): BillingInvoice {
  return {
    id: String(row.id), organization_id: String(row.organization_id),
    subscription_id: row.subscription_id ? String(row.subscription_id) : null,
    invoice_number: row.invoice_number ? String(row.invoice_number) : null,
    stripe_invoice_id: row.stripe_invoice_id ? String(row.stripe_invoice_id) : null,
    status: String(row.status), amount_cents: Number(row.amount_cents || 0), tax_cents: Number(row.tax_cents || 0),
    total_cents: Number(row.total_cents || 0), currency: String(row.currency || 'USD'),
    description: row.description ? String(row.description) : null,
    line_items: typeof row.line_items === 'string' ? JSON.parse(row.line_items) : (row.line_items as unknown[]) || [],
    due_date: row.due_date ? String(row.due_date) : null, paid_at: row.paid_at ? String(row.paid_at) : null,
    pdf_url: row.pdf_url ? String(row.pdf_url) : null,
    hosted_invoice_url: row.hosted_invoice_url ? String(row.hosted_invoice_url) : null,
    created_at: String(row.created_at),
  };
}

function mapTenantRow(row: Record<string, unknown>): TenantSettings {
  return {
    id: String(row.id), organization_id: String(row.organization_id), custom_domain: row.custom_domain ? String(row.custom_domain) : null,
    ssl_enabled: row.ssl_enabled === true,
    branding: typeof row.branding === 'string' ? JSON.parse(row.branding) : (row.branding as Record<string, unknown>) || {},
    sso_enabled: row.sso_enabled === true,
    sso_config: typeof row.sso_config === 'string' ? JSON.parse(row.sso_config) : (row.sso_config as Record<string, unknown>) || {},
    api_rate_limit: Number(row.api_rate_limit || 100), api_quota_monthly: Number(row.api_quota_monthly || 10000),
    storage_quota_bytes: Number(row.storage_quota_bytes || 10737418240),
    features: typeof row.features === 'string' ? JSON.parse(row.features) : (row.features as Record<string, unknown>) || {},
    created_at: String(row.created_at), updated_at: String(row.updated_at),
  };
}
