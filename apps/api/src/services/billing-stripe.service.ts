import { query, transaction } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { env } from '../config/env';
import { StripeEvent, stripeRequest, stringId, unixDate } from './stripe-client.service';

interface BillingPlanRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency: string;
  stripe_price_monthly_id: string | null;
  stripe_price_yearly_id: string | null;
  trial_days: number;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function unixIso(value: unknown): string | null {
  return unixDate(value)?.toISOString() || null;
}

async function getPlanBySlug(slug: string): Promise<BillingPlanRow> {
  const result = await query(
    `SELECT id,slug,name,price_monthly_cents,price_yearly_cents,currency,
            stripe_price_monthly_id,stripe_price_yearly_id,trial_days
     FROM billing_plans WHERE slug=$1 AND is_active=TRUE`,
    [slug]
  );
  if (result.rows.length === 0) throw new NotFoundError('Billing plan');
  return result.rows[0] as BillingPlanRow;
}

async function getCurrentSubscription(orgId: string): Promise<Record<string, unknown> | null> {
  const result = await query(
    `SELECT * FROM billing_subscriptions
     WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  );
  return result.rows[0] || null;
}

async function getOrganizationCustomerDetails(orgId: string): Promise<{ name: string; email?: string }> {
  const result = await query(
    `SELECT o.name,
            (SELECT u.email FROM organization_members om
             JOIN users u ON u.id=om.user_id
             WHERE om.organization_id=o.id AND u.deleted_at IS NULL
             ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,om.created_at
             LIMIT 1) AS email
     FROM organizations o WHERE o.id=$1 AND o.deleted_at IS NULL`,
    [orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Organization');
  return { name: String(result.rows[0].name), email: result.rows[0].email ? String(result.rows[0].email) : undefined };
}

async function getOrCreateStripeCustomer(orgId: string): Promise<string> {
  const existing = await query('SELECT stripe_customer_id FROM stripe_customers WHERE organization_id=$1', [orgId]);
  if (existing.rows.length > 0) return String(existing.rows[0].stripe_customer_id);

  const legacy = await query(
    `SELECT stripe_customer_id FROM billing_subscriptions
     WHERE organization_id=$1 AND stripe_customer_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [orgId]
  );
  if (legacy.rows.length > 0) {
    const customerId = String(legacy.rows[0].stripe_customer_id);
    await query(
      `INSERT INTO stripe_customers (organization_id,stripe_customer_id)
       VALUES ($1,$2) ON CONFLICT (organization_id) DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id,updated_at=NOW()`,
      [orgId, customerId]
    );
    return customerId;
  }

  const details = await getOrganizationCustomerDetails(orgId);
  const params = new URLSearchParams();
  params.set('name', details.name);
  if (details.email) params.set('email', details.email);
  params.set('metadata[organization_id]', orgId);
  const customer = await stripeRequest('POST', '/v1/customers', params);
  const customerId = String(customer.id || '');
  if (!customerId) throw new AppError(502, 'Stripe returned no customer ID', 'STRIPE_RESPONSE_INVALID');
  await query(
    `INSERT INTO stripe_customers (organization_id,stripe_customer_id)
     VALUES ($1,$2) ON CONFLICT (organization_id) DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id,updated_at=NOW()`,
    [orgId, customerId]
  );
  return customerId;
}

function priceIdForPlan(plan: BillingPlanRow, cycle: string): string {
  const yearly = cycle === 'yearly';
  const amount = Number(yearly ? plan.price_yearly_cents : plan.price_monthly_cents);
  if (amount <= 0) return '';
  const priceId = String(yearly ? plan.stripe_price_yearly_id || '' : plan.stripe_price_monthly_id || '');
  if (!priceId) throw new AppError(503, `${plan.name} has no Stripe ${yearly ? 'yearly' : 'monthly'} price configured`, 'STRIPE_PRICE_REQUIRED');
  return priceId;
}

async function activePromotionCode(orgId: string): Promise<string> {
  const result = await query(
    `SELECT bc.stripe_promotion_code_id
     FROM billing_redemptions br
     JOIN billing_coupons bc ON bc.id=br.coupon_id
     WHERE br.organization_id=$1 AND bc.is_active=TRUE
       AND (bc.valid_until IS NULL OR bc.valid_until>NOW())
       AND bc.stripe_promotion_code_id IS NOT NULL
     ORDER BY br.redeemed_at DESC LIMIT 1`,
    [orgId]
  );
  return result.rows[0]?.stripe_promotion_code_id ? String(result.rows[0].stripe_promotion_code_id) : '';
}

