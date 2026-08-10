import fs from 'fs';
import path from 'path';

const repositoryRoot = path.resolve(__dirname, '..', '..', '..', '..');
const read = (relative: string) => fs.readFileSync(path.resolve(repositoryRoot, relative), 'utf8');

describe('Generation Credit financial reversal boundary', () => {
  test('refunds and chargebacks are compensating immutable ledger entries', () => {
    const migration = read('apps/api/src/db/migrations/028_generation_credit_financial_reversals.sql');
    const service = read('apps/api/src/services/generation-credit-reversal.service.ts');
    const stripe = read('apps/api/src/services/generation-credit-stripe.service.ts');

    expect(migration).toContain("entry_type IN ('refund', 'chargeback')");
    expect(migration).toContain('credits = 0');
    expect(service).toContain("entry_type IN ('refund','chargeback')");
    expect(service).toContain("VALUES ($1,$2,$3,'debit'");
    expect(service).toContain('unrecovered_credits');
    expect(service).toContain('Math.min(availableBefore, intendedCreditDelta)');
    expect(service).not.toContain('available_credits=-');

    expect(stripe).toContain("event.type === 'charge.refunded'");
    expect(stripe).toContain("event.type === 'charge.dispute.funds_withdrawn'");
    expect(stripe).toContain("event.type === 'charge.dispute.funds_reinstated'");
    expect(stripe).toContain('applyGenerationCreditFinancialReversal');
    expect(stripe).toContain('reinstateGenerationCreditChargeback');
  });

  test('partial Stripe refunds use cumulative amount semantics and idempotent event keys', () => {
    const stripe = read('apps/api/src/services/generation-credit-stripe.service.ts');
    const reversal = read('apps/api/src/services/generation-credit-reversal.service.ts');

    expect(stripe).toContain('amountIsCumulative: true');
    expect(stripe).toContain('stripe-credit-refund:${event.id}');
    expect(stripe).toContain('stripe-credit-chargeback:${event.id}');
    expect(stripe).toContain('stripe-credit-chargeback-reinstated:${event.id}');
    expect(reversal).toContain('refundMoneyAlreadyRecorded');
    expect(reversal).toContain('requestedCumulativeRefund - priorRefundMoney');
    expect(reversal).toContain('WHERE organization_id=$1 AND idempotency_key=$2');
  });

  test('financial reversals never claw back more available credits than the wallet contains', () => {
    const reversal = read('apps/api/src/services/generation-credit-reversal.service.ts');

    expect(reversal).toContain('const removedCredits = Math.min(availableBefore, intendedCreditDelta);');
    expect(reversal).toContain('const unrecoveredCredits = intendedCreditDelta - removedCredits;');
    expect(reversal).toContain('const availableAfter = availableBefore - removedCredits;');
    expect(reversal).toContain('financial_reversal_target_credits');
  });
});
