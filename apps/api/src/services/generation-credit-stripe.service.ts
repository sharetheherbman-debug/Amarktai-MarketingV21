import { query } from '../config/database';
import { env } from '../config/env';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { StripeEvent, stripeRequest, stringId } from './stripe-client.service';
import { creditPaidStripePurchase } from './generation-credit.service';

interface CreditPackRow extends Record<string, unknown> {
  code: string;
  name: string;
  description: string | null;
  credits: string | number;
  price_pence: string | number;
  currency: string;
  stripe_price_id: string | null;
  is_active: boolean;
  sort_order: string | number;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapPack(row: CreditPackRow) {
  return {
    code: String(row.code),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    credits: Number(row.credits),
    price_pence: Number(row.price_pence),
    currency: 'GBP' as const,
    formatted_price: `£${(Number(row.price_pence) / 100).toFixed(2)}`,
    sort_order: Number(row.sort_order || 0),
  };
}

export async function listCreditPacks() {
  const result = await query(
    `SELECT * FROM generation_credit_packs
     WHERE is_active=TRUE AND currency='GBP'
     ORDER BY sort_order,price_pence`
  );
  return result.rows.map((row) => mapPack(row as CreditPackRow));
}

async function getPack(code: string): Promise<CreditPackRow> {
  const result = await query(
    `SELECT * FROM generation_credit_packs
     WHERE code=$1 AND is_active=TRUE AND currency='GBP'`,
    [code]
  );
  if (!result.rows[0]) throw new NotFoundError('Generation Credit pack');
  return result.rows[0] as CreditPackRow;
}

async function getOrganizationCustomerDetails(organizationId: string): Promise<{ name: string; email?: string }> {
  const result = await query(
    `SELECT o.name,
       (SELECT u.email FROM organization_members om
        JOIN users u ON u.id=om.user_id
        WHERE om.organization_id=o.id AND u.deleted_at IS NULL
        ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,om.created_at
        LIMIT 1) AS email
     FROM organizations o
     WHERE o.id=$1 AND o.deleted_at IS NULL`,
    [organizationId]
  );
  if (!result.rows[0]) throw new NotFoundError('Organization');
  return {
    name: String(result.rows[0].name),
    email: result.rows[0].email ? String(result.rows[0].email) : undefined,
  };
}

async function getOrCreateStripeCustomer(organizationId: string): Promise<string> {
  const existing = await query(
    'SELECT stripe_customer_id FROM stripe_customers WHERE organization_id=$1',
    [organizationId]
  );
  if (existing.rows[0]) return String(existing.rows[0].stripe_customer_id);

  const details = await getOrganizationCustomerDetails(organizationId);
  const params = new URLSearchParams();
  params.set('name', details.name);
  if (details.email) params.set('email', details.email);
  params.set('metadata[organization_id]', organizationId);
  params.set('metadata[customer_kind]', 'generation_credits');

  const customer = await stripeRequest('POST', '/v1/customers', params);
  const customerId = String(customer.id || '');
  if (!customerId) {
    throw new AppError(502, 'Stripe returned no customer ID', 'STRIPE_RESPONSE_INVALID');
  }

  await query(
    `INSERT INTO stripe_customers (organization_id,stripe_customer_id)
     VALUES ($1,$2)
     ON CONFLICT (organization_id) DO UPDATE SET
       stripe_customer_id=EXCLUDED.stripe_customer_id,updated_at=NOW()`,
    [organizationId, customerId]
  );
  return customerId;
}

export async function createCreditCheckout(input: {
  organizationId: string;
  userId: string;
  packCode: string;
}): Promise<{ checkout_url: string; checkout_session_id: string; pack: ReturnType<typeof mapPack> }> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, 'Stripe credit purchases are not configured', 'STRIPE_NOT_CONFIGURED');
  }

  const packRow = await getPack(input.packCode);
  const pack = mapPack(packRow);
  if (pack.price_pence <= 0 || pack.credits <= 0) {
    throw new AppError(409, 'Credit pack is not sellable', 'CREDIT_PACK_INVALID');
  }

  const customerId = await getOrCreateStripeCustomer(input.organizationId);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('customer', customerId);
  params.set('client_reference_id', input.organizationId);
  params.set('success_url', `${env.APP_URL}/billing?credits=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${env.APP_URL}/billing?credits=cancelled`);
  params.set('billing_address_collection', 'auto');
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');

  if (packRow.stripe_price_id) {
    params.set('line_items[0][price]', String(packRow.stripe_price_id));
  } else {
    params.set('line_items[0][price_data][currency]', 'gbp');
    params.set('line_items[0][price_data][unit_amount]', String(pack.price_pence));
    params.set('line_items[0][price_data][product_data][name]', `${pack.name} Generation Credits`);
    params.set('line_items[0][price_data][product_data][description]', `${pack.credits.toLocaleString('en-GB')} prepaid Generation Credits`);
  }

  const metadata: Record<string, string> = {
    kind: 'generation_credit_purchase',
    organization_id: input.organizationId,
    user_id: input.userId,
    pack_code: pack.code,
    credits: String(pack.credits),
    amount_pence: String(pack.price_pence),
    currency: 'GBP',
  };
  for (const [key, value] of Object.entries(metadata)) {
    params.set(`metadata[${key}]`, value);
    params.set(`payment_intent_data[metadata][${key}]`, value);
  }

  const session = await stripeRequest('POST', '/v1/checkout/sessions', params);
  const sessionId = String(session.id || '');
  const checkoutUrl = String(session.url || '');
  if (!sessionId || !checkoutUrl) {
    throw new AppError(502, 'Stripe returned no credit checkout URL', 'STRIPE_RESPONSE_INVALID');
  }

  await query(
    `INSERT INTO generation_credit_purchases
       (organization_id,purchased_by_user_id,stripe_checkout_session_id,pack_code,
        amount_pence,currency,credits,status,purchase_kind,metadata)
     VALUES ($1,$2,$3,$4,$5,'GBP',$6,'pending','stripe',$7)
     ON CONFLICT (stripe_checkout_session_id) DO NOTHING`,
    [
      input.organizationId,
      input.userId,
      sessionId,
      pack.code,
      pack.price_pence,
      pack.credits,
      JSON.stringify({ checkout_created_at: new Date().toISOString() }),
    ]
  );

  return { checkout_url: checkoutUrl, checkout_session_id: sessionId, pack };
}

