import { transaction } from '../config/database';
import { AppError, NotFoundError } from '../middleware/errorHandler';

export type WalletType = 'customer' | 'internal';
export type AdminGrantMode = 'free' | 'at_cost' | 'internal_funding' | 'promotion';

export interface CreditWallet {
  organization_id: string;
  wallet_type: WalletType;
  currency: 'GBP';
  available_credits: number;
  reserved_credits: number;
  lifetime_purchased_credits: number;
  lifetime_granted_credits: number;
  lifetime_spent_credits: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreditReservation {
  id: string;
  organization_id: string;
  requested_by_user_id: string | null;
  campaign_id: string | null;
  generation_job_id: string | null;
  provider_job_id: string | null;
  model_id: string;
  operation: string;
  price_snapshot_id: string | null;
  estimated_wholesale_cost_gbp: number;
  estimated_retail_charge_gbp: number;
  reserved_credits: number;
  settled_credits: number;
  released_credits: number;
  status: string;
  idempotency_key: string;
  expires_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface WalletRow extends Record<string, unknown> {
  organization_id: string;
  wallet_type: WalletType;
  currency: 'GBP';
  available_credits: string | number;
  reserved_credits: string | number;
  lifetime_purchased_credits: string | number;
  lifetime_granted_credits: string | number;
  lifetime_spent_credits: string | number;
  version: string | number;
  created_at: string;
  updated_at: string;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AppError(400, `${field} must be a positive integer`, 'CREDITS_INVALID');
  }
  return value;
}

function nonNegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new AppError(400, `${field} must be a non-negative integer`, 'CREDITS_INVALID');
  }
  return value;
}

