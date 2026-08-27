export const EQUIPROFILE_STARTER_PACK = {
  slug: 'equiprofile-marketing-starter-v1',
  version: 1,
  name: 'EquiProfile Marketing Starter Pack',
  description: 'Truthful, brandable equestrian marketing structures for EquiProfile tenants.',
} as const;

export type LibraryItemKind =
  | 'copy_template' | 'social_post_template' | 'social_ad_template' | 'image_ad_layout'
  | 'carousel_layout' | 'story_layout' | 'reel_layout' | 'promotional_graphic_layout'
  | 'website_banner_layout' | 'email_template' | 'landing_page_template' | 'article_template'
  | 'offer_template' | 'retargeting_template' | 'video_recipe' | 'campaign_pack'
  | 'stock_photo_reference' | 'stock_video_reference' | 'uploaded_asset' | 'generated_asset' | 'brand_asset';

export type StarterPackItem = {
  itemKey: string;
  kind: LibraryItemKind;
  category: string;
  name: string;
  description: string;
  tags: string[];
  platforms: string[];
  channel?: string;
  aspectRatio?: string;
  dimensions?: string;
  definition: Record<string, unknown>;
};

const themes = [
  ['horse-profile', 'Horse profile education'], ['horse-care', 'Horse care reminder'],
  ['training', 'Training progress'], ['stable-management', 'Stable management'],
  ['academy', 'Academy learning'], ['shop', 'Shop product discovery'],
  ['events', 'Events and competitions'], ['owner-education', 'Horse-owner education'],
  ['feature-education', 'Feature education'], ['onboarding', 'New-user onboarding'],
  ['professional-services', 'Professional services'], ['team-communication', 'Stable and team communication'],
  ['seasonal', 'Seasonal planning'], ['subscriptions', 'Subscription awareness'],
  ['brand-awareness', 'Brand awareness'], ['product-promotion', 'Product promotion'],
] as const;

const platforms = ['instagram', 'facebook', 'linkedin', 'x', 'pinterest'];
const dimensions = ['1080x1080', '1080x1350', '1080x1920', '1200x628', '1920x640'];

function themeAt(index: number) {
  return themes[index % themes.length];
}

function copySafety() {
  return {
    factual_sources: ['business_brain', 'brand_dna', 'owner_input'],
    prohibited_without_source: ['statistics', 'testimonials', 'medical claims', 'prices', 'discounts', 'results', 'accreditations'],
    placeholders_only: true,
  };
}

function layout(index: number, format: string) {
  const size = dimensions[index % dimensions.length];
  const [width, height] = size.split('x').map(Number);
  return {
    schema: 'marketing_layout_v1',
    format,
    variants: dimensions.map((value) => ({ dimensions: value, aspect_ratio: value === '1080x1080' ? '1:1' : value === '1080x1350' ? '4:5' : value === '1080x1920' ? '9:16' : value === '1200x628' ? '1.91:1' : '3:1' })),
    canvas: { width, height },
    slots: {
      background_image: { required: true, safe_crop: 'cover' },
      secondary_image: { required: false, safe_crop: 'cover' },
      logo: { required: true, anchor: index % 2 ? 'top-left' : 'top-right' },
      headline: { max_lines: 3 }, subheadline: { max_lines: 4 }, cta: { max_lines: 1 },
    },
    brand_tokens: ['brand_name', 'primary_color', 'secondary_color', 'accent_color', 'font', 'logo_url'],
    overlay: { style: index % 3 === 0 ? 'bottom-gradient' : index % 3 === 1 ? 'side-panel' : 'soft-card', opacity: 0.78 },
    safe_areas: { top: 0.08, right: 0.07, bottom: 0.1, left: 0.07 },
    alignment: index % 2 ? 'left' : 'center', padding: 0.07,
    copy: copySafety(),
  };
}

