import crypto from 'crypto';
import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { env } from '../config/env';
import * as marketplaceRuntime from './marketplace-runtime.service';

interface StripeCheckoutSession {
  id: string;
  url?: string | null;
  payment_status?: string;
  payment_intent?: string | null;
  metadata?: Record<string, string>;
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: StripeCheckoutSession };
}

function requireStripeSecret(): string {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, 'Paid marketplace checkout is not configured', 'STRIPE_NOT_CONFIGURED');
  }
  return env.STRIPE_SECRET_KEY;
}

function requireWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, 'Stripe webhook verification is not configured', 'STRIPE_WEBHOOK_NOT_CONFIGURED');
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

async function stripeRequest(path: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireStripeSecret()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { data = { text }; }
  if (!response.ok) {
    const error = data.error && typeof data.error === 'object' ? data.error as Record<string, unknown> : {};
    throw new AppError(response.status, `Stripe Checkout failed: ${String(error.message || text || response.statusText)}`, 'STRIPE_CHECKOUT_FAILED');
  }
  return data;
}

export async function createCheckoutSession(
  orgId: string,
  itemId: string,
  userId: string
): Promise<{ purchase_id: string; checkout_session_id: string; checkout_url: string }> {
  const itemResult = await query(
    `SELECT id, name, description, price_cents, currency, status
     FROM marketplace_items
     WHERE id = $1 AND deleted_at IS NULL AND status = 'published'`,
    [itemId]
  );
  if (itemResult.rows.length === 0) throw new NotFoundError('Published marketplace item');
  const item = itemResult.rows[0];
  const amount = Number(item.price_cents || 0);
  if (amount <= 0) throw new AppError(400, 'Free items do not require checkout', 'CHECKOUT_NOT_REQUIRED');

  const installed = await query(
    'SELECT id FROM marketplace_installations WHERE organization_id = $1 AND item_id = $2',
    [orgId, itemId]
  );
  if (installed.rows.length > 0) throw new AppError(409, 'Item is already installed', 'ALREADY_INSTALLED');

  const paid = await query(
    "SELECT id FROM marketplace_purchases WHERE organization_id = $1 AND item_id = $2 AND status = 'paid'",
    [orgId, itemId]
  );
  if (paid.rows.length > 0) throw new AppError(409, 'Item has already been purchased', 'ALREADY_PURCHASED');

  const purchase = await query(
    `INSERT INTO marketplace_purchases
       (organization_id, item_id, user_id, amount_cents, currency, status)
     VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
    [orgId, itemId, userId, amount, String(item.currency || 'USD').toUpperCase()]
  );
  const purchaseId = String(purchase.rows[0].id);

  try {
    const params = new URLSearchParams();
    params.set('mode', 'payment');
    params.set('success_url', `${env.APP_URL}/marketplace?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${env.APP_URL}/marketplace?checkout=cancelled`);
    params.set('client_reference_id', purchaseId);
    params.set('line_items[0][quantity]', '1');
    params.set('line_items[0][price_data][currency]', String(item.currency || 'USD').toLowerCase());
    params.set('line_items[0][price_data][unit_amount]', String(amount));
    params.set('line_items[0][price_data][product_data][name]', String(item.name));
    if (item.description) params.set('line_items[0][price_data][product_data][description]', String(item.description).slice(0, 500));
    params.set('metadata[purchase_id]', purchaseId);
    params.set('metadata[organization_id]', orgId);
    params.set('metadata[item_id]', itemId);
    params.set('metadata[user_id]', userId);

    const session = await stripeRequest('/v1/checkout/sessions', params) as unknown as StripeCheckoutSession;
    if (!session.id || !session.url) throw new AppError(502, 'Stripe returned no checkout URL', 'STRIPE_RESPONSE_INVALID');

    await query(
      'UPDATE marketplace_purchases SET checkout_session_id = $1, updated_at = NOW() WHERE id = $2',
      [session.id, purchaseId]
    );
    return { purchase_id: purchaseId, checkout_session_id: session.id, checkout_url: session.url };
  } catch (error) {
    await query(
      "UPDATE marketplace_purchases SET status = 'failed', error_message = $1, updated_at = NOW() WHERE id = $2",
      [error instanceof Error ? error.message : 'Checkout creation failed', purchaseId]
    );
    throw error;
  }
}

function parseStripeSignature(header: string): { timestamp: string; signatures: string[] } {
  const values = header.split(',').map((part) => part.trim());
  const timestamp = values.find((part) => part.startsWith('t='))?.slice(2) || '';
  const signatures = values.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) throw new AppError(400, 'Invalid Stripe-Signature header', 'STRIPE_SIGNATURE_INVALID');
  return { timestamp, signatures };
}

export function verifyStripeEvent(rawBody: Buffer, signatureHeader: string): StripeEvent {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    throw new AppError(400, 'Stripe webhook timestamp is outside the five-minute tolerance', 'STRIPE_SIGNATURE_EXPIRED');
  }
  const expected = crypto
    .createHmac('sha256', requireWebhookSecret())
    .update(`${timestamp}.${rawBody.toString('utf8')}`, 'utf8')
    .digest('hex');
  const valid = signatures.some((signature) => {
    const left = Buffer.from(signature, 'hex');
    const right = Buffer.from(expected, 'hex');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  });
  if (!valid) throw new AppError(400, 'Stripe webhook signature verification failed', 'STRIPE_SIGNATURE_INVALID');
  return JSON.parse(rawBody.toString('utf8')) as StripeEvent;
}

async function completePurchase(session: StripeCheckoutSession): Promise<void> {
  const purchaseId = session.metadata?.purchase_id;
  const orgId = session.metadata?.organization_id;
  const itemId = session.metadata?.item_id;
  const userId = session.metadata?.user_id;
  if (!purchaseId || !orgId || !itemId || !userId) {
    throw new AppError(400, 'Stripe session metadata is incomplete', 'STRIPE_METADATA_INVALID');
  }

  const purchase = await query('SELECT * FROM marketplace_purchases WHERE id = $1', [purchaseId]);
  if (purchase.rows.length === 0) throw new NotFoundError('Marketplace purchase');
  if (purchase.rows[0].status === 'paid') return;
  if (session.payment_status !== 'paid') throw new AppError(400, 'Checkout Session is not paid', 'STRIPE_PAYMENT_INCOMPLETE');

  await query(
    `UPDATE marketplace_purchases
     SET status = 'paid', payment_intent_id = $1, checkout_session_id = $2, paid_at = NOW(), error_message = NULL, updated_at = NOW()
     WHERE id = $3`,
    [session.payment_intent || null, session.id, purchaseId]
  );

  try {
    await marketplaceRuntime.installItem(orgId, itemId, userId, { purchase_id: purchaseId, checkout_session_id: session.id });
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'ALREADY_INSTALLED')) {
      await query(
        'UPDATE marketplace_purchases SET error_message = $1, updated_at = NOW() WHERE id = $2',
        [`Payment succeeded but installation failed: ${error instanceof Error ? error.message : 'unknown error'}`, purchaseId]
      );
      throw error;
    }
  }
}

export async function processStripeEvent(event: StripeEvent): Promise<void> {
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    await completePurchase(event.data.object);
    return;
  }
  if (event.type === 'checkout.session.expired') {
    await query(
      "UPDATE marketplace_purchases SET status = 'expired', updated_at = NOW() WHERE checkout_session_id = $1 AND status = 'pending'",
      [event.data.object.id]
    );
  }
}

export async function getPurchaseStatus(orgId: string, sessionId: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT mp.id, mp.status, mp.error_message, mp.paid_at, mp.checkout_session_id,
            mi.id AS item_id, mi.name AS item_name,
            inst.id AS installation_id
     FROM marketplace_purchases mp
     JOIN marketplace_items mi ON mi.id = mp.item_id
     LEFT JOIN marketplace_installations inst ON inst.organization_id = mp.organization_id AND inst.item_id = mp.item_id
     WHERE mp.organization_id = $1 AND mp.checkout_session_id = $2`,
    [orgId, sessionId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Marketplace purchase');
  return result.rows[0];
}
