jest.mock('../../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import * as billingService from '../../services/billing.service';
import * as generationCreditService from '../../services/generation-credit.service';

describe('Billing Service public contract', () => {
  describe('Plan and subscription reads', () => {
    it.each([
      'listPlans',
      'getPlanBySlug',
      'getPlanById',
      'getSubscription',
    ] as const)('exports %s', (name) => {
      expect(typeof billingService[name]).toBe('function');
    });
  });

  describe('Usage metering', () => {
    it.each([
      'recordUsage',
      'getUsage',
      'getCurrentUsage',
      'checkLimit',
    ] as const)('exports %s', (name) => {
      expect(typeof billingService[name]).toBe('function');
    });
  });

  describe('Invoices and tenant settings', () => {
    it.each([
      'listInvoices',
      'getTenantSettings',
      'updateTenantSettings',
      'redeemCoupon',
      'getBillingEvents',
    ] as const)('exports %s', (name) => {
      expect(typeof billingService[name]).toBe('function');
    });
  });

  describe('unsafe local money movement remains absent', () => {
    const legacyLocalFunctions = [
      'createSubscription',
      'cancelSubscription',
      'changePlan',
      'reactivateSubscription',
      'createInvoice',
      'markInvoicePaid',
      'listPaymentMethods',
      'addPaymentMethod',
      'setDefaultPaymentMethod',
      'removePaymentMethod',
    ];

    it.each(legacyLocalFunctions)('does not export %s', (name) => {
      expect(name in billingService).toBe(false);
    });
  });
});

describe('GBP Generation Credit service contract', () => {
  it.each([
    'getWallet',
    'grantCredits',
    'creditPaidStripePurchase',
    'reserveCredits',
    'markReservationSubmitted',
    'settleReservation',
    'releaseReservation',
  ] as const)('exports %s', (name) => {
    expect(typeof generationCreditService[name]).toBe('function');
  });
});