async function upsertPendingSubscription(
  orgId: string,
  plan: BillingPlanRow,
  billingCycle: string,
  customerId: string,
  checkoutSessionId: string
): Promise<void> {
  const existing = await getCurrentSubscription(orgId);
  if (existing && !existing.stripe_subscription_id && ['incomplete', 'incomplete_expired', 'canceled'].includes(String(existing.status))) {
    await query(
      `UPDATE billing_subscriptions SET plan_id=$1,status='incomplete',billing_cycle=$2,
         stripe_customer_id=$3,checkout_session_id=$4,cancel_at_period_end=FALSE,canceled_at=NULL,updated_at=NOW()
       WHERE id=$5`,
      [plan.id, billingCycle, customerId, checkoutSessionId, existing.id]
    );
    return;
  }
  await query(
    `INSERT INTO billing_subscriptions
       (organization_id,plan_id,status,billing_cycle,stripe_customer_id,checkout_session_id)
     VALUES ($1,$2,'incomplete',$3,$4,$5)`,
    [orgId, plan.id, billingCycle, customerId, checkoutSessionId]
  );
}

async function activateFreePlan(orgId: string, plan: BillingPlanRow, billingCycle: string): Promise<Record<string, unknown>> {
  const existing = await getCurrentSubscription(orgId);
  if (existing?.stripe_subscription_id && !['canceled', 'incomplete_expired'].includes(String(existing.status))) {
    throw new AppError(409, 'Use the billing portal to cancel the paid subscription before moving to a free plan', 'PAID_SUBSCRIPTION_ACTIVE');
  }
  const now = new Date();
  const periodEnd = new Date(now);
  if (billingCycle === 'yearly') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);
  const result = existing
    ? await query(
        `UPDATE billing_subscriptions SET plan_id=$1,status='active',billing_cycle=$2,
           current_period_start=$3,current_period_end=$4,trial_start=NULL,trial_end=NULL,
           checkout_session_id=NULL,cancel_at_period_end=FALSE,canceled_at=NULL,updated_at=NOW()
         WHERE id=$5 RETURNING *`,
        [plan.id, billingCycle, now, periodEnd, existing.id]
      )
    : await query(
        `INSERT INTO billing_subscriptions
           (organization_id,plan_id,status,billing_cycle,current_period_start,current_period_end)
         VALUES ($1,$2,'active',$3,$4,$5) RETURNING *`,
        [orgId, plan.id, billingCycle, now, periodEnd]
      );
  await logBillingEvent(orgId, String(result.rows[0].id), 'subscription.free_activated', { plan: plan.slug, billing_cycle: billingCycle });
  return result.rows[0];
}

