import { transaction } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export type FinancialReversalKind = 'refund' | 'chargeback';

interface PurchaseRow extends Record<string, unknown> {
  id: string;
  organization_id: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  amount_pence: string | number;
  credits: string | number;
  status: string;
  metadata: Record<string, unknown> | string | null;
}

export interface FinancialReversalResult {
  matched: boolean;
  purchase_id?: string;
  organization_id?: string;
  monetary_reversal_pence?: number;
  intended_credit_reversal?: number;
  removed_credits?: number;
  unrecovered_credits?: number;
  status?: string;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AppError(400, `${field} must be a positive integer`, 'CREDIT_REVERSAL_INVALID');
  }
  return value;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function targetCreditsForMoney(amountPence: number, purchaseAmountPence: number, purchaseCredits: number): number {
  if (amountPence >= purchaseAmountPence) return purchaseCredits;
  return Math.floor((amountPence * purchaseCredits) / purchaseAmountPence);
}

async function findPurchase(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  paymentIntentId?: string | null,
  chargeId?: string | null
): Promise<PurchaseRow | null> {
  const paymentIntent = paymentIntentId?.trim() || null;
  const charge = chargeId?.trim() || null;
  if (!paymentIntent && !charge) return null;

  const result = await client.query(
    `SELECT * FROM generation_credit_purchases
     WHERE purchase_kind='stripe'
       AND (($1::text IS NOT NULL AND stripe_payment_intent_id=$1)
         OR ($2::text IS NOT NULL AND stripe_charge_id=$2))
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [paymentIntent, charge]
  );
  return result.rows[0] ? result.rows[0] as PurchaseRow : null;
}

async function netFinancialReversal(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  purchaseId: string
): Promise<{ money: number; credits: number }> {
  const result = await client.query(
    `SELECT
       COALESCE(SUM(CASE WHEN direction='debit' THEN monetary_value_pence ELSE -monetary_value_pence END),0)::bigint AS money,
       COALESCE(SUM(CASE WHEN direction='debit' THEN credits ELSE -credits END),0)::bigint AS credits
     FROM generation_credit_ledger
     WHERE purchase_id=$1 AND entry_type IN ('refund','chargeback')`,
    [purchaseId]
  );
  return {
    money: Math.max(0, Number(result.rows[0]?.money || 0)),
    credits: Math.max(0, Number(result.rows[0]?.credits || 0)),
  };
}

async function refundMoneyAlreadyRecorded(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  purchaseId: string
): Promise<number> {
  const result = await client.query(
    `SELECT COALESCE(SUM(monetary_value_pence),0)::bigint AS money
     FROM generation_credit_ledger
     WHERE purchase_id=$1 AND entry_type='refund' AND direction='debit'`,
    [purchaseId]
  );
  return Number(result.rows[0]?.money || 0);
}

function purchaseStatus(netReversalPence: number, purchaseAmountPence: number): 'paid' | 'partially_refunded' | 'refunded' {
  if (netReversalPence <= 0) return 'paid';
  return netReversalPence >= purchaseAmountPence ? 'refunded' : 'partially_refunded';
}

export async function applyGenerationCreditFinancialReversal(input: {
  kind: FinancialReversalKind;
  amountPence: number;
  amountIsCumulative?: boolean;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  stripeEventId: string;
  stripeEventType: string;
  stripeDisputeId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<FinancialReversalResult> {
  const requestedAmount = positiveInteger(input.amountPence, 'amountPence');
  if (!input.idempotencyKey.trim()) {
    throw new AppError(400, 'idempotencyKey is required', 'CREDIT_REVERSAL_INVALID');
  }

  return transaction(async (client) => {
    const purchase = await findPurchase(client, input.stripePaymentIntentId, input.stripeChargeId);
    if (!purchase) return { matched: false };

    const organizationId = String(purchase.organization_id);
    const purchaseId = String(purchase.id);
    const purchaseAmount = positiveInteger(Number(purchase.amount_pence), 'purchase.amount_pence');
    const purchaseCredits = positiveInteger(Number(purchase.credits), 'purchase.credits');

    const duplicate = await client.query(
      `SELECT 1 FROM generation_credit_ledger
       WHERE organization_id=$1 AND idempotency_key=$2`,
      [organizationId, input.idempotencyKey]
    );
    if (duplicate.rows[0]) {
      return { matched: true, purchase_id: purchaseId, organization_id: organizationId };
    }

    const netBefore = await netFinancialReversal(client, purchaseId);
    const remainingMoney = Math.max(0, purchaseAmount - netBefore.money);
    if (remainingMoney === 0) {
      return {
        matched: true,
        purchase_id: purchaseId,
        organization_id: organizationId,
        monetary_reversal_pence: 0,
        intended_credit_reversal: 0,
        removed_credits: 0,
        unrecovered_credits: 0,
        status: 'refunded',
      };
    }

    let monetaryDelta: number;
    if (input.kind === 'refund' && input.amountIsCumulative) {
      const priorRefundMoney = await refundMoneyAlreadyRecorded(client, purchaseId);
      const requestedCumulativeRefund = Math.min(requestedAmount, purchaseAmount);
      monetaryDelta = Math.max(0, requestedCumulativeRefund - priorRefundMoney);
    } else {
      monetaryDelta = requestedAmount;
    }
    monetaryDelta = Math.min(monetaryDelta, remainingMoney);

    if (monetaryDelta <= 0) {
      return {
        matched: true,
        purchase_id: purchaseId,
        organization_id: organizationId,
        monetary_reversal_pence: 0,
        intended_credit_reversal: 0,
        removed_credits: 0,
        unrecovered_credits: 0,
        status: purchaseStatus(netBefore.money, purchaseAmount),
      };
    }

    const targetBefore = targetCreditsForMoney(netBefore.money, purchaseAmount, purchaseCredits);
    const netMoneyAfter = netBefore.money + monetaryDelta;
    const targetAfter = targetCreditsForMoney(netMoneyAfter, purchaseAmount, purchaseCredits);
    const intendedCreditDelta = Math.max(0, targetAfter - targetBefore);

    const walletResult = await client.query(
      'SELECT * FROM generation_credit_wallets WHERE organization_id=$1 FOR UPDATE',
      [organizationId]
    );
    if (!walletResult.rows[0]) {
      throw new AppError(409, 'Generation Credit wallet is missing for Stripe purchase', 'CREDIT_WALLET_MISSING');
    }
    const wallet = walletResult.rows[0] as Record<string, unknown>;
    const availableBefore = Number(wallet.available_credits || 0);
    const reservedBalance = Number(wallet.reserved_credits || 0);
    const removedCredits = Math.min(availableBefore, intendedCreditDelta);
    const unrecoveredCredits = intendedCreditDelta - removedCredits;
    const availableAfter = availableBefore - removedCredits;

    await client.query(
      `UPDATE generation_credit_wallets SET
         available_credits=$2,
         version=version+1,
         updated_at=NOW()
       WHERE organization_id=$1`,
      [organizationId, availableAfter]
    );

    const status = purchaseStatus(netMoneyAfter, purchaseAmount);
    const existingMetadata = objectValue(purchase.metadata);
    const reversalMetadata = {
      ...existingMetadata,
      financial_reversal_amount_pence: netMoneyAfter,
      financial_reversal_target_credits: targetAfter,
      last_financial_reversal: {
        kind: input.kind,
        stripe_event_id: input.stripeEventId,
        stripe_event_type: input.stripeEventType,
        stripe_dispute_id: input.stripeDisputeId || null,
        amount_pence: monetaryDelta,
        intended_credit_reversal: intendedCreditDelta,
        removed_credits: removedCredits,
        unrecovered_credits: unrecoveredCredits,
        recorded_at: new Date().toISOString(),
      },
    };

    await client.query(
      `UPDATE generation_credit_purchases SET
         stripe_charge_id=COALESCE(stripe_charge_id,$2),
         status=$3,
         refunded_at=CASE WHEN $3='refunded' THEN COALESCE(refunded_at,NOW()) ELSE refunded_at END,
         metadata=$4::jsonb,
         updated_at=NOW()
       WHERE id=$1`,
      [purchaseId, input.stripeChargeId || null, status, JSON.stringify(reversalMetadata)]
    );

    await client.query(
      `INSERT INTO generation_credit_ledger
         (organization_id,purchase_id,entry_type,direction,credits,
          available_balance_after,reserved_balance_after,monetary_value_pence,
          idempotency_key,description,metadata)
       VALUES ($1,$2,$3,'debit',$4,$5,$6,$7,$8,$9,$10)`,
      [
        organizationId,
        purchaseId,
        input.kind,
        removedCredits,
        availableAfter,
        reservedBalance,
        monetaryDelta,
        input.idempotencyKey,
        input.kind === 'refund'
          ? `Stripe refund reversal of ${removedCredits.toLocaleString('en-GB')} available Generation Credits`
          : `Stripe chargeback reversal of ${removedCredits.toLocaleString('en-GB')} available Generation Credits`,
        JSON.stringify({
          stripe_event_id: input.stripeEventId,
          stripe_event_type: input.stripeEventType,
          stripe_dispute_id: input.stripeDisputeId || null,
          intended_credit_reversal: intendedCreditDelta,
          removed_credits: removedCredits,
          unrecovered_credits: unrecoveredCredits,
          purchase_amount_pence: purchaseAmount,
          purchase_credits: purchaseCredits,
          ...(input.metadata || {}),
        }),
      ]
    );

    return {
      matched: true,
      purchase_id: purchaseId,
      organization_id: organizationId,
      monetary_reversal_pence: monetaryDelta,
      intended_credit_reversal: intendedCreditDelta,
      removed_credits: removedCredits,
      unrecovered_credits: unrecoveredCredits,
      status,
    };
  });
}

export async function reinstateGenerationCreditChargeback(input: {
  amountPence: number;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  stripeEventId: string;
  stripeEventType: string;
  stripeDisputeId: string;
  idempotencyKey: string;
}): Promise<FinancialReversalResult> {
  const requestedAmount = positiveInteger(input.amountPence, 'amountPence');

  return transaction(async (client) => {
    const purchase = await findPurchase(client, input.stripePaymentIntentId, input.stripeChargeId);
    if (!purchase) return { matched: false };

    const organizationId = String(purchase.organization_id);
    const purchaseId = String(purchase.id);
    const purchaseAmount = positiveInteger(Number(purchase.amount_pence), 'purchase.amount_pence');

    const duplicate = await client.query(
      `SELECT 1 FROM generation_credit_ledger
       WHERE organization_id=$1 AND idempotency_key=$2`,
      [organizationId, input.idempotencyKey]
    );
    if (duplicate.rows[0]) {
      return { matched: true, purchase_id: purchaseId, organization_id: organizationId };
    }

    const disputeResult = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction='debit' THEN monetary_value_pence ELSE -monetary_value_pence END),0)::bigint AS money,
         COALESCE(SUM(CASE WHEN direction='debit' THEN credits ELSE -credits END),0)::bigint AS credits
       FROM generation_credit_ledger
       WHERE purchase_id=$1
         AND entry_type='chargeback'
         AND metadata->>'stripe_dispute_id'=$2`,
      [purchaseId, input.stripeDisputeId]
    );
    const outstandingMoney = Math.max(0, Number(disputeResult.rows[0]?.money || 0));
    const outstandingCredits = Math.max(0, Number(disputeResult.rows[0]?.credits || 0));
    const monetaryRestore = Math.min(requestedAmount, outstandingMoney);
    if (monetaryRestore <= 0) {
      return { matched: true, purchase_id: purchaseId, organization_id: organizationId };
    }

    const creditsRestore = outstandingMoney > 0
      ? Math.min(outstandingCredits, Math.round((outstandingCredits * monetaryRestore) / outstandingMoney))
      : 0;

    const walletResult = await client.query(
      'SELECT * FROM generation_credit_wallets WHERE organization_id=$1 FOR UPDATE',
      [organizationId]
    );
    if (!walletResult.rows[0]) {
      throw new AppError(409, 'Generation Credit wallet is missing for Stripe purchase', 'CREDIT_WALLET_MISSING');
    }
    const wallet = walletResult.rows[0] as Record<string, unknown>;
    const availableAfter = Number(wallet.available_credits || 0) + creditsRestore;
    const reservedBalance = Number(wallet.reserved_credits || 0);

    await client.query(
      `UPDATE generation_credit_wallets SET
         available_credits=$2,version=version+1,updated_at=NOW()
       WHERE organization_id=$1`,
      [organizationId, availableAfter]
    );

    await client.query(
      `INSERT INTO generation_credit_ledger
         (organization_id,purchase_id,entry_type,direction,credits,
          available_balance_after,reserved_balance_after,monetary_value_pence,
          idempotency_key,description,metadata)
       VALUES ($1,$2,'chargeback','credit',$3,$4,$5,$6,$7,$8,$9)`,
      [
        organizationId,
        purchaseId,
        creditsRestore,
        availableAfter,
        reservedBalance,
        monetaryRestore,
        input.idempotencyKey,
        `Stripe chargeback funds reinstated; restored ${creditsRestore.toLocaleString('en-GB')} Generation Credits`,
        JSON.stringify({
          stripe_event_id: input.stripeEventId,
          stripe_event_type: input.stripeEventType,
          stripe_dispute_id: input.stripeDisputeId,
          restored_credits: creditsRestore,
        }),
      ]
    );

    const netAfter = await netFinancialReversal(client, purchaseId);
    const status = purchaseStatus(netAfter.money, purchaseAmount);
    const existingMetadata = objectValue(purchase.metadata);
    await client.query(
      `UPDATE generation_credit_purchases SET
         stripe_charge_id=COALESCE(stripe_charge_id,$2),
         status=$3,
         refunded_at=CASE WHEN $3='refunded' THEN refunded_at ELSE NULL END,
         metadata=$4::jsonb,
         updated_at=NOW()
       WHERE id=$1`,
      [
        purchaseId,
        input.stripeChargeId || null,
        status,
        JSON.stringify({
          ...existingMetadata,
          financial_reversal_amount_pence: netAfter.money,
          last_financial_reinstatement: {
            stripe_event_id: input.stripeEventId,
            stripe_event_type: input.stripeEventType,
            stripe_dispute_id: input.stripeDisputeId,
            amount_pence: monetaryRestore,
            restored_credits: creditsRestore,
            recorded_at: new Date().toISOString(),
          },
        }),
      ]
    );

    return {
      matched: true,
      purchase_id: purchaseId,
      organization_id: organizationId,
      monetary_reversal_pence: monetaryRestore,
      removed_credits: -creditsRestore,
      unrecovered_credits: 0,
      status,
    };
  });
}