function mapWallet(row: WalletRow): CreditWallet {
  return {
    organization_id: String(row.organization_id),
    wallet_type: row.wallet_type,
    currency: 'GBP',
    available_credits: Number(row.available_credits || 0),
    reserved_credits: Number(row.reserved_credits || 0),
    lifetime_purchased_credits: Number(row.lifetime_purchased_credits || 0),
    lifetime_granted_credits: Number(row.lifetime_granted_credits || 0),
    lifetime_spent_credits: Number(row.lifetime_spent_credits || 0),
    version: Number(row.version || 0),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapReservation(row: Record<string, unknown>): CreditReservation {
  const metadata = typeof row.metadata === 'string'
    ? JSON.parse(row.metadata)
    : (row.metadata as Record<string, unknown>) || {};

  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    requested_by_user_id: row.requested_by_user_id ? String(row.requested_by_user_id) : null,
    campaign_id: row.campaign_id ? String(row.campaign_id) : null,
    generation_job_id: row.generation_job_id ? String(row.generation_job_id) : null,
    provider_job_id: row.provider_job_id ? String(row.provider_job_id) : null,
    model_id: String(row.model_id),
    operation: String(row.operation),
    price_snapshot_id: row.price_snapshot_id ? String(row.price_snapshot_id) : null,
    estimated_wholesale_cost_gbp: Number(row.estimated_wholesale_cost_gbp || 0),
    estimated_retail_charge_gbp: Number(row.estimated_retail_charge_gbp || 0),
    reserved_credits: Number(row.reserved_credits || 0),
    settled_credits: Number(row.settled_credits || 0),
    released_credits: Number(row.released_credits || 0),
    status: String(row.status),
    idempotency_key: String(row.idempotency_key),
    expires_at: String(row.expires_at),
    metadata,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function ensureWalletWithClient(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  organizationId: string,
  walletType: WalletType = 'customer'
): Promise<void> {
  await client.query(
    `INSERT INTO generation_credit_wallets (organization_id,wallet_type,currency)
     VALUES ($1,$2,'GBP')
     ON CONFLICT (organization_id) DO NOTHING`,
    [organizationId, walletType]
  );
}

async function lockWallet(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  organizationId: string,
  walletType: WalletType = 'customer'
): Promise<WalletRow> {
  await ensureWalletWithClient(client, organizationId, walletType);
  const result = await client.query(
    'SELECT * FROM generation_credit_wallets WHERE organization_id=$1 FOR UPDATE',
    [organizationId]
  );
  if (!result.rows[0]) throw new NotFoundError('Generation Credit wallet');
  return result.rows[0] as WalletRow;
}

export async function getWallet(
  organizationId: string,
  walletType: WalletType = 'customer'
): Promise<CreditWallet> {
  return transaction(async (client) => {
    const row = await lockWallet(client, organizationId, walletType);
    return mapWallet(row);
  });
}

export async function grantCredits(input: {
  organizationId: string;
  credits: number;
  mode: AdminGrantMode;
  adminUserId?: string;
  wholesaleCostBasisPence?: number;
  description?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<CreditWallet> {
  const credits = positiveInteger(input.credits, 'credits');
  const costBasisPence = input.wholesaleCostBasisPence === undefined
    ? 0
    : nonNegativeInteger(input.wholesaleCostBasisPence, 'wholesaleCostBasisPence');

  if (input.mode === 'at_cost' && costBasisPence <= 0) {
    throw new AppError(
      400,
      'At-cost grants require a positive wholesale cost basis in pence',
      'COST_BASIS_REQUIRED'
    );
  }

  return transaction(async (client) => {
    const duplicate = await client.query(
      `SELECT available_balance_after,reserved_balance_after
       FROM generation_credit_ledger
       WHERE organization_id=$1 AND idempotency_key=$2`,
      [input.organizationId, input.idempotencyKey]
    );

    if (duplicate.rows[0]) {
      const existing = await client.query(
        'SELECT * FROM generation_credit_wallets WHERE organization_id=$1',
        [input.organizationId]
      );
      if (!existing.rows[0]) throw new NotFoundError('Generation Credit wallet');
      return mapWallet(existing.rows[0] as WalletRow);
    }

    const walletType: WalletType = input.mode === 'internal_funding' ? 'internal' : 'customer';
    const wallet = await lockWallet(client, input.organizationId, walletType);
    const availableAfter = Number(wallet.available_credits) + credits;
    const grantedIncrement = input.mode === 'internal_funding' ? 0 : credits;

    const updated = await client.query(
      `UPDATE generation_credit_wallets SET
         available_credits=$2,
         lifetime_granted_credits=lifetime_granted_credits+$3,
         version=version+1,
         updated_at=NOW()
       WHERE organization_id=$1
       RETURNING *`,
      [input.organizationId, availableAfter, grantedIncrement]
    );

    const purchaseKind = input.mode === 'free'
      ? 'admin_free'
      : input.mode === 'at_cost'
        ? 'admin_at_cost'
        : input.mode;

    const purchase = await client.query(
      `INSERT INTO generation_credit_purchases
         (organization_id,purchased_by_user_id,amount_pence,currency,credits,status,
          purchase_kind,wholesale_cost_basis_pence,metadata,paid_at)
       VALUES ($1,$2,$3,'GBP',$4,'paid',$5,$6,$7,NOW())
       RETURNING id`,
      [
        input.organizationId,
        input.adminUserId || null,
        input.mode === 'at_cost' ? costBasisPence : 0,
        credits,
        purchaseKind,
        input.mode === 'at_cost' ? costBasisPence : null,
        JSON.stringify(input.metadata || {}),
      ]
    );

    const entryType = input.mode === 'free'
      ? 'admin_free_grant'
      : input.mode === 'at_cost'
        ? 'admin_at_cost_grant'
        : input.mode;

    await client.query(
      `INSERT INTO generation_credit_ledger
         (organization_id,purchase_id,created_by_user_id,entry_type,direction,credits,
          available_balance_after,reserved_balance_after,monetary_value_pence,
          idempotency_key,description,metadata)
       VALUES ($1,$2,$3,$4,'credit',$5,$6,$7,$8,$9,$10,$11)`,
      [
        input.organizationId,
        purchase.rows[0].id,
        input.adminUserId || null,
        entryType,
        credits,
        availableAfter,
        Number(wallet.reserved_credits),
        input.mode === 'at_cost' ? costBasisPence : 0,
        input.idempotencyKey,
        input.description || `Admin ${input.mode.replace(/_/g, ' ')} credit grant`,
        JSON.stringify(input.metadata || {}),
      ]
    );

    return mapWallet(updated.rows[0] as WalletRow);
  });
}

export async function creditPaidStripePurchase(input: {
  organizationId: string;
  userId?: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  packCode?: string;
  amountPence: number;
  credits: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<CreditWallet> {
  const amountPence = positiveInteger(input.amountPence, 'amountPence');
  const credits = positiveInteger(input.credits, 'credits');

  return transaction(async (client) => {
    const duplicate = await client.query(
      `SELECT 1 FROM generation_credit_ledger
       WHERE organization_id=$1 AND idempotency_key=$2`,
      [input.organizationId, input.idempotencyKey]
    );

    if (duplicate.rows[0]) {
      const existing = await client.query(
        'SELECT * FROM generation_credit_wallets WHERE organization_id=$1',
        [input.organizationId]
      );
      if (!existing.rows[0]) throw new NotFoundError('Generation Credit wallet');
      return mapWallet(existing.rows[0] as WalletRow);
    }

    const wallet = await lockWallet(client, input.organizationId, 'customer');
    const availableAfter = Number(wallet.available_credits) + credits;

    const purchase = await client.query(
      `INSERT INTO generation_credit_purchases
         (organization_id,purchased_by_user_id,stripe_checkout_session_id,
          stripe_payment_intent_id,stripe_charge_id,pack_code,amount_pence,currency,
          credits,status,purchase_kind,metadata,paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'GBP',$8,'paid','stripe',$9,NOW())
       ON CONFLICT (stripe_checkout_session_id) DO UPDATE SET
         stripe_payment_intent_id=COALESCE(EXCLUDED.stripe_payment_intent_id,generation_credit_purchases.stripe_payment_intent_id),
         stripe_charge_id=COALESCE(EXCLUDED.stripe_charge_id,generation_credit_purchases.stripe_charge_id),
         status='paid',paid_at=COALESCE(generation_credit_purchases.paid_at,NOW()),updated_at=NOW()
       RETURNING id`,
      [
        input.organizationId,
        input.userId || null,
        input.stripeCheckoutSessionId,
        input.stripePaymentIntentId || null,
        input.stripeChargeId || null,
        input.packCode || null,
        amountPence,
        credits,
        JSON.stringify(input.metadata || {}),
      ]
    );

    const updated = await client.query(
      `UPDATE generation_credit_wallets SET
         available_credits=$2,
         lifetime_purchased_credits=lifetime_purchased_credits+$3,
         version=version+1,
         updated_at=NOW()
       WHERE organization_id=$1
       RETURNING *`,
      [input.organizationId, availableAfter, credits]
    );

    await client.query(
      `INSERT INTO generation_credit_ledger
         (organization_id,purchase_id,created_by_user_id,entry_type,direction,credits,
          available_balance_after,reserved_balance_after,monetary_value_pence,
          idempotency_key,description,metadata)
       VALUES ($1,$2,$3,'purchase','credit',$4,$5,$6,$7,$8,$9,$10)`,
      [
        input.organizationId,
        purchase.rows[0].id,
        input.userId || null,
        credits,
        availableAfter,
        Number(wallet.reserved_credits),
        amountPence,
        input.idempotencyKey,
        `Stripe purchase of ${credits.toLocaleString('en-GB')} Generation Credits`,
        JSON.stringify(input.metadata || {}),
      ]
    );

    return mapWallet(updated.rows[0] as WalletRow);
  });
}

export async function reserveCredits(input: {
  organizationId: string;
  userId?: string;
  campaignId?: string;
  generationJobId?: string;
  modelId: string;
  operation: string;
  priceSnapshotId?: string;
  estimatedWholesaleCostGbp: number;
  estimatedRetailChargeGbp: number;
  credits: number;
  expiresAt: Date;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<CreditReservation> {
  const credits = positiveInteger(input.credits, 'credits');
  if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime())) {
    throw new AppError(400, 'expiresAt must be a valid date', 'RESERVATION_EXPIRY_INVALID');
  }

  return transaction(async (client) => {
    const existing = await client.query(
      `SELECT * FROM generation_credit_reservations
       WHERE organization_id=$1 AND idempotency_key=$2`,
      [input.organizationId, input.idempotencyKey]
    );
    if (existing.rows[0]) return mapReservation(existing.rows[0]);

    const wallet = await lockWallet(client, input.organizationId, 'customer');
    const available = Number(wallet.available_credits);
    const reserved = Number(wallet.reserved_credits);

    if (available < credits) {
      throw new AppError(
        402,
        `Insufficient Generation Credits: ${available} available, ${credits} required`,
        'GENERATION_CREDITS_INSUFFICIENT'
      );
    }

    const availableAfter = available - credits;
    const reservedAfter = reserved + credits;

    const reservation = await client.query(
      `INSERT INTO generation_credit_reservations
         (organization_id,requested_by_user_id,campaign_id,generation_job_id,
          model_id,operation,price_snapshot_id,estimated_wholesale_cost_gbp,
          estimated_retail_charge_gbp,reserved_credits,status,idempotency_key,
          expires_at,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reserved',$11,$12,$13)
       RETURNING *`,
      [
        input.organizationId,
        input.userId || null,
        input.campaignId || null,
        input.generationJobId || null,
        input.modelId,
        input.operation,
        input.priceSnapshotId || null,
        input.estimatedWholesaleCostGbp,
        input.estimatedRetailChargeGbp,
        credits,
        input.idempotencyKey,
        input.expiresAt,
        JSON.stringify(input.metadata || {}),
      ]
    );

    await client.query(
      `UPDATE generation_credit_wallets SET
         available_credits=$2,reserved_credits=$3,version=version+1,updated_at=NOW()
       WHERE organization_id=$1`,
      [input.organizationId, availableAfter, reservedAfter]
    );

    await client.query(
      `INSERT INTO generation_credit_ledger
         (organization_id,reservation_id,created_by_user_id,entry_type,direction,credits,
          available_balance_after,reserved_balance_after,model_id,operation,
          idempotency_key,description,metadata)
       VALUES ($1,$2,$3,'reservation','debit',$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        input.organizationId,
        reservation.rows[0].id,
        input.userId || null,
        credits,
        availableAfter,
        reservedAfter,
        input.modelId,
        input.operation,
        `${input.idempotencyKey}:ledger-reserve`,
        `Reserved credits for ${input.operation}`,
        JSON.stringify(input.metadata || {}),
      ]
    );

    return mapReservation(reservation.rows[0]);
  });
}

export async function markReservationSubmitted(
  reservationId: string,
  providerJobId: string
): Promise<CreditReservation> {
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE generation_credit_reservations SET
         status=CASE WHEN status='reserved' THEN 'submitted' ELSE status END,
         provider_job_id=COALESCE(provider_job_id,$2),
         submitted_at=COALESCE(submitted_at,NOW()),updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [reservationId, providerJobId]
    );
    if (!result.rows[0]) throw new NotFoundError('Generation Credit reservation');
    return mapReservation(result.rows[0]);
  });
}

export async function settleReservation(input: {
  reservationId: string;
  actualCredits: number;
  actualWholesaleCostGbp: number;
  actualRetailChargeGbp: number;
  providerJobId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<CreditWallet> {
  const actualCredits = nonNegativeInteger(input.actualCredits, 'actualCredits');

  return transaction(async (client) => {
    const reservationResult = await client.query(
      'SELECT * FROM generation_credit_reservations WHERE id=$1 FOR UPDATE',
      [input.reservationId]
    );
    if (!reservationResult.rows[0]) throw new NotFoundError('Generation Credit reservation');

    const reservation = mapReservation(reservationResult.rows[0]);
    if (['settled', 'partially_settled', 'released', 'expired'].includes(reservation.status)) {
      const walletResult = await client.query(
        'SELECT * FROM generation_credit_wallets WHERE organization_id=$1',
        [reservation.organization_id]
      );
      if (!walletResult.rows[0]) throw new NotFoundError('Generation Credit wallet');
      return mapWallet(walletResult.rows[0] as WalletRow);
    }

    if (actualCredits > reservation.reserved_credits) {
      throw new AppError(
        409,
        'Actual generation charge exceeds the reserved credit ceiling',
        'GENERATION_CREDIT_RESERVATION_EXCEEDED'
      );
    }

    const wallet = await lockWallet(client, reservation.organization_id, 'customer');
    const releaseCredits = reservation.reserved_credits - actualCredits;
    const availableAfter = Number(wallet.available_credits) + releaseCredits;
    const reservedAfter = Number(wallet.reserved_credits) - reservation.reserved_credits;

    if (reservedAfter < 0) {
      throw new AppError(409, 'Reserved credit balance is inconsistent', 'CREDIT_LEDGER_INCONSISTENT');
    }

    const updatedWallet = await client.query(
      `UPDATE generation_credit_wallets SET
         available_credits=$2,reserved_credits=$3,
         lifetime_spent_credits=lifetime_spent_credits+$4,
         version=version+1,updated_at=NOW()
       WHERE organization_id=$1
       RETURNING *`,
      [reservation.organization_id, availableAfter, reservedAfter, actualCredits]
    );

    const status = actualCredits === 0
      ? 'released'
      : releaseCredits > 0
        ? 'partially_settled'
        : 'settled';

    await client.query(
      `UPDATE generation_credit_reservations SET
         provider_job_id=COALESCE(provider_job_id,$2::varchar),settled_credits=$3::bigint,
         released_credits=$4::bigint,status=$5::varchar,
         settled_at=CASE WHEN $3::bigint>0 THEN NOW() ELSE settled_at END,
         released_at=CASE WHEN $4::bigint>0 OR $3::bigint=0 THEN NOW() ELSE released_at END,
         metadata=metadata || $6::jsonb,updated_at=NOW()
       WHERE id=$1`,
      [
        reservation.id,
        input.providerJobId || null,
        actualCredits,
        releaseCredits,
        status,
        JSON.stringify(input.metadata || {}),
      ]
    );

    if (actualCredits > 0) {
      await client.query(
        `INSERT INTO generation_credit_ledger
           (organization_id,reservation_id,entry_type,direction,credits,
            available_balance_after,reserved_balance_after,wholesale_cost_gbp,
            retail_charge_gbp,gross_profit_gbp,model_id,operation,provider_job_id,
            idempotency_key,description,metadata)
         VALUES ($1,$2,'settlement','debit',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          reservation.organization_id,
          reservation.id,
          actualCredits,
          availableAfter,
          reservedAfter,
          input.actualWholesaleCostGbp,
          input.actualRetailChargeGbp,
          input.actualRetailChargeGbp - input.actualWholesaleCostGbp,
          reservation.model_id,
          reservation.operation,
          input.providerJobId || reservation.provider_job_id,
          `${input.idempotencyKey}:settlement`,
          `Settled ${reservation.operation} generation`,
          JSON.stringify(input.metadata || {}),
        ]
      );
    }

    if (releaseCredits > 0 || actualCredits === 0) {
      const released = releaseCredits || reservation.reserved_credits;
      await client.query(
        `INSERT INTO generation_credit_ledger
           (organization_id,reservation_id,entry_type,direction,credits,
            available_balance_after,reserved_balance_after,model_id,operation,
            provider_job_id,idempotency_key,description,metadata)
         VALUES ($1,$2,'release','credit',$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          reservation.organization_id,
          reservation.id,
          released,
          availableAfter,
          reservedAfter,
          reservation.model_id,
          reservation.operation,
          input.providerJobId || reservation.provider_job_id,
          `${input.idempotencyKey}:release`,
          actualCredits === 0 ? 'Released failed or cancelled generation reservation' : 'Released unused reserved credits',
          JSON.stringify(input.metadata || {}),
        ]
      );
    }

    return mapWallet(updatedWallet.rows[0] as WalletRow);
  });
}

export async function releaseReservation(input: {
  reservationId: string;
  reason: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<CreditWallet> {
  return settleReservation({
    reservationId: input.reservationId,
    actualCredits: 0,
    actualWholesaleCostGbp: 0,
    actualRetailChargeGbp: 0,
    idempotencyKey: input.idempotencyKey,
    metadata: { ...(input.metadata || {}), release_reason: input.reason },
  });
}
