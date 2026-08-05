// Mock the database module
jest.mock('../../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

// Mock the logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import * as billingService from '../../services/billing.service';

describe('Billing Service', () => {
  describe('Plan Management', () => {
    it('should be defined', () => {
      expect(billingService).toBeDefined();
    });

    it('should have listPlans function', () => {
      expect(typeof billingService.listPlans).toBe('function');
    });

    it('should have getPlanBySlug function', () => {
      expect(typeof billingService.getPlanBySlug).toBe('function');
    });

    it('should have getPlanById function', () => {
      expect(typeof billingService.getPlanById).toBe('function');
    });
  });

  describe('Subscription Management', () => {
    it('should have getSubscription function', () => {
      expect(typeof billingService.getSubscription).toBe('function');
    });

    it('should have createSubscription function', () => {
      expect(typeof billingService.createSubscription).toBe('function');
    });

    it('should have cancelSubscription function', () => {
      expect(typeof billingService.cancelSubscription).toBe('function');
    });

    it('should have changePlan function', () => {
      expect(typeof billingService.changePlan).toBe('function');
    });

    it('should have reactivateSubscription function', () => {
      expect(typeof billingService.reactivateSubscription).toBe('function');
    });
  });

  describe('Usage Metering', () => {
    it('should have recordUsage function', () => {
      expect(typeof billingService.recordUsage).toBe('function');
    });

    it('should have getUsage function', () => {
      expect(typeof billingService.getUsage).toBe('function');
    });

    it('should have getCurrentUsage function', () => {
      expect(typeof billingService.getCurrentUsage).toBe('function');
    });

    it('should have checkLimit function', () => {
      expect(typeof billingService.checkLimit).toBe('function');
    });
  });

  describe('Invoices', () => {
    it('should have listInvoices function', () => {
      expect(typeof billingService.listInvoices).toBe('function');
    });

    it('should have createInvoice function', () => {
      expect(typeof billingService.createInvoice).toBe('function');
    });

    it('should have markInvoicePaid function', () => {
      expect(typeof billingService.markInvoicePaid).toBe('function');
    });
  });

  describe('Payment Methods', () => {
    it('should have listPaymentMethods function', () => {
      expect(typeof billingService.listPaymentMethods).toBe('function');
    });

    it('should have addPaymentMethod function', () => {
      expect(typeof billingService.addPaymentMethod).toBe('function');
    });

    it('should have setDefaultPaymentMethod function', () => {
      expect(typeof billingService.setDefaultPaymentMethod).toBe('function');
    });

    it('should have removePaymentMethod function', () => {
      expect(typeof billingService.removePaymentMethod).toBe('function');
    });
  });

  describe('Tenant Settings', () => {
    it('should have getTenantSettings function', () => {
      expect(typeof billingService.getTenantSettings).toBe('function');
    });

    it('should have updateTenantSettings function', () => {
      expect(typeof billingService.updateTenantSettings).toBe('function');
    });
  });

  describe('Coupons', () => {
    it('should have redeemCoupon function', () => {
      expect(typeof billingService.redeemCoupon).toBe('function');
    });
  });
});
