import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

// Stripe configuration
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Types
export interface StripeCustomer {
  id: string;
  email: string;
  name: string;
  metadata: Record<string, string>;
}

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: Array<{
    price: string;
    quantity: number;
  }>;
}

export interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string | null;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export interface StripePaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
}

// ─── Customer Management ─────────────────────────────────────────────────────

export async function createCustomer(email: string, name: string, metadata: Record<string, string> = {}): Promise<StripeCustomer> {
  if (!STRIPE_SECRET_KEY) {
    logger.warn('Stripe not configured, returning mock customer');
    return {
      id: `cus_mock_${Date.now()}`,
      email,
      name,
      metadata,
    };
  }

  try {
    const response = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email,
        name,
        ...Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, v])),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AppError(400, `Stripe customer creation failed: ${error}`, 'STRIPE_ERROR');
    }

    return (await response.json()) as StripeCustomer;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Stripe customer creation error:', error);
    throw new AppError(500, 'Failed to create Stripe customer', 'STRIPE_ERROR');
  }
}

export async function getCustomer(customerId: string): Promise<StripeCustomer> {
  if (!STRIPE_SECRET_KEY) {
    return { id: customerId, email: '', name: '', metadata: {} };
  }

  const response = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });

  if (!response.ok) throw new AppError(404, 'Customer not found', 'STRIPE_ERROR');
  return (await response.json()) as StripeCustomer;
}

export async function updateCustomer(customerId: string, data: { email?: string; name?: string; metadata?: Record<string, string> }): Promise<StripeCustomer> {
  if (!STRIPE_SECRET_KEY) {
    return { id: customerId, email: data.email || '', name: data.name || '', metadata: data.metadata || {} };
  }

  const params = new URLSearchParams();
  if (data.email) params.append('email', data.email);
  if (data.name) params.append('name', data.name);
  if (data.metadata) {
    Object.entries(data.metadata).forEach(([k, v]) => params.append(`metadata[${k}]`, v));
  }

  const response = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) throw new AppError(400, 'Failed to update customer', 'STRIPE_ERROR');
  return (await response.json()) as any;
}

// ─── Subscription Management ─────────────────────────────────────────────────

export async function createSubscription(customerId: string, priceId: string, trialDays?: number): Promise<StripeSubscription> {
  if (!STRIPE_SECRET_KEY) {
    logger.warn('Stripe not configured, returning mock subscription');
    return {
      id: `sub_mock_${Date.now()}`,
      customer: customerId,
      status: trialDays ? 'trialing' : 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      cancel_at_period_end: false,
      items: [{ price: priceId, quantity: 1 }],
    };
  }

  const params = new URLSearchParams({
    customer: customerId,
    'items[0][price]': priceId,
  });

  if (trialDays) {
    params.append('trial_period_days', trialDays.toString());
  }

  const response = await fetch('https://api.stripe.com/v1/subscriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new AppError(400, `Subscription creation failed: ${error}`, 'STRIPE_ERROR');
  }

  return (await response.json()) as any;
}

export async function cancelSubscription(subscriptionId: string, immediately: boolean = false): Promise<StripeSubscription> {
  if (!STRIPE_SECRET_KEY) {
    return {
      id: subscriptionId,
      customer: '',
      status: immediately ? 'canceled' : 'active',
      current_period_start: 0,
      current_period_end: 0,
      cancel_at_period_end: !immediately,
      items: [],
    };
  }

  const url = immediately
    ? `https://api.stripe.com/v1/subscriptions/${subscriptionId}`
    : `https://api.stripe.com/v1/subscriptions/${subscriptionId}`;

  const params = new URLSearchParams();
  if (!immediately) {
    params.append('cancel_at_period_end', 'true');
  }

  const response = await fetch(url, {
    method: immediately ? 'DELETE' : 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: immediately ? undefined : params,
  });

  if (!response.ok) throw new AppError(400, 'Failed to cancel subscription', 'STRIPE_ERROR');
  return (await response.json()) as any;
}

export async function updateSubscription(subscriptionId: string, newPriceId: string): Promise<StripeSubscription> {
  if (!STRIPE_SECRET_KEY) {
    return {
      id: subscriptionId,
      customer: '',
      status: 'active',
      current_period_start: 0,
      current_period_end: 0,
      cancel_at_period_end: false,
      items: [{ price: newPriceId, quantity: 1 }],
    };
  }

  // Get current subscription to get item ID
  const subResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });

  if (!subResponse.ok) throw new AppError(404, 'Subscription not found', 'STRIPE_ERROR');
  const sub = (await subResponse.json()) as { items: { data: Array<{ id: string }> } };
  const itemId = sub.items.data[0]?.id;

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'items[0][id]': itemId,
      'items[0][price]': newPriceId,
      proration_behavior: 'always_invoice',
    }),
  });

  if (!response.ok) throw new AppError(400, 'Failed to update subscription', 'STRIPE_ERROR');
  return (await response.json()) as any;
}

