export const OWNER_DELIVERABLE_KINDS = [
  'campaign',
  'weekly_marketing',
  'social_ad',
  'image_ad',
  'video_ad',
  'social_post',
  'promotional_graphic',
  'website_banner',
  'email_campaign',
  'landing_page',
  'article',
  'offer_promotion',
  'retargeting_material',
] as const;

export type OwnerDeliverableKind = typeof OWNER_DELIVERABLE_KINDS[number];
export type MarketingGenerationOperation = 'text_generation' | 'text_to_image' | 'text_to_video' | 'text_to_speech';
export type MarketingCompositionMode =
  | 'campaign_bundle'
  | 'weekly_bundle'
  | 'branded_static'
  | 'branded_video'
  | 'branded_copy'
  | 'branded_html';

export interface DeliverableRoute {
  kind: OwnerDeliverableKind;
  label: string;
  materialType: string;
  primaryChannel: 'social' | 'website' | 'email' | 'blog' | 'multi_channel';
  defaultDimensions: string;
  mediaNeeds: 'copy' | 'image_ingredient' | 'video_composition';
  ingredientOperation: MarketingGenerationOperation;
  composition: MarketingCompositionMode;
  requiresOwnerApproval: boolean;
  maxDurationSeconds?: number;
}

/**
 * This registry is the sole production mapping for every owner-visible Marketing
 * deliverable. It deliberately does not infer a route from free-form formats:
 * unrecognised requests must fail instead of silently becoming blog content.
 */
export const DELIVERABLE_ROUTE_REGISTRY: Record<OwnerDeliverableKind, DeliverableRoute> = {
  campaign: {
    kind: 'campaign', label: 'Campaign marketing set', materialType: 'campaign_bundle',
    primaryChannel: 'multi_channel', defaultDimensions: 'channel-ready bundle', mediaNeeds: 'copy',
    ingredientOperation: 'text_generation', composition: 'campaign_bundle', requiresOwnerApproval: true,
  },
  weekly_marketing: {
    kind: 'weekly_marketing', label: 'Weekly marketing set', materialType: 'weekly_marketing_bundle',
    primaryChannel: 'multi_channel', defaultDimensions: 'weekly channel-ready bundle', mediaNeeds: 'copy',
    ingredientOperation: 'text_generation', composition: 'weekly_bundle', requiresOwnerApproval: true,
  },
  social_ad: {
    kind: 'social_ad', label: 'Social ad', materialType: 'social_ad',
    primaryChannel: 'social', defaultDimensions: '1080x1350', mediaNeeds: 'image_ingredient',
    ingredientOperation: 'text_to_image', composition: 'branded_static', requiresOwnerApproval: true,
  },
  image_ad: {
    kind: 'image_ad', label: 'Image ad', materialType: 'image_ad',
    primaryChannel: 'social', defaultDimensions: '1080x1350', mediaNeeds: 'image_ingredient',
    ingredientOperation: 'text_to_image', composition: 'branded_static', requiresOwnerApproval: true,
  },
  video_ad: {
    kind: 'video_ad', label: 'Short video ad', materialType: 'video_ad',
    primaryChannel: 'social', defaultDimensions: '1080x1920', mediaNeeds: 'video_composition',
    ingredientOperation: 'text_to_image', composition: 'branded_video', requiresOwnerApproval: true,
    maxDurationSeconds: 15,
  },
  social_post: {
    kind: 'social_post', label: 'Social post', materialType: 'social_post',
    primaryChannel: 'social', defaultDimensions: '1080x1350', mediaNeeds: 'image_ingredient',
    ingredientOperation: 'text_to_image', composition: 'branded_static', requiresOwnerApproval: true,
  },
  promotional_graphic: {
    kind: 'promotional_graphic', label: 'Promotional graphic', materialType: 'promotional_graphic',
    primaryChannel: 'social', defaultDimensions: '1080x1350', mediaNeeds: 'image_ingredient',
    ingredientOperation: 'text_to_image', composition: 'branded_static', requiresOwnerApproval: true,
  },
  website_banner: {
    kind: 'website_banner', label: 'Website banner', materialType: 'website_banner',
    primaryChannel: 'website', defaultDimensions: '1920x640', mediaNeeds: 'image_ingredient',
    ingredientOperation: 'text_to_image', composition: 'branded_static', requiresOwnerApproval: true,
  },
  email_campaign: {
    kind: 'email_campaign', label: 'Email campaign', materialType: 'email_campaign',
    primaryChannel: 'email', defaultDimensions: 'responsive email HTML', mediaNeeds: 'copy',
    ingredientOperation: 'text_generation', composition: 'branded_html', requiresOwnerApproval: true,
  },
  landing_page: {
    kind: 'landing_page', label: 'Landing page', materialType: 'landing_page',
    primaryChannel: 'website', defaultDimensions: 'responsive web page', mediaNeeds: 'copy',
    ingredientOperation: 'text_generation', composition: 'branded_html', requiresOwnerApproval: true,
  },
  article: {
    kind: 'article', label: 'Article', materialType: 'article',
    primaryChannel: 'blog', defaultDimensions: 'responsive article', mediaNeeds: 'copy',
    ingredientOperation: 'text_generation', composition: 'branded_copy', requiresOwnerApproval: true,
  },
  offer_promotion: {
    kind: 'offer_promotion', label: 'Offer promotion', materialType: 'offer_promotion',
    primaryChannel: 'social', defaultDimensions: '1080x1350', mediaNeeds: 'image_ingredient',
    ingredientOperation: 'text_to_image', composition: 'branded_static', requiresOwnerApproval: true,
  },
  retargeting_material: {
    kind: 'retargeting_material', label: 'Retargeting creative', materialType: 'retargeting_material',
    primaryChannel: 'social', defaultDimensions: '1080x1080', mediaNeeds: 'image_ingredient',
    ingredientOperation: 'text_to_image', composition: 'branded_static', requiresOwnerApproval: true,
  },
};

export function isOwnerDeliverableKind(value: unknown): value is OwnerDeliverableKind {
  return typeof value === 'string' && (OWNER_DELIVERABLE_KINDS as readonly string[]).includes(value);
}

export function getDeliverableRoute(value: unknown): DeliverableRoute {
  if (!isOwnerDeliverableKind(value)) {
    throw new Error(`Unsupported owner deliverable kind: ${String(value || 'unknown')}`);
  }
  return DELIVERABLE_ROUTE_REGISTRY[value];
}

export function ownerDeliverableLabel(kind: OwnerDeliverableKind): string {
  return DELIVERABLE_ROUTE_REGISTRY[kind].label;
}
