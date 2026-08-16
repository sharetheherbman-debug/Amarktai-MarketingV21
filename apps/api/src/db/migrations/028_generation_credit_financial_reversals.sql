-- Generation Credit financial reversals.
--
-- Refunds and chargebacks must always be auditable even when the customer has
-- already spent every purchased credit. In that case the wallet remains
-- non-negative and the immutable compensating ledger records a zero-credit
-- monetary reversal plus unrecovered_credits metadata.

ALTER TABLE generation_credit_ledger
  DROP CONSTRAINT IF EXISTS generation_credit_ledger_credits_check;

ALTER TABLE generation_credit_ledger
  ADD CONSTRAINT generation_credit_ledger_credits_check
  CHECK (
    credits > 0
    OR (credits = 0 AND entry_type IN ('refund', 'chargeback'))
  );

CREATE INDEX IF NOT EXISTS idx_credit_purchases_payment_intent
  ON generation_credit_purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_purchases_charge
  ON generation_credit_purchases (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_ledger_purchase_reversals
  ON generation_credit_ledger (purchase_id, entry_type, created_at)
  WHERE entry_type IN ('refund', 'chargeback');