export async function getSubscription(subscriptionId: string): Promise<StripeSubscription> {
  if (!STRIPE_SECRET_KEY) {
    return {
      id: subscriptionId,
      customer: '',
      status: 'active',
      current_period_start: 0,
      current_period_end: 0,
      cancel_at_period_end: false,
      items: [],
    };
  }

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });

  if (!response.ok) throw new AppError(404, 'Subscription not found', 'STRIPE_ERROR');
  return (await response.json()) as any;
}

// ─── Payment Methods ─────────────────────────────────────────────────────────

export async function attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<StripePaymentMethod> {
  if (!STRIPE_SECRET_KEY) {
    return {
      id: paymentMethodId,
      type: 'card',
      card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2025 },
    };
  }

  const response = await fetch(`https://api.stripe.com/v1/payment_methods/${paymentMethodId}/attach`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ customer: customerId }),
  });

  if (!response.ok) throw new AppError(400, 'Failed to attach payment method', 'STRIPE_ERROR');
  return (await response.json()) as any;
}

export async function detachPaymentMethod(paymentMethodId: string): Promise<StripePaymentMethod> {
  if (!STRIPE_SECRET_KEY) {
    return { id: paymentMethodId, type: 'card' };
  }

  const response = await fetch(`https://api.stripe.com/v1/payment_methods/${paymentMethodId}/detach`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });

  if (!response.ok) throw new AppError(400, 'Failed to detach payment method', 'STRIPE_ERROR');
  return (await response.json()) as any;
}

export async function listPaymentMethods(customerId: string): Promise<StripePaymentMethod[]> {
  if (!STRIPE_SECRET_KEY) {
    return [];
  }

  const response = await fetch(`https://api.stripe.com/v1/payment_methods?customer=${customerId}&type=card`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });

  if (!response.ok) throw new AppError(400, 'Failed to list payment methods', 'STRIPE_ERROR');
  const data = (await response.json()) as { data: StripePaymentMethod[] };
  return data.data || [];
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export async function listInvoices(customerId: string, limit: number = 10): Promise<StripeInvoice[]> {
  if (!STRIPE_SECRET_KEY) {
    return [];
  }

  const response = await fetch(`https://api.stripe.com/v1/invoices?customer=${customerId}&limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });

  if (!response.ok) throw new AppError(400, 'Failed to list invoices', 'STRIPE_ERROR');
  const data = (await response.json()) as { data: StripeInvoice[] };
  return data.data || [];
}

export async function getInvoice(invoiceId: string): Promise<StripeInvoice> {
  if (!STRIPE_SECRET_KEY) {
    return {
      id: invoiceId,
      customer: '',
      subscription: null,
      status: 'paid',
      amount_due: 0,
      amount_paid: 0,
      currency: 'usd',
      hosted_invoice_url: null,
      invoice_pdf: null,
    };
  }

  const response = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
  });

  if (!response.ok) throw new AppError(404, 'Invoice not found', 'STRIPE_ERROR');
  return (await response.json()) as any;
}

// ─── Webhook Processing ──────────────────────────────────────────────────────

export function verifyWebhookSignature(payload: string, signature: string): Record<string, unknown> | null {
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.warn('Stripe webhook secret not configured');
    return null;
  }

  // In production, use Stripe's webhook signature verification
  // For now, return parsed payload
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function handleWebhookEvent(event: Record<string, unknown>): Promise<void> {
  const type = event.type as string;
  const data = event.data as Record<string, unknown>;
  const object = data?.object as Record<string, unknown>;

  logger.info(`Processing Stripe webhook: ${type}`);

  switch (type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      // Update subscription in database
      logger.info(`Subscription ${type}: ${object?.id}`);
      break;

    case 'customer.subscription.deleted':
      logger.info(`Subscription canceled: ${object?.id}`);
      break;

    case 'invoice.payment_succeeded':
      logger.info(`Invoice paid: ${object?.id}`);
      break;

    case 'invoice.payment_failed':
      logger.warn(`Invoice payment failed: ${object?.id}`);
      break;

    case 'payment_method.attached':
      logger.info(`Payment method attached: ${object?.id}`);
      break;

    default:
      logger.info(`Unhandled webhook event: ${type}`);
  }
}

// ─── Customer Portal ─────────────────────────────────────────────────────────

export async function createCustomerPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
  if (!STRIPE_SECRET_KEY) {
    return { url: `https://billing.stripe.com/session/mock_${Date.now()}` };
  }

  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer: customerId,
      return_url: returnUrl,
    }),
  });

  if (!response.ok) throw new AppError(400, 'Failed to create portal session', 'STRIPE_ERROR');
  return (await response.json()) as any;
}
