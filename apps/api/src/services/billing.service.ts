import { query } from '../config/database';
import { logger } from '../utils/logger';
import { NotFoundError, AppError } from '../middleware/errorHandler';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  created_at: string;
}

export interface BillingPaymentMethod {
  id: string;
  organization_id: string;
  stripe_payment_method_id: string | null;
  type: string;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  is_default: boolean;
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

export interface BillingCoupon {
  id: string;
  code: string;
  name: string | null;
  discount_type: string;
  discount_value: number;
  max_redemptions: number | null;
  redemption_count: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export async function listPlans(includeInactive: boolean = false): Promise<BillingPlan[]> {
  let sql = 'SELECT * FROM billing_plans';
  if (!includeInactive) sql += ' WHERE is_active = TRUE';
  sql += ' ORDER BY sort_order ASC';
  const result = await query(sql);
  return result.rows.map(mapPlanRow);
}

export async function getPlanBySlug(slug: string): Promise<BillingPlan> {
  const result = await query('SELECT * FROM billing_plans WHERE slug = $1', [slug]);
  if (result.rows.length === 0) throw new NotFoundError('Plan');
  return mapPlanRow(result.rows[0]);
}

export async function getPlanById(id: string): Promise<BillingPlan> {
  const result = await query('SELECT * FROM billing_plans WHERE id = $1', [id]);
  if (result.rows.length === 0) throw new NotFoundError('Plan');
  return mapPlanRow(result.rows[0]);
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export async function getSubscription(orgId: string): Promise<BillingSubscription | null> {
  const result = await query(
    `SELECT bs.*, bp.name as plan_name, bp.slug as plan_slug
     FROM billing_subscriptions bs
     JOIN billing_plans bp ON bs.plan_id = bp.id
     WHERE bs.organization_id = $1
     ORDER BY bs.created_at DESC LIMIT 1`,
    [orgId]
  );
  return result.rows.length > 0 ? mapSubscriptionRow(result.rows[0]) : null;
}

export async function createSubscription(orgId: string, planSlug: string, billingCycle: string = 'monthly'): Promise<BillingSubscription> {
  const plan = await getPlanBySlug(planSlug);

  // Check for existing active subscription
  const existing = await getSubscription(orgId);
  if (existing && ['active', 'trialing'].includes(existing.status)) {
    throw new AppError(400, 'Organization already has an active subscription', 'SUBSCRIPTION_EXISTS');
  }

  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === 'yearly') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const trialEnd = plan.trial_days > 0 ? new Date(now.getTime() + plan.trial_days * 86400000) : null;

  const result = await query(
    `INSERT INTO billing_subscriptions (organization_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_start, trial_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [orgId, plan.id, plan.trial_days > 0 ? 'trialing' : 'active', billingCycle, now, periodEnd, plan.trial_days > 0 ? now : null, trialEnd]
  );

  await logEvent(orgId, result.rows[0].id as string, 'subscription.created', { plan: planSlug, cycle: billingCycle });
  logger.info(`Subscription created: ${planSlug} for org: ${orgId}`);
  return { ...mapSubscriptionRow(result.rows[0]), plan_name: plan.name, plan_slug: plan.slug };
}

export async function cancelSubscription(orgId: string, immediately: boolean = false): Promise<void> {
  const sub = await getSubscription(orgId);
  if (!sub) throw new NotFoundError('Subscription');

  if (immediately) {
    await query('UPDATE billing_subscriptions SET status = $1, canceled_at = NOW() WHERE id = $2', ['canceled', sub.id]);
  } else {
    await query('UPDATE billing_subscriptions SET cancel_at_period_end = TRUE WHERE id = $1', [sub.id]);
  }

  await logEvent(orgId, sub.id, 'subscription.canceled', { immediately });
  logger.info(`Subscription canceled: ${sub.id} (immediately: ${immediately})`);
}

export async function changePlan(orgId: string, newPlanSlug: string): Promise<BillingSubscription> {
  const sub = await getSubscription(orgId);
  if (!sub) throw new NotFoundError('Subscription');

  const newPlan = await getPlanBySlug(newPlanSlug);
  await query('UPDATE billing_subscriptions SET plan_id = $1, updated_at = NOW() WHERE id = $2', [newPlan.id, sub.id]);

  await logEvent(orgId, sub.id, 'subscription.plan_changed', { from: sub.plan_slug, to: newPlanSlug });
  logger.info(`Plan changed: ${sub.plan_slug} -> ${newPlanSlug} for org: ${orgId}`);
  return getSubscription(orgId) as Promise<BillingSubscription>;
}

export async function reactivateSubscription(orgId: string): Promise<void> {
  const sub = await getSubscription(orgId);
  if (!sub) throw new NotFoundError('Subscription');

  await query("UPDATE billing_subscriptions SET status = 'active', cancel_at_period_end = FALSE, canceled_at = NULL WHERE id = $1", [sub.id]);
  await logEvent(orgId, sub.id, 'subscription.reactivated', {});
}

// ─── Usage Metering ──────────────────────────────────────────────────────────

export async function recordUsage(orgId: string, metric: string, quantity: number): Promise<void> {
  const sub = await getSubscription(orgId);
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  await query(
    `INSERT INTO billing_usage (organization_id, subscription_id, metric, quantity, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id, metric, period_start) DO UPDATE SET
       quantity = billing_usage.quantity + $4,
       updated_at = NOW()`,
    [orgId, sub?.id || null, metric, quantity, periodStart, periodEnd]
  );
}

export async function getUsage(orgId: string, metric?: string): Promise<BillingUsage[]> {
  let sql = 'SELECT * FROM billing_usage WHERE organization_id = $1';
  const params: unknown[] = [orgId];
  if (metric) { sql += ' AND metric = $2'; params.push(metric); }
  sql += ' ORDER BY period_start DESC, metric';
  const result = await query(sql, params);
  return result.rows.map(mapUsageRow);
}

export async function getCurrentUsage(orgId: string): Promise<Record<string, number>> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const result = await query(
    'SELECT metric, SUM(quantity) as total FROM billing_usage WHERE organization_id = $1 AND period_start >= $2 GROUP BY metric',
    [orgId, periodStart]
  );
  const usage: Record<string, number> = {};
  for (const row of result.rows) {
    usage[row.metric as string] = parseInt(row.total as string);
  }
  return usage;
}

export async function checkLimit(orgId: string, metric: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const sub = await getSubscription(orgId);
  if (!sub) return { allowed: true, current: 0, limit: -1 };

  const plan = await getPlanById(sub.plan_id);
  const limit = plan.limits[metric] ?? -1;
  if (limit === -1) return { allowed: true, current: 0, limit: -1 }; // unlimited

  const usage = await getCurrentUsage(orgId);
  const current = usage[metric] || 0;

  return { allowed: current < limit, current, limit };
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export async function listInvoices(orgId: string): Promise<BillingInvoice[]> {
  const result = await query('SELECT * FROM billing_invoices WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
  return result.rows.map(mapInvoiceRow);
}

export async function createInvoice(orgId: string, data: { amount_cents: number; description: string; line_items?: unknown[]; due_date?: string }): Promise<BillingInvoice> {
  const sub = await getSubscription(orgId);
  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
  const result = await query(
    `INSERT INTO billing_invoices (organization_id, subscription_id, invoice_number, status, amount_cents, total_cents, description, line_items, due_date)
     VALUES ($1, $2, $3, 'open', $4, $4, $5, $6, $7) RETURNING *`,
    [orgId, sub?.id || null, invoiceNumber, data.amount_cents, data.description, JSON.stringify(data.line_items || []), data.due_date || null]
  );
  return mapInvoiceRow(result.rows[0]);
}

export async function markInvoicePaid(id: string, orgId: string): Promise<void> {
  await query("UPDATE billing_invoices SET status = 'paid', paid_at = NOW() WHERE id = $1 AND organization_id = $2", [id, orgId]);
  await logEvent(orgId, null, 'invoice.paid', { invoice_id: id });
}

// ─── Payment Methods ─────────────────────────────────────────────────────────

export async function listPaymentMethods(orgId: string): Promise<BillingPaymentMethod[]> {
  const result = await query('SELECT * FROM billing_payment_methods WHERE organization_id = $1 ORDER BY is_default DESC, created_at DESC', [orgId]);
  return result.rows.map(mapPaymentMethodRow);
}

export async function addPaymentMethod(orgId: string, data: { type: string; card_brand?: string; card_last4?: string; card_exp_month?: number; card_exp_year?: number }): Promise<BillingPaymentMethod> {
  // If first payment method, make it default
  const existing = await listPaymentMethods(orgId);
  const isDefault = existing.length === 0;

  const result = await query(
    `INSERT INTO billing_payment_methods (organization_id, type, card_brand, card_last4, card_exp_month, card_exp_year, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [orgId, data.type, data.card_brand || null, data.card_last4 || null, data.card_exp_month || null, data.card_exp_year || null, isDefault]
  );
  return mapPaymentMethodRow(result.rows[0]);
}

export async function setDefaultPaymentMethod(id: string, orgId: string): Promise<void> {
  await query('UPDATE billing_payment_methods SET is_default = FALSE WHERE organization_id = $1', [orgId]);
  await query('UPDATE billing_payment_methods SET is_default = TRUE WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

export async function removePaymentMethod(id: string, orgId: string): Promise<void> {
  await query('DELETE FROM billing_payment_methods WHERE id = $1 AND organization_id = $2', [id, orgId]);
}

// ─── Tenant Settings ─────────────────────────────────────────────────────────

export async function getTenantSettings(orgId: string): Promise<TenantSettings> {
  const result = await query('SELECT * FROM tenant_settings WHERE organization_id = $1', [orgId]);
  if (result.rows.length === 0) {
    // Create default settings
    const insert = await query(
      'INSERT INTO tenant_settings (organization_id) VALUES ($1) RETURNING *',
      [orgId]
    );
    return mapTenantRow(insert.rows[0]);
  }
  return mapTenantRow(result.rows[0]);
}

export async function updateTenantSettings(orgId: string, data: Partial<TenantSettings>): Promise<TenantSettings> {
  const existing = await getTenantSettings(orgId);
  const updates: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (data.custom_domain !== undefined) { updates.push(`custom_domain = $${idx++}`); values.push(data.custom_domain); }
  if (data.branding !== undefined) { updates.push(`branding = $${idx++}`); values.push(JSON.stringify(data.branding)); }
  if (data.sso_enabled !== undefined) { updates.push(`sso_enabled = $${idx++}`); values.push(data.sso_enabled); }
  if (data.sso_config !== undefined) { updates.push(`sso_config = $${idx++}`); values.push(JSON.stringify(data.sso_config)); }
  if (data.features !== undefined) { updates.push(`features = $${idx++}`); values.push(JSON.stringify(data.features)); }

  if (updates.length === 0) return existing;
  updates.push('updated_at = NOW()');
  values.push(orgId);

  const result = await query(`UPDATE tenant_settings SET ${updates.join(', ')} WHERE organization_id = $${idx} RETURNING *`, values);
  return mapTenantRow(result.rows[0]);
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

export async function redeemCoupon(orgId: string, code: string): Promise<void> {
  const result = await query('SELECT * FROM billing_coupons WHERE code = $1 AND is_active = TRUE', [code]);
  if (result.rows.length === 0) throw new NotFoundError('Coupon');

  const coupon = result.rows[0];

  // Check validity
  if (coupon.valid_until && new Date(coupon.valid_until as string) < new Date()) {
    throw new AppError(400, 'Coupon has expired', 'COUPON_EXPIRED');
  }
  if (coupon.max_redemptions && coupon.redemption_count >= coupon.max_redemptions) {
    throw new AppError(400, 'Coupon redemption limit reached', 'COUPON_LIMIT');
  }

  // Check if already redeemed
  const existing = await query('SELECT * FROM billing_redemptions WHERE organization_id = $1 AND coupon_id = $2', [orgId, coupon.id]);
  if (existing.rows.length > 0) throw new AppError(400, 'Coupon already redeemed', 'COUPON_REDEEMED');

  await query('INSERT INTO billing_redemptions (organization_id, coupon_id) VALUES ($1, $2)', [orgId, coupon.id]);
  await query('UPDATE billing_coupons SET redemption_count = redemption_count + 1 WHERE id = $1', [coupon.id]);
  logger.info(`Coupon redeemed: ${code} for org: ${orgId}`);
}

// ─── Billing Events ──────────────────────────────────────────────────────────

async function logEvent(orgId: string, subscriptionId: string | null, eventType: string, data: Record<string, unknown>): Promise<void> {
  await query(
    'INSERT INTO billing_events (organization_id, subscription_id, event_type, data) VALUES ($1, $2, $3, $4)',
    [orgId, subscriptionId, eventType, JSON.stringify(data)]
  );
}

export async function getBillingEvents(orgId: string, limit: number = 50): Promise<Array<{ id: string; event_type: string; data: Record<string, unknown>; created_at: string }>> {
  const result = await query(
    'SELECT * FROM billing_events WHERE organization_id = $1 ORDER BY created_at DESC LIMIT $2',
    [orgId, limit]
  );
  return result.rows.map(row => ({
    id: row.id as string,
    event_type: row.event_type as string,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as Record<string, unknown>) || {},
    created_at: row.created_at as string,
  }));
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapPlanRow(row: Record<string, unknown>): BillingPlan {
  return {
    id: row.id as string, slug: row.slug as string, name: row.name as string,
    description: row.description as string | null, tier: row.tier as string,
    price_monthly_cents: parseInt(row.price_monthly_cents as string) || 0,
    price_yearly_cents: parseInt(row.price_yearly_cents as string) || 0,
    currency: row.currency as string,
    features: typeof row.features === 'string' ? JSON.parse(row.features) : (row.features as string[]) || [],
    limits: typeof row.limits === 'string' ? JSON.parse(row.limits) : (row.limits as Record<string, number>) || {},
    stripe_price_monthly_id: row.stripe_price_monthly_id as string | null,
    stripe_price_yearly_id: row.stripe_price_yearly_id as string | null,
    is_active: row.is_active as boolean, is_public: row.is_public as boolean,
    trial_days: parseInt(row.trial_days as string) || 0,
    sort_order: parseInt(row.sort_order as string) || 0,
    created_at: row.created_at as string,
  };
}

function mapSubscriptionRow(row: Record<string, unknown>): BillingSubscription {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    plan_id: row.plan_id as string,
    plan_name: row.plan_name as string | undefined,
    plan_slug: row.plan_slug as string | undefined,
    stripe_subscription_id: row.stripe_subscription_id as string | null,
    stripe_customer_id: row.stripe_customer_id as string | null,
    status: row.status as string, billing_cycle: row.billing_cycle as string,
    current_period_start: row.current_period_start as string | null,
    current_period_end: row.current_period_end as string | null,
    trial_start: row.trial_start as string | null,
    trial_end: row.trial_end as string | null,
    canceled_at: row.canceled_at as string | null,
    cancel_at_period_end: row.cancel_at_period_end as boolean,
    default_payment_method: typeof row.default_payment_method === 'string' ? JSON.parse(row.default_payment_method) : (row.default_payment_method as Record<string, unknown>) || {},
    created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}

function mapUsageRow(row: Record<string, unknown>): BillingUsage {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    metric: row.metric as string, quantity: parseInt(row.quantity as string) || 0,
    period_start: row.period_start as string, period_end: row.period_end as string,
    created_at: row.created_at as string,
  };
}

function mapInvoiceRow(row: Record<string, unknown>): BillingInvoice {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    subscription_id: row.subscription_id as string | null,
    invoice_number: row.invoice_number as string | null, status: row.status as string,
    amount_cents: parseInt(row.amount_cents as string) || 0,
    tax_cents: parseInt(row.tax_cents as string) || 0,
    total_cents: parseInt(row.total_cents as string) || 0,
    currency: row.currency as string, description: row.description as string | null,
    line_items: typeof row.line_items === 'string' ? JSON.parse(row.line_items) : (row.line_items as unknown[]) || [],
    due_date: row.due_date as string | null, paid_at: row.paid_at as string | null,
    pdf_url: row.pdf_url as string | null, created_at: row.created_at as string,
  };
}

function mapPaymentMethodRow(row: Record<string, unknown>): BillingPaymentMethod {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    stripe_payment_method_id: row.stripe_payment_method_id as string | null,
    type: row.type as string, card_brand: row.card_brand as string | null,
    card_last4: row.card_last4 as string | null,
    card_exp_month: row.card_exp_month ? parseInt(row.card_exp_month as string) : null,
    card_exp_year: row.card_exp_year ? parseInt(row.card_exp_year as string) : null,
    is_default: row.is_default as boolean, created_at: row.created_at as string,
  };
}

function mapTenantRow(row: Record<string, unknown>): TenantSettings {
  return {
    id: row.id as string, organization_id: row.organization_id as string,
    custom_domain: row.custom_domain as string | null,
    ssl_enabled: row.ssl_enabled as boolean,
    branding: typeof row.branding === 'string' ? JSON.parse(row.branding) : (row.branding as Record<string, unknown>) || {},
    sso_enabled: row.sso_enabled as boolean,
    sso_config: typeof row.sso_config === 'string' ? JSON.parse(row.sso_config) : (row.sso_config as Record<string, unknown>) || {},
    api_rate_limit: parseInt(row.api_rate_limit as string) || 100,
    api_quota_monthly: parseInt(row.api_quota_monthly as string) || 10000,
    storage_quota_bytes: parseInt(row.storage_quota_bytes as string) || 10737418240,
    features: typeof row.features === 'string' ? JSON.parse(row.features) : (row.features as Record<string, unknown>) || {},
    created_at: row.created_at as string, updated_at: row.updated_at as string,
  };
}
