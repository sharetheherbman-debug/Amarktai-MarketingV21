jest.mock('../utils/safe-fetch', () => ({
  validatePublicHttpUrl: jest.fn(async (value: string) => new URL(value)),
  safeFetch: jest.fn(),
}));
jest.mock('../services/vector.service', () => ({}));

import { safeFetch } from '../utils/safe-fetch';
import {
  collectWebsiteDocuments,
  collectWebsiteDocumentsDetailed,
  normalizeKnowledgeUrl,
} from '../services/knowledge-ingestion.service';

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

  test('normalizes URLs without fragments, tracking parameters, duplicate slashes, or default ports', () => {
    expect(normalizeKnowledgeUrl('https://EXAMPLE.test:443//features?utm_source=newsletter&b=2&a=1#details'))
      .toBe('https://example.test/features?a=1&b=2');
    expect(normalizeKnowledgeUrl('../pricing?gclid=paid', 'https://example.test/products/horse/'))
      .toBe('https://example.test/products/pricing');
  });

  test('follows a robots-declared nested sitemap and prioritizes high-value pages', async () => {
    const fetched: string[] = [];
    mockedFetch.mockImplementation(async (value: string) => {
      fetched.push(value);
      const url = new URL(value);
      if (url.pathname === '/robots.txt') {
        return response(value, 'User-agent: *\nAllow: /\nSitemap: https://example.test/site-index.xml', 'text/plain');
      }
      if (url.pathname === '/site-index.xml') {
        return response(value, '<sitemapindex><sitemap><loc>https://example.test/public-pages.xml</loc></sitemap></sitemapindex>', 'application/xml');
      }
      if (url.pathname === '/public-pages.xml') {
        return response(value, '<urlset><url><loc>https://example.test/legal/terms</loc></url><url><loc>https://example.test/pricing</loc></url></urlset>', 'application/xml');
      }
      if (url.pathname === '/sitemap.xml') return response(value, '<urlset></urlset>', 'application/xml');
      return response(value, `<html><head><title>${url.pathname}</title><meta name="description" content="Detailed public information for ${url.pathname} customers and partners."></head><body><main><h1>${url.pathname}</h1><p>Detailed public information for customers, teams, products, and services.</p></main></body></html>`);
    });

    const result = await collectWebsiteDocumentsDetailed('https://example.test', { maxPages: 2 });
    expect(result.documents.map((item) => item.url)).toEqual([
      'https://example.test/',
      'https://example.test/pricing',
    ]);
    expect(result.sitemapUrls).toBe(2);
    expect(fetched).toContain('https://example.test/public-pages.xml');
  });

  test('reports linked sites as candidates without fetching outside the approved host', async () => {
    const fetched: string[] = [];
    mockedFetch.mockImplementation(async (value: string) => {
      fetched.push(value);
      const url = new URL(value);
      if (url.pathname === '/robots.txt') return response(value, 'User-agent: *\nAllow: /', 'text/plain');
      if (url.pathname === '/sitemap.xml') return response(value, '<urlset></urlset>', 'application/xml');
      return response(value, '<html><head><title>Business home</title><meta name="description" content="Detailed public business information for customers and stable teams."></head><body><main>Detailed public business information for customers and stable teams.</main><a href="https://academy.example.test/courses">Academy</a><a href="https://partner.test/about">Partner</a><a href="https://instagram.com/example">Social</a></body></html>');
    });

    const result = await collectWebsiteDocumentsDetailed('https://example.test', { maxPages: 5 });
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ hostname: 'academy.example.test', relationship: 'subdomain' }),
      expect.objectContaining({ hostname: 'partner.test', relationship: 'linked_domain' }),
    ]));
    expect(result.candidates.map((item) => item.hostname)).not.toContain('instagram.com');
    expect(fetched.some((value) => value.includes('academy.example.test') || value.includes('partner.test'))).toBe(false);
  });

  test('suppresses canonical and content duplicates and skips noisy or media links', async () => {
    const fetched: string[] = [];
    const shared = '<html><head><title>Shared service</title><meta name="description" content="Detailed shared service information for customers and professional teams."></head><body><main>Detailed shared service information for customers and professional teams.</main></body></html>';
    mockedFetch.mockImplementation(async (value: string) => {
      fetched.push(value);
      const url = new URL(value);
      if (url.pathname === '/robots.txt') return response(value, 'User-agent: *\nAllow: /', 'text/plain');
      if (url.pathname === '/sitemap.xml') return response(value, '<urlset></urlset>', 'application/xml');
      if (url.pathname === '/alias') return response(value, shared.replace('</head>', '<link rel="canonical" href="/service"></head>'));
      if (url.pathname === '/copy') return response(value, shared);
      if (url.pathname === '/service') return response(value, shared);
      if (url.pathname === '/assets/brochure.pdf') return response(value, 'pdf fixture', 'application/pdf');
      return response(value, '<html><head><title>Business home</title><meta name="description" content="Detailed public business information for customers and professional teams."></head><body><main>Detailed public business information for customers and professional teams.</main><a href="/alias?utm_campaign=launch#top">Alias</a><a href="/service">Service</a><a href="/copy">Copy</a><a href="/login">Login</a><a href="/assets/brochure.pdf">PDF</a><a href="/hero.webp">Image</a></body></html>');
    });

    const result = await collectWebsiteDocumentsDetailed('https://example.test', { maxPages: 10 });
    expect(result.documents.map((item) => item.url)).toEqual([
      'https://example.test/',
      'https://example.test/service',
    ]);
    expect(fetched.some((value) => /\/login|\.webp/.test(value))).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      url: 'https://example.test/assets/brochure.pdf',
      reason: 'unsupported_content_type:application/pdf',
    }));
  });

  test('keeps useful pages when another page fails or has an unsupported content type', async () => {
    mockedFetch.mockImplementation(async (value: string) => {
      const url = new URL(value);
      if (url.pathname === '/robots.txt') return response(value, 'User-agent: *\nAllow: /', 'text/plain');
      if (url.pathname === '/sitemap.xml') return response(value, '<urlset></urlset>', 'application/xml');
      if (url.pathname === '/broken') throw new Error('fixture timeout');
      if (url.pathname === '/download') return response(value, 'binary-data', 'application/octet-stream');
      return response(value, '<html><head><title>Business home</title><meta name="description" content="Detailed public business information for customers and professional teams."></head><body><main>Detailed public business information for customers and professional teams.</main><a href="/broken">Broken</a><a href="/download">Download</a></body></html>');
    });

    const result = await collectWebsiteDocumentsDetailed('https://example.test', { maxPages: 5 });
    expect(result.pagesAccepted).toBe(1);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: 'https://example.test/broken', reason: 'fixture timeout' }),
      expect.objectContaining({ url: 'https://example.test/download', reason: 'unsupported_content_type:application/octet-stream' }),
    ]));
  });

  test('enforces page bounds and configures redirect and response-size limits on every fetch', async () => {
    mockedFetch.mockImplementation(async (value: string) => {
      const url = new URL(value);
      if (url.pathname === '/robots.txt') return response(value, 'User-agent: *\nAllow: /', 'text/plain');
      if (url.pathname === '/sitemap.xml') return response(value, '<urlset></urlset>', 'application/xml');
      const links = Array.from({ length: 12 }, (_, index) => `<a href="/page-${index}">Page ${index}</a>`).join('');
      return response(value, `<html><head><title>${url.pathname}</title><meta name="description" content="Detailed public business information for customers and professional teams."></head><body><main>Detailed public business information for customers and professional teams at ${url.pathname}.</main>${links}</body></html>`);
    });

    const result = await collectWebsiteDocumentsDetailed('https://example.test', { maxPages: 3, maxDepth: 1 });
    expect(result.pagesAccepted).toBe(3);
    expect(result.pagesVisited).toBe(3);
    for (const [, options] of mockedFetch.mock.calls) {
      expect(options).toEqual(expect.objectContaining({ maxRedirects: 5, maxResponseBytes: 10 * 1024 * 1024 }));
    }
  });
});
