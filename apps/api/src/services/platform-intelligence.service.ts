export interface PlatformGuidance {
  platform: string;
  aliases: string[];
  principles: string[];
  qualityChecks: string[];
  optimizationSignals: string[];
  sources: string[];
}

export const PLATFORM_INTELLIGENCE_UPDATED_AT = '2026-08-11';

const GUIDANCE: PlatformGuidance[] = [
  {
    platform: 'Google Ads Search',
    aliases: ['google', 'google ads', 'search ads', 'paid search'],
    principles: [
      'Optimize for auction-time usefulness: expected click-through rate, ad relevance and landing-page experience all contribute to ad quality.',
      'Ad Rank also depends on bid, thresholds, competition, search context and the expected impact of assets/formats.',
      'Treat the reported 1-10 Quality Score as a diagnostic, not as a direct auction input or primary KPI.',
    ],
    qualityChecks: [
      'Match ad language tightly to search intent and keep the promise consistent on the landing page.',
      'Use specific, truthful offers and assets; never invent proof, guarantees, prices or certifications.',
      'Evaluate the landing page for relevance, usefulness, navigation and message match before recommending spend.',
    ],
    optimizationSignals: ['CTR', 'conversion rate', 'cost per conversion', 'search-term intent', 'landing-page engagement', 'asset performance'],
    sources: [
      'https://support.google.com/google-ads/answer/1722087',
      'https://support.google.com/google-ads/answer/6167118',
      'https://support.google.com/google-ads/answer/6366577',
    ],
  },
  {
    platform: 'YouTube',
    aliases: ['youtube', 'youtube shorts'],
    principles: [
      'Optimize for the audience rather than trying to game an algorithm.',
      'Use the three public performance buckets: appeal (choose to watch), engagement (keep watching) and satisfaction (enjoyed the content).',
      'Recommendations are personalized from signals including watch/search history, subscriptions, likes/dislikes, explicit feedback and satisfaction surveys.',
    ],
    qualityChecks: [
      'Make thumbnail/title/hook compelling but faithful to the actual video.',
      'Front-load viewer value, remove slow introductions and maintain narrative progression.',
      'End with a useful next action without sacrificing viewer satisfaction for clickbait.',
    ],
    optimizationSignals: ['impression click-through rate', 'viewer retention', 'average percentage viewed', 'watch time', 'satisfaction/feedback', 'conversions'],
    sources: [
      'https://support.google.com/youtube/answer/16559650',
      'https://support.google.com/youtube/answer/16089387',
    ],
  },
  {
    platform: 'TikTok',
    aliases: ['tiktok', 'tik tok'],
    principles: [
      'For You recommendations are personalized from interests and engagement; public examples include liking, commenting, sharing and watching similar posts.',
      'Video information such as captions, sounds and hashtags helps describe content, while strong behavioral interest signals can carry more weight than device/account settings.',
      'Completion/continued watching is a strong interest signal, so creative should earn attention quickly and sustain it honestly.',
    ],
    qualityChecks: [
      'Use a native vertical composition and communicate the value or curiosity gap immediately.',
      'Avoid generic repost-style creative; make the opening frame, captions and pacing specific to the audience.',
      'Prefer useful entertainment, demonstration or proof over engagement bait.',
    ],
    optimizationSignals: ['hold rate', 'completion rate', 'rewatches', 'shares', 'saves', 'comments', 'profile/site actions', 'conversions'],
    sources: [
      'https://support.tiktok.com/en/getting-started/for-you/test-for-you',
      'https://newsroom.tiktok.com/how-tiktok-recommends-videos-for-you',
    ],
  },
  {
    platform: 'LinkedIn',
    aliases: ['linkedin', 'linked in'],
    principles: [
      'Prioritize authentic professional value, relevance, personalization and timeliness.',
      'LinkedIn says it is reducing generic recycled content, engagement bait and inauthentic automated conversations.',
      'Create material that teaches, demonstrates expertise or advances a useful professional discussion rather than chasing empty reactions.',
    ],
    qualityChecks: [
      'State a concrete professional insight or problem early.',
      'Use evidence, examples or first-hand context where available and never fabricate authority.',
      'Avoid artificial comment prompts and generic motivational filler.',
    ],
    optimizationSignals: ['qualified engagement', 'dwell/reading behavior', 'saves', 'meaningful comments', 'profile/company actions', 'lead/conversion events'],
    sources: [
      'https://news.linkedin.com/2026/ImprovingTheFeed',
      'https://www.linkedin.com/help/linkedin/answer/a7142408',
    ],
  },
  {
    platform: 'Meta / Facebook / Instagram',
    aliases: ['meta', 'facebook', 'instagram', 'reels'],
    principles: [
      'Optimize for relevant people and real outcomes, not superficial engagement or attempts to reverse-engineer proprietary ranking logic.',
      'Meta describes recommendation systems that learn from interactions and continuously personalize distribution; high-quality useful creative needs to earn meaningful engagement.',
      'Diversify creative hypotheses and learn from actual account-level reach, engagement, conversion and cost data instead of assuming one format wins permanently.',
    ],
    qualityChecks: [
      'Make the first frame and first line clear, useful and audience-specific.',
      'Use multiple genuine creative angles rather than cosmetic duplicates.',
      'Keep claims, destination experience and conversion event measurement consistent.',
    ],
    optimizationSignals: ['reach', 'thumb-stop/hold behavior', 'meaningful engagement', 'click-through rate', 'conversion rate', 'cost per result', 'creative fatigue'],
    sources: [
      'https://ai.meta.com/blog/ai-unconnected-content-recommendations-facebook-instagram/',
      'https://ai.meta.com/learn/ai-creativity/how-to-use-ai-to-create-a-social-media-content-strategy/',
    ],
  },
];

function normalizeRequested(platforms?: string[]): PlatformGuidance[] {
  if (!platforms || platforms.length === 0) return GUIDANCE;
  const requested = platforms.map((item) => item.trim().toLowerCase()).filter(Boolean);
  return GUIDANCE.filter((entry) => requested.some((needle) => (
    entry.platform.toLowerCase().includes(needle) || entry.aliases.some((alias) => alias.includes(needle) || needle.includes(alias))
  )));
}

export function getPlatformGuidance(platforms?: string[]): PlatformGuidance[] {
  return normalizeRequested(platforms).map((entry) => ({ ...entry, aliases: [...entry.aliases], principles: [...entry.principles], qualityChecks: [...entry.qualityChecks], optimizationSignals: [...entry.optimizationSignals], sources: [...entry.sources] }));
}

export function getPlatformIntelligenceContext(platforms?: string[]): string {
  const selected = normalizeRequested(platforms);
  if (selected.length === 0) return '';
  const lines = [
    `PLATFORM STRATEGY INTELLIGENCE (public guidance snapshot ${PLATFORM_INTELLIGENCE_UPDATED_AT}):`,
    'Use these as evidence-informed creative/optimization principles, not as claims of access to proprietary ranking algorithms. Re-learn from the connected account’s real performance data.',
  ];
  for (const entry of selected) {
    lines.push(`\n${entry.platform}:`);
    entry.principles.forEach((item) => lines.push(`- Principle: ${item}`));
    entry.qualityChecks.forEach((item) => lines.push(`- Quality check: ${item}`));
    lines.push(`- Optimize from observed signals: ${entry.optimizationSignals.join(', ')}.`);
  }
  return lines.join('\n');
}

export default { getPlatformGuidance, getPlatformIntelligenceContext, PLATFORM_INTELLIGENCE_UPDATED_AT };
