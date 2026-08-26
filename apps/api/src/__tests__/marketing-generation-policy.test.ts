import { rankMarketingCandidates, type PricedCandidate } from '../services/marketing-generation-policy.service';

function candidate(modelId: string, credits: number, quality: number, failureRate: number, health = 90): PricedCandidate {
  return {
    modelId, tier: 'recommended', operation: 'text_to_image', estimatedCredits: credits, estimatedRetailGbp: credits / 50,
    priceSnapshotId: `price-${modelId}`, pricingLastSyncedAt: '2026-08-26T00:00:00.000Z', runtimeConfirmed: true,
    healthScore: health, failureRate, qualityScore: quality, latencyMs: 1000,
  };
}

describe('auditable Marketing model policy', () => {
  const cheapUnreliable = candidate('cheap-unreliable', 1, 45, 40, 60);
  const provenValue = candidate('proven-value', 3, 92, 2, 96);
  const expensiveQuality = candidate('expensive-quality', 8, 98, 1, 98);

  it('uses lowest safe live cost for Economy', () => {
    expect(rankMarketingCandidates('economy', [provenValue, cheapUnreliable])[0].candidate.modelId).toBe('cheap-unreliable');
  });

  it('uses quality, reliability, health, latency and cost for Recommended instead of a price midpoint', () => {
    const selected = rankMarketingCandidates('recommended', [cheapUnreliable, provenValue, expensiveQuality])[0];
    expect(selected.candidate.modelId).toBe('proven-value');
    expect(selected.signals).toEqual(expect.objectContaining({ cost: expect.any(Number), health: 96, reliability: 98, historical_quality: 92 }));
  });

  it('uses the strongest observed quality/reliability route for Premium after the separate permission gate', () => {
    expect(rankMarketingCandidates('premium', [provenValue, expensiveQuality])[0].candidate.modelId).toBe('expensive-quality');
  });
});
