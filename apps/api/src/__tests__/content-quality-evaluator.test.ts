import { evaluateContentQuality } from '../services/content-quality-evaluator';

const representativeCampaigns = [
  { name: 'service lead generation', type: 'landing_page', platform: 'web', text: 'Private riding assessment for local owners. Book your assessment today.' },
  { name: 'product promotion', type: 'social', platform: 'instagram', text: 'Meet the approved summer care collection. Discover the collection.' },
  { name: 'thought leadership', type: 'article', platform: 'linkedin', text: 'A practical framework for consistent horse records. Learn more.' },
  { name: 'event launch', type: 'email', platform: 'email', text: 'The owner workshop opens on Saturday. Register for the workshop.' },
  { name: 'reactivation', type: 'email', platform: 'email', text: 'Your saved horse records are ready when you are. Visit your dashboard.' },
];

describe('content quality evaluator', () => {
  it.each(representativeCampaigns)('accepts a grounded $name fixture', (fixture) => {
    const result = evaluateContentQuality({
      ...fixture,
      metadata: { quality_brief: { subject: 'A useful update', calls_to_action: ['book', 'discover', 'learn more', 'register', 'visit'] } },
    });
    expect(result.find((item) => item.type === 'compliance')?.passed).toBe(true);
    expect(result.find((item) => item.type === 'cta')?.passed).toBe(true);
  });

  it('blocks unsupported claims, prohibited language and inaccessible media', () => {
    const result = evaluateContentQuality({
      text: 'Our miracle method is scientifically proven to improve results by 97%. Buy now.',
      type: 'image',
      platform: 'instagram',
      prohibitedPhrases: ['miracle method'],
      metadata: { quality_brief: { allowed_claims: [] } },
    });
    expect(result.find((item) => item.type === 'brand_voice')?.passed).toBe(false);
    expect(result.find((item) => item.type === 'compliance')?.passed).toBe(false);
    expect(result.find((item) => item.type === 'accessibility')?.passed).toBe(false);
  });

  it('detects brief drift and platform overflow', () => {
    const result = evaluateContentQuality({
      text: 'A'.repeat(300), type: 'social', platform: 'x',
      metadata: { quality_brief: { required_terms: ['horse care'], campaign_concept: 'calm confidence' } },
    });
    expect(result.find((item) => item.type === 'campaign_alignment')?.passed).toBe(false);
    expect(result.find((item) => item.type === 'platform')?.passed).toBe(false);
  });

  it.each(['coming_soon', 'paused', 'retired', 'internal'])(
    'blocks active purchase language for a %s product',
    (lifecycle) => {
      const result = evaluateContentQuality({
        text: 'The new collection is available now. Shop now and add to cart.',
        type: 'social',
        platform: 'instagram',
        metadata: { quality_brief: { lifecycle_status: lifecycle } },
      });
      const compliance = result.find((item) => item.type === 'compliance');
      expect(compliance?.passed).toBe(false);
      expect(compliance?.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'product_lifecycle_conflict', severity: 'error' }),
      ]));
    },
  );

  it('allows evidenced purchase language after the same generic product becomes live', () => {
    const result = evaluateContentQuality({
      text: 'The collection is available now. Shop now.',
      type: 'social',
      platform: 'instagram',
      metadata: { quality_brief: { lifecycle_status: 'live' } },
    });
    expect(result.find((item) => item.type === 'compliance')?.passed).toBe(true);
  });
});
