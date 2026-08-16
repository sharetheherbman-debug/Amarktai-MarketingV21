import crypto from 'crypto';
import { env } from '../config/env';
import { providerRouter } from '../providers/provider-router';
import type { ChatMessage, ChatResult } from '../types';
import * as credits from './generation-credit.service';
import * as pricing from './genx-pricing.service';
import {
  markExecutionCompleted,
  markExecutionFailed,
  markExecutionRunning,
  requireExecutionApproval,
} from './relaunch-execution-gate.service';

function stableUuid(value: string): string {
  const bytes = Buffer.from(crypto.createHash('sha256').update(value).digest('hex').slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function generateGovernedText(input: {
  organizationId: string;
  userId?: string;
  campaignId?: string | null;
  generationJobId?: string;
  idempotencyKey?: string;
  title: string;
  summary?: string;
  prompt?: string;
  messages?: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  payload?: Record<string, unknown>;
  onAuthorized?: () => Promise<void>;
}): Promise<ChatResult> {
  const messages = input.messages || [{ role: 'user' as const, content: input.prompt || '' }];
  if (!messages.some((message) => message.content.trim())) {
    throw new Error('A governed text prompt is required');
  }
  const requestText = JSON.stringify(messages);
  const requestFingerprint = crypto.createHash('sha256').update(requestText).digest('hex');
  const idempotencyKey = input.idempotencyKey || `text:${requestFingerprint}`;
  const generationJobId = input.generationJobId || stableUuid(
    `${input.organizationId}:${idempotencyKey}:text-generation`
  );
  // A byte-per-token ceiling is deliberately conservative for multilingual
  // prompts. Input and output are quoted separately because the authenticated
  // GenX account rate card exposes separate token metrics.
  const estimatedInputTokens = Math.max(1, Buffer.byteLength(requestText, 'utf8') + 64);
  const inputQuote = await pricing.quoteGeneration({
    modelId: env.DEFAULT_TEXT_MODEL,
    operation: 'text_input',
    quantity: estimatedInputTokens,
    quantityUnit: 'tokens',
  });
  const outputQuote = await pricing.quoteGeneration({
    modelId: env.DEFAULT_TEXT_MODEL,
    operation: 'text_output',
    quantity: input.maxTokens,
    quantityUnit: 'tokens',
  });
  const payload = {
    generation_job_id: generationJobId,
    campaign_id: input.campaignId || null,
    model_id: env.DEFAULT_TEXT_MODEL,
    operation: 'text_generation',
    content_fingerprint: requestFingerprint,
    maximum_output_tokens: input.maxTokens,
    estimated_input_tokens: estimatedInputTokens,
    ...(input.payload || {}),
  };
  const decision = await requireExecutionApproval(input.organizationId, {
    action_type: 'generation',
    channel: 'content',
    title: input.title,
    summary: input.summary,
    requested_credits: inputQuote.reservation_credits + outputQuote.reservation_credits,
    requested_ad_spend_pence: 0,
    idempotency_key: `${idempotencyKey}:decision`,
    requested_by: input.userId ? 'user' : 'system',
    requested_by_user_id: input.userId || null,
    payload,
  });

  await markExecutionRunning(decision.id);
  try {
    // Advance the durable attempt only after Control Centre authorization. This
    // keeps pending approvals stable, while a later reservation/provider failure
    // can be retried with a fresh decision and credit idempotency scope.
    await input.onAuthorized?.();
  } catch (error) {
    await markExecutionFailed(decision.id, error);
    throw error;
  }
  const reservations: Array<{ reservation: credits.CreditReservation; quote: pricing.GenXPriceQuote; suffix: string }> = [];
  try {
    for (const [quote, suffix] of [[inputQuote, 'input'], [outputQuote, 'output']] as const) {
      const reservation = await credits.reserveCredits({
        organizationId: input.organizationId,
        userId: input.userId,
        campaignId: input.campaignId || undefined,
        generationJobId,
        modelId: quote.model_id,
        operation: quote.operation,
        priceSnapshotId: quote.price_snapshot_id,
        estimatedWholesaleCostGbp: quote.wholesale_cost_gbp,
        estimatedRetailChargeGbp: quote.retail_charge_gbp,
        credits: quote.reservation_credits,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        idempotencyKey: `${idempotencyKey}:credits:${suffix}`,
        metadata: payload,
      });
      reservations.push({ reservation, quote, suffix });
    }
  } catch (error) {
    await Promise.all(reservations.map(({ reservation, suffix }) => credits.releaseReservation({
      reservationId: reservation.id,
      reason: 'The complete text-generation credit hold could not be created',
      idempotencyKey: `${idempotencyKey}:reserve-failed:${suffix}`,
    }).catch(() => undefined)));
    await markExecutionFailed(decision.id, error);
    throw error;
  }

  const providerJobId = `genx-text:${generationJobId}`;
  try {
    await Promise.all(reservations.map(({ reservation }) =>
      credits.markReservationSubmitted(reservation.id, providerJobId)
    ));
    const result = await providerRouter.routeRequest(
      messages,
      env.DEFAULT_TEXT_MODEL,
      { max_tokens: input.maxTokens, temperature: input.temperature ?? 0.7 },
      { organizationId: input.organizationId, userId: input.userId }
    );
    const actualTokens = [Math.max(0, result.tokensIn), Math.max(0, result.tokensOut)];
    for (let index = 0; index < reservations.length; index += 1) {
      const { reservation, quote, suffix } = reservations[index];
      const tokenCount = actualTokens[index];
      const actualQuantity = tokenCount > 0
        ? pricing.tokenQuantityForBillingUnit(tokenCount, quote.billable_unit)
        : 0;
      const ratio = quote.quantity > 0 ? actualQuantity / quote.quantity : 0;
      const actualWholesaleCostGbp = quote.wholesale_cost_gbp * ratio;
      const actualRetailChargeGbp = quote.retail_charge_gbp * ratio;
      const actualCredits = actualQuantity > 0
        ? Math.max(1, Math.ceil(actualRetailChargeGbp * env.GENERATION_CREDITS_PER_GBP))
        : 0;
      await credits.settleReservation({
        reservationId: reservation.id,
        actualCredits,
        actualWholesaleCostGbp,
        actualRetailChargeGbp,
        providerJobId,
        idempotencyKey: `${idempotencyKey}:complete:${suffix}`,
        metadata: { tokens_in: result.tokensIn, tokens_out: result.tokensOut },
      });
    }
    await markExecutionCompleted(decision.id);
    return result;
  } catch (error) {
    await Promise.all(reservations.map(({ reservation, suffix }) => credits.releaseReservation({
      reservationId: reservation.id,
      reason: error instanceof Error ? error.message : String(error || 'Text generation failed'),
      idempotencyKey: `${idempotencyKey}:failed:${suffix}`,
    }).catch(() => undefined)));
    await markExecutionFailed(decision.id, error);
    throw error;
  }
}
