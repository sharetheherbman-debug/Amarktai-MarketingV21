import type { CreditReservation } from './generation-credit.service';
import type { GenXPriceQuote } from './genx-pricing.service';
import * as credits from './generation-credit.service';
import * as pricing from './genx-pricing.service';
import { env } from '../config/env';
import {
  markExecutionCompleted,
  markExecutionFailed,
  markExecutionRunning,
  requireExecutionApproval,
} from './relaunch-execution-gate.service';

export interface GovernedGeneration {
  decisionId: string;
  reservation: CreditReservation;
  quote: GenXPriceQuote;
  idempotencyKey: string;
}

export async function beginGovernedGeneration(input: {
  organizationId: string;
  userId?: string | null;
  campaignId?: string | null;
  generationJobId: string;
  modelId: string;
  operation: string;
  quantity?: number;
  quantityUnit?: 'billing_units' | 'tokens';
  idempotencyKey: string;
  title: string;
  summary?: string;
  requestedBy?: 'system' | 'user' | 'application';
  payload?: Record<string, unknown>;
  onAuthorized?: () => Promise<void>;
}): Promise<GovernedGeneration> {
  const quote = await pricing.quoteGeneration({
    modelId: input.modelId,
    operation: input.operation,
    quantity: input.quantity || 1,
    quantityUnit: input.quantityUnit,
  });
  const decision = await requireExecutionApproval(input.organizationId, {
    action_type: 'generation',
    channel: 'content',
    title: input.title,
    summary: input.summary,
    requested_credits: quote.reservation_credits,
    requested_ad_spend_pence: 0,
    idempotency_key: `${input.idempotencyKey}:decision`,
    requested_by: input.requestedBy || 'system',
    requested_by_user_id: input.userId || null,
    payload: {
      generation_job_id: input.generationJobId,
      campaign_id: input.campaignId || null,
      model_id: input.modelId,
      operation: input.operation,
      quantity: quote.quantity,
      ...(input.payload || {}),
    },
  });

  await markExecutionRunning(decision.id);
  try {
    // Do not advance an attempt while it is waiting for owner approval. Once
    // authorized, advance before reserving so a reservation failure is safely
    // retryable under a new idempotency scope.
    await input.onAuthorized?.();
    const reservation = await credits.reserveCredits({
      organizationId: input.organizationId,
      userId: input.userId || undefined,
      campaignId: input.campaignId || undefined,
      generationJobId: input.generationJobId,
      modelId: quote.model_id,
      operation: quote.operation,
      priceSnapshotId: quote.price_snapshot_id,
      estimatedWholesaleCostGbp: quote.wholesale_cost_gbp,
      estimatedRetailChargeGbp: quote.retail_charge_gbp,
      credits: quote.reservation_credits,
      expiresAt: new Date(Date.now() + 30 * 60_000),
      idempotencyKey: `${input.idempotencyKey}:credits`,
      metadata: input.payload,
    });
    return { decisionId: decision.id, reservation, quote, idempotencyKey: input.idempotencyKey };
  } catch (error) {
    await markExecutionFailed(decision.id, error);
    throw error;
  }
}

export async function markGovernedGenerationSubmitted(
  context: GovernedGeneration,
  providerJobId: string
): Promise<void> {
  await credits.markReservationSubmitted(context.reservation.id, providerJobId);
}

export async function completeGovernedGeneration(
  context: GovernedGeneration,
  providerJobId: string,
  metadata?: Record<string, unknown>,
  actualUsage?: { quantity: number; quantityUnit: 'billing_units' | 'tokens' }
): Promise<void> {
  const actualQuantity = actualUsage?.quantityUnit === 'tokens'
    ? pricing.tokenQuantityForBillingUnit(actualUsage.quantity, context.quote.billable_unit)
    : actualUsage?.quantity || context.quote.quantity;
  const ratio = actualQuantity / context.quote.quantity;
  const actualWholesaleCostGbp = context.quote.wholesale_cost_gbp * ratio;
  const actualRetailChargeGbp = context.quote.retail_charge_gbp * ratio;
  const actualCredits = Math.max(
    1,
    Math.ceil(actualRetailChargeGbp * env.GENERATION_CREDITS_PER_GBP)
  );
  await credits.settleReservation({
    reservationId: context.reservation.id,
    actualCredits,
    actualWholesaleCostGbp,
    actualRetailChargeGbp,
    providerJobId,
    idempotencyKey: `${context.idempotencyKey}:complete`,
    metadata,
  });
  await markExecutionCompleted(context.decisionId);
}

export async function failGovernedGeneration(
  context: GovernedGeneration,
  error: unknown
): Promise<void> {
  await credits.releaseReservation({
    reservationId: context.reservation.id,
    reason: error instanceof Error ? error.message : String(error || 'Generation failed'),
    idempotencyKey: `${context.idempotencyKey}:failed`,
  }).catch(() => undefined);
  await markExecutionFailed(context.decisionId, error);
}
