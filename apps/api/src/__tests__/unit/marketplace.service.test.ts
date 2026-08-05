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

import * as marketplaceService from '../../services/marketplace.service';

describe('Marketplace Service', () => {
  describe('Publishers', () => {
    it('should have createPublisher function', () => {
      expect(typeof marketplaceService.createPublisher).toBe('function');
    });

    it('should have getPublisherBySlug function', () => {
      expect(typeof marketplaceService.getPublisherBySlug).toBe('function');
    });

    it('should have listPublishers function', () => {
      expect(typeof marketplaceService.listPublishers).toBe('function');
    });
  });

  describe('Items', () => {
    it('should have listItems function', () => {
      expect(typeof marketplaceService.listItems).toBe('function');
    });

    it('should have getItemById function', () => {
      expect(typeof marketplaceService.getItemById).toBe('function');
    });

    it('should have createItem function', () => {
      expect(typeof marketplaceService.createItem).toBe('function');
    });

    it('should have updateItem function', () => {
      expect(typeof marketplaceService.updateItem).toBe('function');
    });

    it('should have deleteItem function', () => {
      expect(typeof marketplaceService.deleteItem).toBe('function');
    });
  });

  describe('Installations', () => {
    it('should have installItem function', () => {
      expect(typeof marketplaceService.installItem).toBe('function');
    });

    it('should have uninstallItem function', () => {
      expect(typeof marketplaceService.uninstallItem).toBe('function');
    });

    it('should have listInstallations function', () => {
      expect(typeof marketplaceService.listInstallations).toBe('function');
    });
  });

  describe('Reviews', () => {
    it('should have listReviews function', () => {
      expect(typeof marketplaceService.listReviews).toBe('function');
    });

    it('should have createReview function', () => {
      expect(typeof marketplaceService.createReview).toBe('function');
    });
  });

  describe('Skill Packs', () => {
    it('should have listSkillPacks function', () => {
      expect(typeof marketplaceService.listSkillPacks).toBe('function');
    });

    it('should have getSkillPackBySlug function', () => {
      expect(typeof marketplaceService.getSkillPackBySlug).toBe('function');
    });

    it('should have installSkillPack function', () => {
      expect(typeof marketplaceService.installSkillPack).toBe('function');
    });
  });
});
