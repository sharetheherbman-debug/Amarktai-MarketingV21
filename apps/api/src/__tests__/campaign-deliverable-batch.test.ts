import { applyRequestedDeliverables, normalizeRequestedDeliverables } from '../services/campaign-planner.service';
import { buildCampaignRunSpecs } from '../services/campaign-production.service';
import { OWNER_DELIVERABLE_KINDS, getDeliverableRoute } from '../services/marketing-deliverable-registry.service';

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
      { kind: 'video_ad', count: 1, platforms: [], format: 'Short video ad', duration_seconds: 15 },
      { kind: 'image_ad', count: 5, platforms: [], format: 'Image ad', duration_seconds: undefined },
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
    expect(requirements[0]).toMatchObject({ format: 'Short video ad', variations: 1, duration_seconds: 15, production_mode: 'economical_short_form_video', cta: 'Explore the Academy' });
    expect(requirements[1]).toMatchObject({ format: 'Image ad', variations: 5, production_mode: 'branded_marketing_asset', message: 'Practical learning for responsible horse owners' });
  });

  it('expands 1 Video Ad plus 5 Image Ads into exactly six unique durable run keys and preserves them on retry', () => {
    const plan = applyRequestedDeliverables(basePlan, normalizeRequestedDeliverables([
      { kind: 'video_ad', count: 1, duration_seconds: 10 },
      { kind: 'image_ad', count: 5 },
    ]));
    const first = buildCampaignRunSpecs(plan.asset_requirements as unknown[]);
    const second = buildCampaignRunSpecs(plan.asset_requirements as unknown[]);
    const firstKeys = first.map((run) => `${run.briefId}:${run.variant}`);

    expect(first).toHaveLength(6);
    expect(new Set(firstKeys).size).toBe(6);
    expect(second.map((run) => `${run.briefId}:${run.variant}`)).toEqual(firstKeys);
    expect(first.filter((run) => run.canonicalRoute?.kind === 'video_ad')).toHaveLength(1);
    expect(first.filter((run) => run.canonicalRoute?.kind === 'image_ad')).toHaveLength(5);
    expect(first[0]).toMatchObject({ operation: 'text_to_image', canonicalRoute: { composition: 'branded_video', maxDurationSeconds: 15 } });
    expect(first.slice(1).every((run) => run.operation === 'text_to_image' && run.canonicalRoute?.composition === 'branded_static')).toBe(true);
    const requestedFinalAssets = first.filter((run) => ['branded_static', 'branded_video'].includes(String(run.canonicalRoute?.composition)));
    const finalSummary = {
      requested_final_assets: requestedFinalAssets.length,
      final_image_assets: requestedFinalAssets.filter((run) => run.canonicalRoute?.composition === 'branded_static').length,
      final_video_assets: requestedFinalAssets.filter((run) => run.canonicalRoute?.composition === 'branded_video').length,
      ready_final_assets: requestedFinalAssets.length,
    };
    expect(finalSummary).toEqual({ requested_final_assets: 6, final_image_assets: 5, final_video_assets: 1, ready_final_assets: 6 });
  });

  it('keeps legacy or untrusted briefs at the stricter three-variation bound', () => {
    const runs = buildCampaignRunSpecs([{ brief_id: 'legacy', format: 'image', variations: 12 }]);
    expect(runs).toHaveLength(3);
    expect(runs.map((run) => run.variant)).toEqual([1, 2, 3]);
  });

  it('maps every owner-visible deliverable explicitly with owner review and no blog fallback', () => {
    const expected = {
      campaign: ['campaign_bundle', 'text_generation'],
      weekly_marketing: ['weekly_bundle', 'text_generation'],
      social_ad: ['branded_static', 'text_to_image'],
      image_ad: ['branded_static', 'text_to_image'],
      video_ad: ['branded_video', 'text_to_image'],
      social_post: ['branded_static', 'text_to_image'],
      promotional_graphic: ['branded_static', 'text_to_image'],
      website_banner: ['branded_static', 'text_to_image'],
      email_campaign: ['branded_html', 'text_generation'],
      landing_page: ['branded_html', 'text_generation'],
      article: ['branded_copy', 'text_generation'],
      offer_promotion: ['branded_static', 'text_to_image'],
      retargeting_material: ['branded_static', 'text_to_image'],
    } as const;

    expect(OWNER_DELIVERABLE_KINDS).toHaveLength(13);
    for (const kind of OWNER_DELIVERABLE_KINDS) {
      const route = getDeliverableRoute(kind);
      expect(route.requiresOwnerApproval).toBe(true);
      expect([route.composition, route.ingredientOperation]).toEqual(expected[kind]);
      expect(route.materialType).not.toBe('blog');
    }
    expect(() => getDeliverableRoute('free-form blog')).toThrow('Unsupported owner deliverable kind');
  });
});