async function processPaidCheckout(event: StripeEvent, session: Record<string, unknown>): Promise<void> {
  const metadata = objectValue(session.metadata);
  if (String(metadata.kind || '') !== 'generation_credit_purchase') return;

  const sessionId = String(session.id || '');
  const organizationId = String(metadata.organization_id || session.client_reference_id || '');
  const userId = String(metadata.user_id || '');
  const packCode = String(metadata.pack_code || '');
  const credits = Number(metadata.credits || 0);
  const expectedAmountPence = Number(metadata.amount_pence || 0);
  const currency = String(session.currency || metadata.currency || '').toUpperCase();
  const amountTotal = Number(session.amount_total || 0);
  const paymentStatus = String(session.payment_status || '');

  if (!sessionId || !organizationId || !packCode || !Number.isSafeInteger(credits) || credits <= 0) {
    throw new AppError(400, 'Stripe credit checkout metadata is incomplete', 'STRIPE_METADATA_INVALID');
  }
  if (currency !== 'GBP') {
    throw new AppError(409, `Credit checkout currency must be GBP, received ${currency || 'unknown'}`, 'STRIPE_CURRENCY_MISMATCH');
  }
  if (paymentStatus !== 'paid') {
    throw new AppError(409, 'Stripe credit checkout has not been paid', 'STRIPE_PAYMENT_NOT_PAID');
  }

  const pack = mapPack(await getPack(packCode));
  if (pack.credits !== credits || pack.price_pence !== expectedAmountPence || amountTotal !== pack.price_pence) {
    throw new AppError(409, 'Stripe credit checkout does not match the current GBP pack', 'STRIPE_AMOUNT_MISMATCH');
  }

  await creditPaidStripePurchase({
    organizationId,
    userId: userId || undefined,
    stripeCheckoutSessionId: sessionId,
    stripePaymentIntentId: stringId(session.payment_intent) || undefined,
    packCode,
    amountPence: amountTotal,
    credits,
    idempotencyKey: `stripe-credit-session:${sessionId}`,
    metadata: {
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      livemode: event.livemode === true,
    },
  });
}

export async function processGenerationCreditStripeEvent(event: StripeEvent): Promise<void> {
  const object = event.data.object;
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return;
  await processPaidCheckout(event, object);
}
