jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('../services/vector.service', () => ({
  generateEmbeddings: jest.fn(),
  storeEmbedding: jest.fn(),
  generateEmbedding: jest.fn(),
  similaritySearch: jest.fn(),
}));

jest.mock('../utils/safe-fetch', () => ({
  safeFetch: jest.fn(),
  validatePublicHttpUrl: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { robotsAllows } from '../services/knowledge-ingestion.service';

describe('Marketing knowledge crawler robots policy', () => {
  it('prefers the specific Marketing bot group over a wildcard group', () => {
    const robots = [
      'User-agent: AmarktAI-Marketing-KnowledgeBot',
      'Allow: /',
      '',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');

    expect(robotsAllows(robots, '/')).toBe(true);
    expect(robotsAllows(robots, '/shop')).toBe(true);
  });

  it('uses the wildcard group when no specific Marketing bot group exists', () => {
    const robots = [
      'User-agent: *',
      'Disallow: /private',
      'Allow: /public',
      '',
    ].join('\n');

    expect(robotsAllows(robots, '/private')).toBe(false);
    expect(robotsAllows(robots, '/private/page')).toBe(false);
    expect(robotsAllows(robots, '/public')).toBe(true);
  });

  it('uses the longest matching path and lets Allow win an equal-length tie', () => {
    const robots = [
      'User-agent: AmarktAI-Marketing-KnowledgeBot',
      'Disallow: /private',
      'Allow: /private/help',
      'Disallow: /tie',
      'Allow: /tie',
      '',
    ].join('\n');

    expect(robotsAllows(robots, '/private')).toBe(false);
    expect(robotsAllows(robots, '/private/help/article')).toBe(true);
    expect(robotsAllows(robots, '/tie')).toBe(true);
  });

  it('supports multiple user-agent lines in one group', () => {
    const robots = [
      'User-agent: AnotherCrawler',
      'User-agent: AmarktAI-Marketing-KnowledgeBot',
      'Allow: /first-party',
      'Disallow: /',
      '',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');

    expect(robotsAllows(robots, '/first-party')).toBe(true);
    expect(robotsAllows(robots, '/other')).toBe(false);
  });
});
