import { buildEconomicalVideoCostPlan } from '../services/economical-video-policy.service';
import type { MarketingGenerationRoute } from '../services/marketing-generation-policy.service';

const pricedStillRoute: MarketingGenerationRoute = {
  modelId: 'reviewed-image-model',
  operation: 'text_to_image',
  tier: 'economy',
  priceSnapshotId: 'snapshot-1',
  estimatedCredits: 2,
  estimatedRetailGbp: 0.04,
  pricingLastSyncedAt: '2026-08-25T00:00:00.000Z',
};

describe('economical promotional video policy', () => {
  it('creates a costed still-heavy FFmpeg route with final branding, captions and CTA', () => {
    const plan = buildEconomicalVideoCostPlan(10, pricedStillRoute);
    expect(plan).toMatchObject({
      production_mode: 'economical_short_form_video',
      duration_seconds: 10,
      generated_ingredients: [{ type: 'still_image', operation: 'text_to_image', model_id: 'reviewed-image-model', price_snapshot_id: 'snapshot-1' }],
      composition: {
        engine: 'ffmpeg', scene_strategy: 'small_multiscene_still_heavy', brand_end_card: true,
        captions: true, cta: true, raw_text_to_video: false, estimated_generation_credits: 2,
      },
    });
  });

  it.each([4, 16, 'not-a-duration'])('fails closed outside the bounded short-form duration range: %p', (duration) => {
    expect(() => buildEconomicalVideoCostPlan(duration, pricedStillRoute)).toThrow('between 5 and 15 seconds');
  });

  it('refuses a raw video provider route as an ingredient', () => {
    expect(() => buildEconomicalVideoCostPlan(10, { ...pricedStillRoute, operation: 'text_to_video' })).toThrow('still-image ingredient route');
  });
});