export async function createSubscriptionCheckout(
  orgId: string,
  userId: string,
  planSlug: string,
  billingCycle = 'monthly'
): Promise<{ checkout_url: string | null; checkout_session_id?: string; free_subscription?: Record<string, unknown> }> {
  if (!['monthly', 'yearly'].includes(billingCycle)) throw new AppError(400, 'billing_cycle must be monthly or yearly', 'VALIDATION_ERROR');
  const plan = await getPlanBySlug(planSlug);
  const priceId = priceIdForPlan(plan, billingCycle);
  if (!priceId) {
    return { checkout_url: null, free_subscription: await activateFreePlan(orgId, plan, billingCycle) };
  }

  const existing = await getCurrentSubscription(orgId);
  if (existing?.stripe_subscription_id && ['active', 'trialing', 'past_due', 'unpaid'].includes(String(existing.status))) {
    await changeSubscriptionPlan(orgId, planSlug, billingCycle);
    return { checkout_url: null };
  }

  const customerId = await getOrCreateStripeCustomer(orgId);
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('customer', customerId);
  params.set('success_url', `${env.APP_URL}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${env.APP_URL}/billing?checkout=cancelled`);
  params.set('client_reference_id', orgId);
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('allow_promotion_codes', 'true');
  params.set('billing_address_collection', 'auto');
  params.set('metadata[kind]', 'billing_subscription');
  params.set('metadata[organization_id]', orgId);
  params.set('metadata[plan_id]', plan.id);
  params.set('metadata[billing_cycle]', billingCycle);
  params.set('metadata[user_id]', userId);
  params.set('subscription_data[metadata][kind]', 'billing_subscription');
  params.set('subscription_data[metadata][organization_id]', orgId);
  params.set('subscription_data[metadata][plan_id]', plan.id);
  params.set('subscription_data[metadata][billing_cycle]', billingCycle);
  if (Number(plan.trial_days || 0) > 0) params.set('subscription_data[trial_period_days]', String(plan.trial_days));
  const promotionCode = await activePromotionCode(orgId);
  if (promotionCode) {
    params.delete('allow_promotion_codes');
    params.set('discounts[0][promotion_code]', promotionCode);
  }

  const session = await stripeRequest('POST', '/v1/checkout/sessions', params);
  const sessionId = String(session.id || '');
  const checkoutUrl = String(session.url || '');
  if (!sessionId || !checkoutUrl) throw new AppError(502, 'Stripe returned no subscription checkout URL', 'STRIPE_RESPONSE_INVALID');
  await upsertPendingSubscription(orgId, plan, billingCycle, customerId, sessionId);
  await logBillingEvent(orgId, null, 'subscription.checkout_created', { plan: plan.slug, billing_cycle: billingCycle, checkout_session_id: sessionId });
  return { checkout_url: checkoutUrl, checkout_session_id: sessionId };
}

export async function createBillingPortalSession(orgId: string): Promise<{ url: string }> {
  const customerId = await getOrCreateStripeCustomer(orgId);
  const params = new URLSearchParams();
  params.set('customer', customerId);
  params.set('return_url', `${env.APP_URL}/billing`);
  const session = await stripeRequest('POST', '/v1/billing_portal/sessions', params);
  const url = String(session.url || '');
  if (!url) throw new AppError(502, 'Stripe returned no billing portal URL', 'STRIPE_RESPONSE_INVALID');
  return { url };
}