function videoRecipe(index: number, organic: boolean) {
  const scenePurposes = organic
    ? ['hook', 'education', 'example', 'secondary value', 'CTA/end card']
    : ['hook', 'problem', 'benefit', 'product/service', 'CTA/end card'];
  const sceneCount = 2 + (index % 4);
  return {
    schema: 'economical_video_recipe_v1', production_mode: 'economical_short_form_video',
    premium_text_to_video_default: false, duration_seconds: organic ? 20 : 15,
    scenes: scenePurposes.slice(0, sceneCount).map((purpose, sceneIndex) => ({
      purpose, duration_seconds: organic ? 4 : 3,
      asset_selection: { approved_only: true, tenant_only: true, preferred_sources: ['tenant_owned', 'tenant_approved', 'stock'] },
      stock_search_tags: [themeAt(index)[0], 'equestrian', purpose.replace(/\s+/g, '-')],
      preferred_asset_ids: [], caption: `{{verified_${purpose.replace(/\W+/g, '_')}_copy}}`,
      transition: sceneIndex % 2 ? 'crossfade' : 'gentle-slide', crop: sceneIndex % 2 ? 'portrait-safe' : 'centre-safe',
      logo: { visible: sceneIndex === 0 || sceneIndex === sceneCount - 1, position: 'top-right' },
    })),
    end_card: { brand_name: '{{brand_name}}', cta: '{{verified_cta}}', logo: '{{brand_logo}}' },
    copy: copySafety(),
  };
}

function makeItems(count: number, kind: LibraryItemKind, category: string, label: string, definition: (index: number) => Record<string, unknown>, extra: Partial<StarterPackItem> = {}): StarterPackItem[] {
  return Array.from({ length: count }, (_, index) => {
    const [themeKey, themeLabel] = themeAt(index);
    return {
      itemKey: `${category}-${String(index + 1).padStart(3, '0')}`,
      kind, category, name: `${themeLabel} ${label} ${index + 1}`,
      description: `Brandable ${label.toLowerCase()} structure for ${themeLabel.toLowerCase()}, using verified tenant facts and owner-supplied claims only.`,
      tags: ['equiprofile', 'equestrian', themeKey, category],
      platforms: extra.platforms || [], channel: extra.channel,
      aspectRatio: extra.aspectRatio, dimensions: extra.dimensions,
      definition: definition(index),
    };
  });
}

export const EQUIPROFILE_STARTER_EXPECTATIONS = {
  social_posts: 30, static_advertising_layouts: 24, story_reel_layouts: 12,
  carousel_layouts: 12, promotional_layouts: 12, website_banner_layouts: 10,
  email_templates: 12, landing_pages: 8, articles: 15, offers: 12,
  retargeting: 8, short_video_ads: 15, organic_videos: 10, campaign_packs: 12,
  hooks: 50, ctas: 30, captions: 50,
  bonus_brand_briefs: 10,
} as const;

