jest.mock('../utils/safe-fetch', () => ({
  validatePublicHttpUrl: jest.fn(async (value: string) => new URL(value)),
  safeFetch: jest.fn(),
}));
jest.mock('../services/vector.service', () => ({}));

import { safeFetch } from '../utils/safe-fetch';
import { collectWebsiteDocuments } from '../services/knowledge-ingestion.service';

const mockedFetch = safeFetch as jest.MockedFunction<typeof safeFetch>;

function response(url: string, body: string, contentType = 'text/html') {
  return {
    ok: true,
    status: 200,
    url,
    headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null },
    text: async () => body,
  } as any;
}

describe('website crawler', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockImplementation(async (value: string) => {
      const url = new URL(value);
      if (url.pathname === '/robots.txt') {
        return response(value, 'User-agent: *\nAllow: /', 'text/plain');
      }
      if (url.pathname === '/sitemap.xml') {
        return response(value, '<urlset><url><loc>https://example.test/features</loc></url></urlset>', 'application/xml');
      }
      if (url.pathname === '/features') {
        return response(value, '<html><head><title>Horse care features</title><meta name="description" content="Health schedules, training records and stable teamwork."></head><body><main><h1>Care for every horse</h1><p>Bring health, training and daily work into one shared plan.</p></main></body></html>');
      }
      return response(value, '<html><head><title>Equestrian workspace</title><meta property="og:description" content="A professional horse management platform for riders and stable teams."><script type="application/ld+json">{"@type":"SoftwareApplication","name":"Equestrian workspace","description":"Horse records, care plans and progress in one place."}</script><link rel="canonical" href="https://example.test/"></head><body><div id="root"></div><a href="/features">Features</a></body></html>');
    });
  });

  test('uses metadata and structured data when a modern site returns an app shell', async () => {
    const documents = await collectWebsiteDocuments('https://example.test', { maxPages: 5 });
    expect(documents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: 'https://example.test/',
        content: expect.stringContaining('professional horse management platform'),
        metadata: expect.objectContaining({ extraction: 'metadata_and_structured_data' }),
      }),
      expect.objectContaining({ url: 'https://example.test/features', content: expect.stringContaining('Health schedules') }),
    ]));
  });

  test('respects a robots disallow rule', async () => {
    mockedFetch.mockImplementation(async (value: string) => {
      const url = new URL(value);
      if (url.pathname === '/robots.txt') return response(value, 'User-agent: *\nDisallow: /private', 'text/plain');
      if (url.pathname === '/sitemap.xml') return response(value, '<urlset><url><loc>https://example.test/private</loc></url></urlset>', 'application/xml');
      return response(value, '<html><head><title>Public business page</title><meta name="description" content="Useful public business information for customers."></head><body><main>Useful public business information for customers.</main></body></html>');
    });
    const documents = await collectWebsiteDocuments('https://example.test', { maxPages: 5 });
    expect(documents.map((item) => item.url)).not.toContain('https://example.test/private');
  });
});