async function retrieveStripeSubscription(subscriptionId: string): Promise<Record<string, unknown>> {
  return stripeRequest('GET', `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

async function resolvePlanFromStripeSubscription(subscription: Record<string, unknown>): Promise<BillingPlanRow | null> {
  const metadata = objectValue(subscription.metadata);
  if (metadata.plan_id) {
    const byId = await query('SELECT * FROM billing_plans WHERE id=$1', [String(metadata.plan_id)]);
    if (byId.rows.length > 0) return byId.rows[0] as BillingPlanRow;
  }
  const items = objectValue(subscription.items);
  const firstItem = objectValue(arrayValue(items.data)[0]);
  const priceId = stringId(firstItem.price);
  if (!priceId) return null;
  const result = await query(
    `SELECT * FROM billing_plans
     WHERE stripe_price_monthly_id=$1 OR stripe_price_yearly_id=$1 LIMIT 1`,
    [priceId]
  );
  return result.rows[0] as BillingPlanRow || null;
}

async function resolveOrganizationId(object: Record<string, unknown>): Promise<string> {
  const metadata = objectValue(object.metadata);
  if (metadata.organization_id) return String(metadata.organization_id);
  const customerId = stringId(object.customer);
  if (customerId) {
    const customer = await query('SELECT organization_id FROM stripe_customers WHERE stripe_customer_id=$1', [customerId]);
    if (customer.rows.length > 0) return String(customer.rows[0].organization_id);
  }
  const subscriptionId = stringId(object.subscription) || (String(object.object || '') === 'subscription' ? String(object.id || '') : '');
  if (subscriptionId) {
    const subscription = await query('SELECT organization_id FROM billing_subscriptions WHERE stripe_subscription_id=$1', [subscriptionId]);
    if (subscription.rows.length > 0) return String(subscription.rows[0].organization_id);
  }
  return '';
}

export async function syncStripeSubscription(subscription: Record<string, unknown>, eventCreated?: number): Promise<void> {
  const subscriptionId = String(subscription.id || '');
  if (!subscriptionId) throw new AppError(400, 'Stripe subscription event contains no ID', 'STRIPE_PAYLOAD_INVALID');
  const orgId = await resolveOrganizationId(subscription);
  if (!orgId) throw new AppError(400, 'Could not resolve organization for Stripe subscription', 'STRIPE_METADATA_INVALID');
  const plan = await resolvePlanFromStripeSubscription(subscription);
  if (!plan) throw new AppError(400, 'Could not map Stripe subscription price to a billing plan', 'STRIPE_PLAN_UNMAPPED');
  const customerId = stringId(subscription.customer);
  const items = objectValue(subscription.items);
  const firstItem = objectValue(arrayValue(items.data)[0]);
  const subscriptionItemId = String(firstItem.id || '');
  const metadata = objectValue(subscription.metadata);
  const billingCycle = String(metadata.billing_cycle || (String(firstItem.price || '').includes('year') ? 'yearly' : 'monthly'));
  const status = String(subscription.status || 'incomplete');
  const eventAt = eventCreated ? new Date(eventCreated * 1000) : new Date();
  const defaultPaymentMethod = objectValue(subscription.default_payment_method);

  await transaction(async (client) => {
    if (customerId) {
      await client.query(
        `INSERT INTO stripe_customers (organization_id,stripe_customer_id)
         VALUES ($1,$2) ON CONFLICT (organization_id) DO UPDATE SET stripe_customer_id=EXCLUDED.stripe_customer_id,updated_at=NOW()`,
        [orgId, customerId]
      );
    }
    const existing = await client.query(
      `SELECT id,last_stripe_event_at FROM billing_subscriptions
       WHERE stripe_subscription_id=$1 OR (organization_id=$2 AND checkout_session_id IS NOT NULL)
       ORDER BY (stripe_subscription_id=$1) DESC,created_at DESC LIMIT 1`,
      [subscriptionId, orgId]
    );
    if (existing.rows[0]?.last_stripe_event_at && new Date(existing.rows[0].last_stripe_event_at) > eventAt) return;

    const values = [
      plan.id, subscriptionId, customerId || null, subscriptionItemId || null,
      status, billingCycle, unixDate(subscription.current_period_start), unixDate(subscription.current_period_end),
      unixDate(subscription.trial_start), unixDate(subscription.trial_end),
      status === 'canceled' ? unixDate(subscription.canceled_at) || new Date() : unixDate(subscription.canceled_at),
      subscription.cancel_at_period_end === true,
      JSON.stringify(defaultPaymentMethod), eventAt,
    ];
    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE billing_subscriptions SET
           plan_id=$1,stripe_subscription_id=$2,stripe_customer_id=$3,stripe_subscription_item_id=$4,
           status=$5,billing_cycle=$6,current_period_start=$7,current_period_end=$8,trial_start=$9,trial_end=$10,
           canceled_at=$11,cancel_at_period_end=$12,default_payment_method=$13,last_stripe_event_at=$14,updated_at=NOW()
         WHERE id=$15`,
        [...values, existing.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO billing_subscriptions
           (organization_id,plan_id,stripe_subscription_id,stripe_customer_id,stripe_subscription_item_id,
            status,billing_cycle,current_period_start,current_period_end,trial_start,trial_end,canceled_at,
            cancel_at_period_end,default_payment_method,last_stripe_event_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [orgId, ...values]
      );
    }
  });
  await logBillingEvent(orgId, subscriptionId, `stripe.subscription.${status}`, { stripe_subscription_id: subscriptionId, plan_id: plan.id });
}

export async function cancelSubscription(orgId: string, immediately = false): Promise<void> {
  const sub = await getCurrentSubscription(orgId);
  if (!sub) throw new NotFoundError('Subscription');
  if (!sub.stripe_subscription_id) {
    await query(
      `UPDATE billing_subscriptions SET status='canceled',canceled_at=NOW(),cancel_at_period_end=FALSE,updated_at=NOW()
       WHERE id=$1`,
      [sub.id]
    );
    return;
  }
  const subscription = immediately
    ? await stripeRequest('DELETE', `/v1/subscriptions/${encodeURIComponent(String(sub.stripe_subscription_id))}`)
    : await stripeRequest('POST', `/v1/subscriptions/${encodeURIComponent(String(sub.stripe_subscription_id))}`, new URLSearchParams({ cancel_at_period_end: 'true' }));
  await syncStripeSubscription(subscription);
}

