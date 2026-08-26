import { finalizeCanonicalTextMaterial } from '../services/marketing-text-material.service';
import { getDeliverableRoute, type OwnerDeliverableKind } from '../services/marketing-deliverable-registry.service';

function finalize(kind: OwnerDeliverableKind) {
  const route = getDeliverableRoute(kind);
  return finalizeCanonicalTextMaterial({
    deliverableKind: kind,
    compositionMode: route.composition,
    materialType: route.materialType,
    channel: route.primaryChannel,
    dimensionsOrFormat: route.defaultDimensions,
    requiresOwnerApproval: route.requiresOwnerApproval,
    campaignPlanId: 'plan-1',
    briefId: `brief-${kind}`,
    title: 'Spring launch',
    generatedBody: 'A useful customer-facing message.\n\nExplore the programme today.',
  });
}

describe('canonical Marketing text material finalizers', () => {
  it.each([
    ['email_campaign', 'branded_html', 'html'],
    ['landing_page', 'branded_html', 'html'],
    ['article', 'branded_copy', 'markdown'],
    ['campaign', 'campaign_bundle', 'markdown'],
    ['weekly_marketing', 'weekly_bundle', 'markdown'],
  ] as const)('%s finalizes explicitly as %s', (kind, mode, format) => {
    const material = finalize(kind);
    expect(material).toMatchObject({ format, metadata: {
      deliverable_kind: kind,
      material_mode: mode,
      campaign_plan_id: 'plan-1',
      requires_owner_approval: true,
      approval_state: 'pending_review',
    } });
    expect(material.body.length).toBeGreaterThan(20);
  });

  it('creates distinct HTML customer objects for email and landing-page output', () => {
    expect(finalize('email_campaign').metadata.customer_facing_object).toMatchObject({ document_kind: 'email' });
    expect(finalize('landing_page').metadata.customer_facing_object).toMatchObject({ document_kind: 'landing_page' });
  });

  it('rejects unknown or mismatched canonical metadata', () => {
    expect(() => finalizeCanonicalTextMaterial({
      deliverableKind: 'unknown', compositionMode: 'branded_copy', materialType: 'article', channel: 'blog',
      dimensionsOrFormat: 'responsive article', requiresOwnerApproval: true, campaignPlanId: 'p', briefId: 'b', title: 'x', generatedBody: 'copy',
    })).toThrow('Unsupported owner deliverable kind');
    const article = getDeliverableRoute('article');
    expect(() => finalizeCanonicalTextMaterial({
      deliverableKind: 'article', compositionMode: 'branded_html', materialType: article.materialType, channel: article.primaryChannel,
      dimensionsOrFormat: article.defaultDimensions, requiresOwnerApproval: true, campaignPlanId: 'p', briefId: 'b', title: 'x', generatedBody: 'copy',
    })).toThrow('does not match the deliverable registry');
  });
});
