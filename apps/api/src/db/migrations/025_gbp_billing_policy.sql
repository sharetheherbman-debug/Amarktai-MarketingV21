-- Phase 1: EquiProfile Marketing is a United Kingdom deployment.
-- All new subscription and invoice records use GBP.
--
-- Existing non-GBP Stripe Price IDs are deliberately cleared. Reusing a USD or
-- EUR Price ID while displaying pounds would be misleading and unsafe. Paid
-- plans remain visible, but checkout is blocked by the billing service until a
-- GBP Stripe Price ID is configured in the backend.

ALTER TABLE billing_plans
  ALTER COLUMN currency SET DEFAULT 'GBP';

UPDATE billing_plans
SET currency = 'GBP',
    stripe_price_monthly_id = CASE
      WHEN UPPER(COALESCE(currency, '')) = 'GBP' THEN stripe_price_monthly_id
      ELSE NULL
    END,
    stripe_price_yearly_id = CASE
      WHEN UPPER(COALESCE(currency, '')) = 'GBP' THEN stripe_price_yearly_id
      ELSE NULL
    END
WHERE UPPER(COALESCE(currency, '')) <> 'GBP';

ALTER TABLE billing_invoices
  ALTER COLUMN currency SET DEFAULT 'GBP';

-- Historical invoices are not relabelled. Their original currency remains part
-- of the accounting record. New Stripe invoice synchronisation must persist the
-- currency returned by Stripe and the launch UI accepts GBP records only.

ALTER TABLE generation_credit_purchases
  ALTER COLUMN currency SET DEFAULT 'GBP';

ALTER TABLE generation_credit_packs
  ALTER COLUMN currency SET DEFAULT 'GBP';