export async function reactivateSubscription(orgId: string): Promise<void> {
  const sub = await getCurrentSubscription(orgId);
  if (!sub?.stripe_subscription_id) throw new AppError(409, 'No Stripe subscription can be reactivated', 'STRIPE_SUBSCRIPTION_REQUIRED');
  const subscription = await stripeRequest(
    'POST',
    `/v1/subscriptions/${encodeURIComponent(String(sub.stripe_subscription_id))}`,
    new URLSearchParams({ cancel_at_period_end: 'false' })
  );
  await syncStripeSubscription(subscription);
}

export async function changeSubscriptionPlan(orgId: string, planSlug: string, billingCycle = 'monthly'): Promise<void> {
  const sub = await getCurrentSubscription(orgId);
  if (!sub?.stripe_subscription_id) throw new AppError(409, 'No active Stripe subscription exists', 'STRIPE_SUBSCRIPTION_REQUIRED');
  const plan = await getPlanBySlug(planSlug);
  const priceId = priceIdForPlan(plan, billingCycle);
  if (!priceId) throw new AppError(409, 'Cancel the paid subscription before selecting the free plan', 'FREE_DOWNGRADE_REQUIRES_CANCELLATION');
  const remote = await retrieveStripeSubscription(String(sub.stripe_subscription_id));
  const items = objectValue(remote.items);
  const item = objectValue(arrayValue(items.data)[0]);
  const itemId = String(item.id || sub.stripe_subscription_item_id || '');
  if (!itemId) throw new AppError(502, 'Stripe subscription has no replaceable item', 'STRIPE_RESPONSE_INVALID');
  const params = new URLSearchParams();
  params.set('items[0][id]', itemId);
  params.set('items[0][price]', priceId);
  params.set('proration_behavior', 'create_prorations');
  params.set('cancel_at_period_end', 'false');
  params.set('metadata[kind]', 'billing_subscription');
  params.set('metadata[organization_id]', orgId);
  params.set('metadata[plan_id]', plan.id);
  params.set('metadata[billing_cycle]', billingCycle);
  const updated = await stripeRequest('POST', `/v1/subscriptions/${encodeURIComponent(String(sub.stripe_subscription_id))}`, params);
  await syncStripeSubscription(updated);
}

export async function syncStripeInvoice(invoice: Record<string, unknown>, eventCreated?: number): Promise<void> {
  const stripeInvoiceId = String(invoice.id || '');
  if (!stripeInvoiceId) throw new AppError(400, 'Stripe invoice event contains no ID', 'STRIPE_PAYLOAD_INVALID');
  const orgId = await resolveOrganizationId(invoice);
  if (!orgId) return;
  const subscriptionId = stringId(invoice.subscription);
  const localSub = subscriptionId
    ? await query('SELECT id FROM billing_subscriptions WHERE stripe_subscription_id=$1', [subscriptionId])
    : { rows: [] as Record<string, unknown>[] };
  const lines = objectValue(invoice.lines);
  const eventAt = eventCreated ? new Date(eventCreated * 1000) : new Date();
  await query(
    `INSERT INTO billing_invoices
       (organization_id,subscription_id,stripe_invoice_id,invoice_number,status,amount_cents,tax_cents,total_cents,
        currency,description,line_items,due_date,paid_at,pdf_url,hosted_invoice_url,payment_intent_id,last_stripe_event_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL DO UPDATE SET
       subscription_id=EXCLUDED.subscription_id,invoice_number=EXCLUDED.invoice_number,status=EXCLUDED.status,
       amount_cents=EXCLUDED.amount_cents,tax_cents=EXCLUDED.tax_cents,total_cents=EXCLUDED.total_cents,
       currency=EXCLUDED.currency,description=EXCLUDED.description,line_items=EXCLUDED.line_items,
       due_date=EXCLUDED.due_date,paid_at=EXCLUDED.paid_at,pdf_url=EXCLUDED.pdf_url,
       hosted_invoice_url=EXCLUDED.hosted_invoice_url,payment_intent_id=EXCLUDED.payment_intent_id,
       last_stripe_event_at=EXCLUDED.last_stripe_event_at
     WHERE billing_invoices.last_stripe_event_at IS NULL OR billing_invoices.last_stripe_event_at<=EXCLUDED.last_stripe_event_at`,
    [
      orgId, localSub.rows[0]?.id || null, stripeInvoiceId, invoice.number ? String(invoice.number) : null,
      String(invoice.status || 'open'), Number(invoice.amount_due || invoice.subtotal || 0), Number(invoice.tax || invoice.total_tax_amounts || 0),
      Number(invoice.total || invoice.amount_due || 0), String(invoice.currency || 'usd').toUpperCase(),
      invoice.description ? String(invoice.description) : null, JSON.stringify(arrayValue(lines.data)), unixDate(invoice.due_date),
      invoice.paid === true ? unixDate(invoice.status_transitions && objectValue(invoice.status_transitions).paid_at) || new Date() : null,
      invoice.invoice_pdf ? String(invoice.invoice_pdf) : null, invoice.hosted_invoice_url ? String(invoice.hosted_invoice_url) : null,
      stringId(invoice.payment_intent) || null, eventAt,
    ]
  );
  await logBillingEvent(orgId, localSub.rows[0]?.id ? String(localSub.rows[0].id) : null, `stripe.invoice.${String(invoice.status || 'updated')}`, { stripe_invoice_id: stripeInvoiceId });
}

