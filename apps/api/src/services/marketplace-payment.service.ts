import { query } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { env } from '../config/env';
import * as marketplaceRuntime from './marketplace-runtime.service';
import { StripeEvent, stripeRequest, stringId } from './stripe-client.service';

interface StripeCheckoutSession extends Record<string, unknown> {
  id: string;
  url?: string | null;
  payment_status?: string;
  payment_intent?: unknown;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(
  orgId: string,
  itemId: string,
  userId: string
): Promise<{ purchase_id: string; checkout_session_id: string; checkout_url: string }> {
  const itemResult = await query(
    `SELECT id,name,description,price_cents,currency,status
     FROM marketplace_items
     WHERE id=$1 AND deleted_at IS NULL AND status='published'`,
    [itemId]
  );
  if (itemResult.rows.length === 0) throw new NotFoundError('Published marketplace item');
  const item = itemResult.rows[0];
  const amount = Number(item.price_cents || 0);
  if (amount <= 0) throw new AppError(400, 'Free items do not require checkout', 'CHECKOUT_NOT_REQUIRED');

  const installed = await query(
    'SELECT id FROM marketplace_installations WHERE organization_id=$1 AND item_id=$2',
    [orgId, itemId]
  );
  if (installed.rows.length > 0) throw new AppError(409, 'Item is already installed', 'ALREADY_INSTALLED');

  const paid = await query(
    "SELECT id FROM marketplace_purchases WHERE organization_id=$1 AND item_id=$2 AND status='paid'",
    [orgId, itemId]
  );
  if (paid.rows.length > 0) throw new AppError(409, 'Item has already been purchased', 'ALREADY_PURCHASED');

  const purchase = await query(
    `INSERT INTO marketplace_purchases
       (organization_id,item_id,user_id,amount_cents,currency,status)
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
    params.set('metadata[kind]', 'marketplace_purchase');
    params.set('metadata[purchase_id]', purchaseId);
    params.set('metadata[organization_id]', orgId);
    params.set('metadata[item_id]', itemId);
    params.set('metadata[user_id]', userId);

    const session = await stripeRequest('POST', '/v1/checkout/sessions', params) as StripeCheckoutSession;
    if (!session.id || !session.url) throw new AppError(502, 'Stripe returned no checkout URL', 'STRIPE_RESPONSE_INVALID');

    await query(
      'UPDATE marketplace_purchases SET checkout_session_id=$1,updated_at=NOW() WHERE id=$2',
      [session.id, purchaseId]
    );
    return { purchase_id: purchaseId, checkout_session_id: session.id, checkout_url: session.url };
  } catch (error) {
    await query(
      "UPDATE marketplace_purchases SET status='failed',error_message=$1,updated_at=NOW() WHERE id=$2",
      [error instanceof Error ? error.message : 'Checkout creation failed', purchaseId]
    );
    throw error;
  }
}

async function completePurchase(session: StripeCheckoutSession): Promise<void> {
  const metadata = session.metadata || {};
  if (metadata.kind && metadata.kind !== 'marketplace_purchase') return;
  const purchaseId = metadata.purchase_id;
  const orgId = metadata.organization_id;
  const itemId = metadata.item_id;
  const userId = metadata.user_id;
  if (!purchaseId || !orgId || !itemId || !userId) return;

  const purchaseResult = await query('SELECT * FROM marketplace_purchases WHERE id=$1', [purchaseId]);
  if (purchaseResult.rows.length === 0) throw new NotFoundError('Marketplace purchase');
  const purchase = purchaseResult.rows[0];
  if (
    String(purchase.organization_id) !== orgId ||
    String(purchase.item_id) !== itemId ||
    String(purchase.user_id) !== userId
  ) {
    throw new AppError(400, 'Stripe purchase metadata does not match the local purchase', 'STRIPE_METADATA_INVALID');
  }
  if (session.payment_status !== 'paid') {
    throw new AppError(400, 'Checkout Session is not paid', 'STRIPE_PAYMENT_INCOMPLETE');
  }

  if (purchase.status !== 'paid') {
    await query(
      `UPDATE marketplace_purchases
       SET status='paid',payment_intent_id=$1,checkout_session_id=$2,paid_at=NOW(),error_message=NULL,updated_at=NOW()
       WHERE id=$3`,
      [stringId(session.payment_intent) || null, session.id, purchaseId]
    );
  }

  const installation = await query(
    'SELECT id FROM marketplace_installations WHERE organization_id=$1 AND item_id=$2',
    [orgId, itemId]
  );
  if (installation.rows.length > 0) return;

  try {
    await marketplaceRuntime.installItem(orgId, itemId, userId, {
      purchase_id: purchaseId,
      checkout_session_id: session.id,
    });
    await query('UPDATE marketplace_purchases SET error_message=NULL,updated_at=NOW() WHERE id=$1', [purchaseId]);
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'ALREADY_INSTALLED')) {
      await query(
        'UPDATE marketplace_purchases SET error_message=$1,updated_at=NOW() WHERE id=$2',
        [`Payment succeeded but installation failed: ${error instanceof Error ? error.message : 'unknown error'}`, purchaseId]
      );
      throw error;
    }
  }
}

export async function processMarketplaceStripeEvent(event: StripeEvent): Promise<void> {
  const object = event.data.object as StripeCheckoutSession;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    await completePurchase(object);
    return;
  }
  if (event.type === 'checkout.session.expired') {
    const purchaseId = object.metadata?.purchase_id;
    if (object.metadata?.kind !== 'marketplace_purchase' || !purchaseId) return;
    await query(
      "UPDATE marketplace_purchases SET status='expired',updated_at=NOW() WHERE id=$1 AND checkout_session_id=$2 AND status='pending'",
      [purchaseId, object.id]
    );
  }
}

export async function getPurchaseStatus(orgId: string, sessionId: string): Promise<Record<string, unknown>> {
  const result = await query(
    `SELECT mp.id,mp.status,mp.error_message,mp.paid_at,mp.checkout_session_id,
            mi.id AS item_id,mi.name AS item_name,inst.id AS installation_id
     FROM marketplace_purchases mp
     JOIN marketplace_items mi ON mi.id=mp.item_id
     LEFT JOIN marketplace_installations inst ON inst.organization_id=mp.organization_id AND inst.item_id=mp.item_id
     WHERE mp.organization_id=$1 AND mp.checkout_session_id=$2`,
    [orgId, sessionId]
  );
  if (result.rows.length === 0) throw new NotFoundError('Marketplace purchase');
  return result.rows[0];
}
