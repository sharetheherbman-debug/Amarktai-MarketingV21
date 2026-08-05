jest.mock('../../config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import * as featureFlags from '../../services/feature-flags.service';

describe('Feature Flags Service', () => {
  describe('CRUD Operations', () => {
    it('should have listFlags function', () => {
      expect(typeof featureFlags.listFlags).toBe('function');
    });

    it('should have getFlagByKey function', () => {
      expect(typeof featureFlags.getFlagByKey).toBe('function');
    });

    it('should have createFlag function', () => {
      expect(typeof featureFlags.createFlag).toBe('function');
    });

    it('should have updateFlag function', () => {
      expect(typeof featureFlags.updateFlag).toBe('function');
    });

    it('should have deleteFlag function', () => {
      expect(typeof featureFlags.deleteFlag).toBe('function');
    });
  });

  describe('Feature Evaluation', () => {
    it('should have isEnabled function', () => {
      expect(typeof featureFlags.isEnabled).toBe('function');
    });

    it('should have evaluateFlags function', () => {
      expect(typeof featureFlags.evaluateFlags).toBe('function');
    });
  });

  describe('Seeding', () => {
    it('should have seedDefaultFlags function', () => {
      expect(typeof featureFlags.seedDefaultFlags).toBe('function');
    });
  });
});