export async function createStripeInvoice(
  orgId: string,
  data: { amount_cents: number; description: string; due_days?: number }
): Promise<Record<string, unknown>> {
  const amount = Math.round(Number(data.amount_cents));
  if (!Number.isFinite(amount) || amount <= 0) throw new AppError(400, 'amount_cents must be positive', 'VALIDATION_ERROR');
  const customerId = await getOrCreateStripeCustomer(orgId);
  const itemParams = new URLSearchParams();
  itemParams.set('customer', customerId);
  itemParams.set('amount', String(amount));
  itemParams.set('currency', 'usd');
  itemParams.set('description', data.description);
  itemParams.set('metadata[organization_id]', orgId);
  await stripeRequest('POST', '/v1/invoiceitems', itemParams);

  const invoiceParams = new URLSearchParams();
  invoiceParams.set('customer', customerId);
  invoiceParams.set('collection_method', 'send_invoice');
  invoiceParams.set('days_until_due', String(Math.max(1, Math.min(Number(data.due_days || 7), 90))));
  invoiceParams.set('auto_advance', 'true');
  invoiceParams.set('metadata[organization_id]', orgId);
  const invoice = await stripeRequest('POST', '/v1/invoices', invoiceParams);
  await syncStripeInvoice(invoice);
  return invoice;
}

