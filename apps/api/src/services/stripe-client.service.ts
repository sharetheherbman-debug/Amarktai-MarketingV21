import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';

export interface StripeEvent {
  id: string;
  type: string;
  created?: number;
  livemode?: boolean;
  data: { object: Record<string, unknown> };
}

export function requireStripeSecret(): string {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(503, 'Stripe is not configured', 'STRIPE_NOT_CONFIGURED');
  }
  return env.STRIPE_SECRET_KEY;
}

function requireWebhookSecret(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(503, 'Stripe webhook verification is not configured', 'STRIPE_WEBHOOK_NOT_CONFIGURED');
  }
  return env.STRIPE_WEBHOOK_SECRET;
}

function errorMessage(data: Record<string, unknown>, fallback: string): string {
  const error = data.error && typeof data.error === 'object' ? data.error as Record<string, unknown> : {};
  return String(error.message || error.code || fallback);
}

export async function stripeRequest(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params?: URLSearchParams
): Promise<Record<string, unknown>> {
  const query = method === 'GET' && params && [...params.keys()].length > 0 ? `?${params.toString()}` : '';
  const response = await fetch(`https://api.stripe.com${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireStripeSecret()}`,
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }),
    },
    body: method === 'GET' ? undefined : params,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; }
  catch { data = { raw: text }; }
  if (!response.ok) {
    throw new AppError(
      response.status,
      `Stripe request failed: ${errorMessage(data, text || response.statusText)}`,
      'STRIPE_REQUEST_FAILED'
    );
  }
  return data;
}

function parseSignature(header: string): { timestamp: string; signatures: string[] } {
  const values = header.split(',').map((part) => part.trim());
  const timestamp = values.find((part) => part.startsWith('t='))?.slice(2) || '';
  const signatures = values.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) {
    throw new AppError(400, 'Invalid Stripe-Signature header', 'STRIPE_SIGNATURE_INVALID');
  }
  return { timestamp, signatures };
}

export function verifyStripeWebhook(rawBody: Buffer, signatureHeader: string): StripeEvent {
  const { timestamp, signatures } = parseSignature(signatureHeader);
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    throw new AppError(400, 'Stripe webhook timestamp is outside the five-minute tolerance', 'STRIPE_SIGNATURE_EXPIRED');
  }
  const expected = crypto
    .createHmac('sha256', requireWebhookSecret())
    .update(`${timestamp}.${rawBody.toString('utf8')}`, 'utf8')
    .digest('hex');
  const valid = signatures.some((signature) => {
    if (!/^[a-fA-F0-9]+$/.test(signature) || signature.length !== expected.length) return false;
    const left = Buffer.from(signature, 'hex');
    const right = Buffer.from(expected, 'hex');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  });
  if (!valid) throw new AppError(400, 'Stripe webhook signature verification failed', 'STRIPE_SIGNATURE_INVALID');

  let event: StripeEvent;
  try { event = JSON.parse(rawBody.toString('utf8')) as StripeEvent; }
  catch { throw new AppError(400, 'Stripe webhook body is not valid JSON', 'STRIPE_PAYLOAD_INVALID'); }
  if (!event.id || !event.type || !event.data?.object) {
    throw new AppError(400, 'Stripe webhook event is incomplete', 'STRIPE_PAYLOAD_INVALID');
  }
  return event;
}

export function stringId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) return String((value as Record<string, unknown>).id || '');
  return '';
}

export function unixDate(value: unknown): Date | null {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? new Date(number * 1000) : null;
}