export function buildEquiprofileStarterPackItems(): StarterPackItem[] {
  const items: StarterPackItem[] = [];
  items.push(...makeItems(30, 'social_post_template', 'social-post', 'social post', (i) => ({
    schema: 'content_template_v1', platform: platforms[i % platforms.length],
    structure: ['{{verified_hook}}', '{{verified_context}}', '{{useful_takeaway}}', '{{verified_cta}}'], copy: copySafety(),
  }), { platforms, channel: 'social' }));
  items.push(...makeItems(24, 'image_ad_layout', 'static-ad', 'static advertising layout', (i) => layout(i, 'static_ad'), { platforms, channel: 'advertising', dimensions: 'multi-size' }));
  items.push(...makeItems(12, 'story_layout', 'story-reel', 'story/reel layout', (i) => layout(i, i % 2 ? 'reel' : 'story'), { platforms: ['instagram', 'facebook'], channel: 'social', aspectRatio: '9:16', dimensions: '1080x1920' }));
  items.push(...makeItems(12, 'carousel_layout', 'carousel', 'carousel layout', (i) => ({ ...layout(i, 'carousel'), slides: 3 + (i % 5), slide_roles: ['hook', 'education', 'benefit', 'CTA'] }), { platforms: ['instagram', 'facebook', 'linkedin'], channel: 'social', dimensions: '1080x1080' }));
  items.push(...makeItems(12, 'promotional_graphic_layout', 'promotional', 'promotional layout', (i) => layout(i, 'promotional_graphic'), { platforms, channel: 'advertising', dimensions: 'multi-size' }));
  items.push(...makeItems(10, 'website_banner_layout', 'website-banner', 'website banner layout', (i) => layout(i, 'website_banner'), { channel: 'website', dimensions: '1920x640' }));
  items.push(...makeItems(12, 'email_template', 'email', 'email template', (i) => ({ schema: 'content_template_v1', sections: ['subject', 'preheader', 'verified opening', i % 2 ? 'education' : 'benefits', 'verified CTA'], html_brandable: true, copy: copySafety() }), { channel: 'email' }));
  items.push(...makeItems(8, 'landing_page_template', 'landing-page', 'landing-page structure', (i) => ({ schema: 'content_template_v1', sections: ['verified headline', 'owner-approved value', 'features from Business Brain', i % 2 ? 'FAQ' : 'process', 'verified CTA'], copy: copySafety() }), { channel: 'website' }));
  items.push(...makeItems(15, 'article_template', 'article', 'article structure', (i) => ({ schema: 'content_template_v1', sections: ['verified title', 'reader question', 'sourced explanation', `${3 + (i % 3)} practical sections`, 'responsible summary', 'verified CTA'], copy: copySafety() }), { channel: 'blog' }));
  items.push(...makeItems(12, 'offer_template', 'offer', 'offer/promotion template', () => ({ schema: 'content_template_v1', required_facts: ['explicit offer', 'explicit terms', 'owner-approved CTA'], conditional: 'Do not produce promotional claims when an explicit offer is absent.', copy: copySafety() }), { channel: 'multi_channel' }));
  items.push(...makeItems(8, 'retargeting_template', 'retargeting', 'retargeting template', () => ({ schema: 'content_template_v1', structure: ['context reminder', 'verified value', 'owner-approved CTA'], prohibited: ['invented urgency', 'invented discount', 'unverified result'], copy: copySafety() }), { channel: 'advertising' }));
  items.push(...makeItems(15, 'video_recipe', 'short-video-ad', 'short video advertising recipe', (i) => videoRecipe(i, false), { platforms, channel: 'advertising', aspectRatio: '9:16' }));
  items.push(...makeItems(10, 'video_recipe', 'organic-video', 'organic/social video recipe', (i) => videoRecipe(i, true), { platforms, channel: 'social', aspectRatio: '9:16' }));
  items.push(...makeItems(12, 'campaign_pack', 'campaign-pack', 'complete campaign pack', (i) => ({
    schema: 'campaign_pack_v1', objective: `{{owner_approved_${themeAt(i)[0]}_objective}}`,
    deliverables: [{ kind: 'social_post', quantity: 4 }, { kind: 'image_ad', quantity: 3 }, { kind: 'email_campaign', quantity: 1 }, { kind: 'article', quantity: 1 }, { kind: 'video_ad', quantity: 1 }],
    calendar_days: 30, approval_required: true, publish_automatically: false, copy: copySafety(),
  }), { channel: 'multi_channel' }));
  items.push(...makeItems(50, 'copy_template', 'hook', 'hook/headline structure', (i) => ({ schema: 'copy_structure_v1', pattern: i % 3 === 0 ? '{{audience_question}} — {{verified_answer_direction}}' : i % 3 === 1 ? '{{verified_benefit}} without {{audience_objection}}' : '{{season_or_context}}: {{verified_useful_next_step}}', copy: copySafety() })));
  items.push(...makeItems(30, 'copy_template', 'cta', 'CTA structure', (i) => ({ schema: 'copy_structure_v1', pattern: i % 3 === 0 ? '{{explore_verified_destination}}' : i % 3 === 1 ? '{{owner_approved_action}}' : '{{learn_more_about_verified_topic}}', copy: copySafety() })));
  items.push(...makeItems(50, 'copy_template', 'caption', 'caption/content structure', (i) => ({ schema: 'copy_structure_v1', pattern: ['{{verified_hook}}', '{{verified_context}}', `{{useful_point_${1 + (i % 4)}}}`, '{{verified_cta}}'], copy: copySafety() })));
  items.push(...makeItems(10, 'copy_template', 'brand-brief', 'brand brief structure', (i) => ({
    schema: 'brand_brief_v1', purpose: ['campaign direction','visual direction','audience framing','offer validation','channel adaptation'][i % 5],
    required_inputs: ['{{verified_business_fact}}','{{owner_approved_audience}}','{{brand_dna_tokens}}','{{owner_approved_cta}}'],
    output_status: 'draft', approval_required: true, copy: copySafety(),
  })));
  return items;
}

export const EQUIPROFILE_STARTER_ITEM_COUNT = buildEquiprofileStarterPackItems().length;
