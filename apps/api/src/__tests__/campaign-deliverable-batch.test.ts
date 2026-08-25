import { applyRequestedDeliverables, normalizeRequestedDeliverables } from '../services/campaign-planner.service';

describe('campaign deliverable batch contract', () => {
  const basePlan = {
    brief: { objective: 'Grow qualified Academy enrolments', calls_to_action: ['Explore the Academy'] },
    creative_concept: { central_idea: 'Confident owner learning', hook: 'Make every ride count' },
    messaging_plan: { primary_message: 'Practical learning for responsible horse owners' },
    strategy: { overview: 'Existing strategy' },
    asset_requirements: [{ brief_id: 'legacy', variations: 2 }],
  };

  it('normalizes a requested video and image batch within bounded client-safe limits', () => {
    const normalized = normalizeRequestedDeliverables([
      { kind: 'video_ad', count: 1, duration_seconds: 15 },
      { kind: 'image_ad', count: 5 },
      { kind: 'unknown' as never, count: 99 },
    ]);

    expect(normalized).toEqual([
      { kind: 'video_ad', count: 1, platforms: [], format: undefined, duration_seconds: 15 },
      { kind: 'image_ad', count: 5, platforms: [], format: undefined, duration_seconds: undefined },
    ]);
  });

  it('turns one owner batch request into exact branded campaign deliverables rather than studio jobs', () => {
    const requested = normalizeRequestedDeliverables([
      { kind: 'video_ad', count: 1, duration_seconds: 15 },
      { kind: 'image_ad', count: 5 },
    ]);
    const plan = applyRequestedDeliverables(basePlan, requested);
    const requirements = plan.asset_requirements as Array<Record<string, unknown>>;
    const strategy = plan.strategy as Record<string, unknown>;
    const batch = strategy.deliverable_batch as Record<string, unknown>;

    expect(batch.total_requested_assets).toBe(6);
    expect(batch.video_policy).toContain('up to 15 seconds');
    expect(requirements).toHaveLength(2);
    expect(requirements[0]).toMatchObject({ format: 'short video ad', variations: 1, duration_seconds: 15, production_mode: 'economical_short_form_video', cta: 'Explore the Academy' });
    expect(requirements[1]).toMatchObject({ format: 'image ad', variations: 5, production_mode: 'branded_marketing_asset', message: 'Practical learning for responsible horse owners' });
  });
});