export async function getInvoicePaymentUrl(orgId: string, invoiceId: string): Promise<{ url: string }> {
  const result = await query(
    `SELECT hosted_invoice_url FROM billing_invoices
     WHERE id=$1 AND organization_id=$2`,
    [invoiceId, orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Invoice');
  const url = String(result.rows[0].hosted_invoice_url || '');
  if (!url) throw new AppError(409, 'Invoice has no Stripe-hosted payment page', 'INVOICE_PAYMENT_URL_UNAVAILABLE');
  return { url };
}

export async function listStripePaymentMethods(orgId: string): Promise<Array<Record<string, unknown>>> {
  const customerId = await getOrCreateStripeCustomer(orgId);
  const params = new URLSearchParams({ customer: customerId, type: 'card' });
  const [methodsResponse, customer] = await Promise.all([
    stripeRequest('GET', '/v1/payment_methods', params),
    stripeRequest('GET', `/v1/customers/${encodeURIComponent(customerId)}`),
  ]);
  const methods = arrayValue(methodsResponse.data).map(objectValue);
  const defaultMethod = stringId(objectValue(customer.invoice_settings).default_payment_method);

  await transaction(async (client) => {
    await client.query('DELETE FROM billing_payment_methods WHERE organization_id=$1', [orgId]);
    for (const method of methods) {
      const card = objectValue(method.card);
      await client.query(
        `INSERT INTO billing_payment_methods
           (organization_id,stripe_payment_method_id,type,card_brand,card_last4,card_exp_month,card_exp_year,is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [orgId, String(method.id), String(method.type || 'card'), card.brand || null, card.last4 || null, card.exp_month || null, card.exp_year || null, String(method.id) === defaultMethod]
      );
    }
  });
  return methods.map((method) => {
    const card = objectValue(method.card);
    return {
      id: String(method.id), type: String(method.type || 'card'), card_brand: card.brand || null,
      card_last4: card.last4 || null, card_exp_month: card.exp_month || null, card_exp_year: card.exp_year || null,
      is_default: String(method.id) === defaultMethod,
    };
  });
}

export async function setDefaultStripePaymentMethod(orgId: string, paymentMethodId: string): Promise<void> {
  const customerId = await getOrCreateStripeCustomer(orgId);
  const attach = new URLSearchParams({ customer: customerId });
  await stripeRequest('POST', `/v1/payment_methods/${encodeURIComponent(paymentMethodId)}/attach`, attach);
  const params = new URLSearchParams();
  params.set('invoice_settings[default_payment_method]', paymentMethodId);
  await stripeRequest('POST', `/v1/customers/${encodeURIComponent(customerId)}`, params);
  await listStripePaymentMethods(orgId);
}

export async function removeStripePaymentMethod(orgId: string, paymentMethodId: string): Promise<void> {
  const methods = await listStripePaymentMethods(orgId);
  if (!methods.some((method) => method.id === paymentMethodId)) throw new NotFoundError('Payment method');
  await stripeRequest('POST', `/v1/payment_methods/${encodeURIComponent(paymentMethodId)}/detach`, new URLSearchParams());
  await listStripePaymentMethods(orgId);
}

export async function processBillingStripeEvent(event: StripeEvent): Promise<void> {
  const object = event.data.object;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const metadata = objectValue(object.metadata);
    if (metadata.kind !== 'billing_subscription') return;
    const subscriptionId = stringId(object.subscription);
    if (!subscriptionId) throw new AppError(400, 'Subscription Checkout Session contains no subscription', 'STRIPE_PAYLOAD_INVALID');
    await syncStripeSubscription(await retrieveStripeSubscription(subscriptionId), event.created);
    return;
  }
  if (event.type === 'checkout.session.expired' && objectValue(object.metadata).kind === 'billing_subscription') {
    await query(
      `UPDATE billing_subscriptions SET status='incomplete_expired',updated_at=NOW()
       WHERE checkout_session_id=$1 AND status='incomplete'`,
      [String(object.id || '')]
    );
    return;
  }
  if (event.type.startsWith('customer.subscription.')) {
    await syncStripeSubscription(object, event.created);
    return;
  }
  if (event.type.startsWith('invoice.')) {
    await syncStripeInvoice(object, event.created);
  }
}

export async function claimStripeEvent(event: StripeEvent): Promise<boolean> {
  const inserted = await query(
    `INSERT INTO stripe_webhook_events (event_id,event_type,livemode,status,payload)
     VALUES ($1,$2,$3,'processing',$4)
     ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [event.id, event.type, event.livemode === true, JSON.stringify(event)]
  );
  if (inserted.rows.length > 0) return true;
  const existing = await query('SELECT status FROM stripe_webhook_events WHERE event_id=$1', [event.id]);
  if (existing.rows[0]?.status === 'processed' || existing.rows[0]?.status === 'processing') return false;
  const retried = await query(
    `UPDATE stripe_webhook_events SET status='processing',error_message=NULL,received_at=NOW()
     WHERE event_id=$1 AND status='failed' RETURNING event_id`,
    [event.id]
  );
  return retried.rows.length > 0;
}

export async function completeStripeEvent(eventId: string): Promise<void> {
  await query(
    `UPDATE stripe_webhook_events SET status='processed',processed_at=NOW(),error_message=NULL WHERE event_id=$1`,
    [eventId]
  );
}

export async function failStripeEvent(eventId: string, error: unknown): Promise<void> {
  await query(
    `UPDATE stripe_webhook_events SET status='failed',error_message=$1,processed_at=NOW() WHERE event_id=$2`,
    [error instanceof Error ? error.message.slice(0, 4000) : String(error).slice(0, 4000), eventId]
  );
}

async function logBillingEvent(orgId: string, subscriptionId: string | null, eventType: string, data: Record<string, unknown>): Promise<void> {
  await query(
    'INSERT INTO billing_events (organization_id,subscription_id,event_type,data) VALUES ($1,$2,$3,$4)',
    [orgId, subscriptionId && /^[0-9a-f-]{36}$/i.test(subscriptionId) ? subscriptionId : null, eventType, JSON.stringify(data)]
  );
}
