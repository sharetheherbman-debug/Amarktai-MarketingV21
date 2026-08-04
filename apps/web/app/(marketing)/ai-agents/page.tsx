import Link from 'next/link';

const agents = [
  {
    icon: '✍️',
    name: 'Content Creator',
    role: 'Writes compelling marketing content',
    description:
      'The Content Creator agent generates blog posts, articles, social media content, ad copy, and more. It learns your brand voice and produces content that resonates with your audience.',
    capabilities: [
      'Blog posts and long-form articles',
      'Social media captions and threads',
      'Ad copy for multiple platforms',
      'Product descriptions and landing pages',
      'Email newsletter content',
    ],
    exampleTasks: [
      'Write a 1500-word blog post about AI marketing trends',
      'Create 10 LinkedIn posts for the week',
      'Generate ad copy for a new product launch',
    ],
  },
  {
    icon: '🔍',
    name: 'SEO Specialist',
    role: 'Optimizes for search visibility',
    description:
      'The SEO Specialist agent researches keywords, optimizes content for search engines, and audits your website to ensure maximum visibility in search results.',
    capabilities: [
      'Keyword research and analysis',
      'Content optimization suggestions',
      'Meta tag and schema generation',
      'Competitor SEO analysis',
      'Technical SEO audits',
    ],
    exampleTasks: [
      'Find 50 high-value keywords for our niche',
      'Optimize these 10 blog posts for target keywords',
      'Audit the website for technical SEO issues',
    ],
  },
  {
    icon: '📱',
    name: 'Social Media Manager',
    role: 'Manages your social presence',
    description:
      'The Social Media Manager agent creates platform-specific content, schedules posts at optimal times, engages with your audience, and grows your following across all channels.',
    capabilities: [
      'Platform-specific content creation',
      'Optimal posting schedule management',
      'Audience engagement and replies',
      'Hashtag research and optimization',
      'Performance tracking and reporting',
    ],
    exampleTasks: [
      'Create a week of Instagram content',
      'Schedule tweets for optimal engagement times',
      'Respond to brand mentions and comments',
    ],
  },
  {
    icon: '📧',
    name: 'Email Marketer',
    role: 'Designs and optimizes email campaigns',
    description:
      'The Email Marketer agent designs email campaigns, writes compelling copy, segments your audience, and optimizes send times to maximize open rates and conversions.',
    capabilities: [
      'Email campaign design and copy',
      'Subject line optimization',
      'Audience segmentation',
      'A/B testing strategies',
      'Send time optimization',
    ],
    exampleTasks: [
      'Create a welcome email sequence for new subscribers',
      'Design a product launch email campaign',
      'A/B test subject lines for our newsletter',
    ],
  },
  {
    icon: '📊',
    name: 'Analytics Analyst',
    role: 'Turns data into actionable insights',
    description:
      'The Analytics Analyst agent tracks KPIs, generates reports, identifies trends, and provides data-driven recommendations to improve your marketing performance.',
    capabilities: [
      'KPI tracking and dashboards',
      'Custom report generation',
      'Trend identification and forecasting',
      'Conversion funnel analysis',
      'ROI calculation and attribution',
    ],
    exampleTasks: [
      'Generate a monthly marketing performance report',
      'Identify our top-performing content channels',
      'Analyze the conversion funnel for drop-offs',
    ],
  },
  {
    icon: '🔬',
    name: 'Research Agent',
    role: 'Discovers opportunities and trends',
    description:
      'The Research Agent performs competitor analysis, market research, and trend detection to keep your marketing strategy ahead of the curve.',
    capabilities: [
      'Competitor content analysis',
      'Market trend monitoring',
      'Industry news aggregation',
      'Audience research and personas',
      'Content gap identification',
    ],
    exampleTasks: [
      'Analyze our top 5 competitors’ content strategies',
      'Identify emerging trends in our industry',
      'Research our target audience demographics',
    ],
  },
  {
    icon: '📢',
    name: 'Ad Campaign Manager',
    role: 'Creates and optimizes ad campaigns',
    description:
      'The Ad Campaign Manager agent creates, launches, and optimizes paid advertising campaigns across Google, Facebook, Instagram, and other platforms.',
    capabilities: [
      'Ad creative generation',
      'Audience targeting recommendations',
      'Budget allocation optimization',
      'Bid strategy management',
      'Performance monitoring and alerts',
    ],
    exampleTasks: [
      'Create a Google Ads campaign for our new product',
      'Optimize Facebook ad spend allocation',
      'Generate ad creative variations for A/B testing',
    ],
  },
  {
    icon: '🎨',
    name: 'Brand Voice Agent',
    role: 'Ensures consistent brand messaging',
    description:
      'The Brand Voice Agent defines and maintains your brand voice across all content and channels. It reviews content for consistency and trains other agents on your style.',
    capabilities: [
      'Brand voice guidelines definition',
      'Content review and approval',
      'Style guide enforcement',
      'Tone consistency monitoring',
      'Brand messaging frameworks',
    ],
    exampleTasks: [
      'Create a comprehensive brand voice guide',
      'Review all content for brand consistency',
      'Define messaging pillars for our brand',
    ],
  },
];

export default function AgentsPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Meet Your AI{' '}
              <span className="text-gradient">Marketing Workforce</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400 sm:text-xl">
              Specialized AI agents that handle every aspect of your marketing —
              from content creation to analytics. They work 24/7, learn from
              data, and never miss a deadline.
            </p>
          </div>
        </div>
      </section>

      {/* Agent Grid */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2">
            {agents.map((agent) => (
              <div
                key={agent.name}
                className="rounded-2xl border border-white/[0.06] bg-surface-100 p-8 transition-all hover:border-brand-500/30"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-500/10 text-2xl">
                    {agent.icon}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">
                      {agent.name}
                    </h2>
                    <p className="mt-1 text-sm text-brand-400">{agent.role}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-zinc-400">
                  {agent.description}
                </p>
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Capabilities
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {agent.capabilities.map((cap) => (
                      <li
                        key={cap}
                        className="flex items-start gap-2 text-sm text-zinc-300"
                      >
                        <svg
                          className="mt-0.5 h-4 w-4 shrink-0 text-brand-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                        {cap}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Example Tasks
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {agent.exampleTasks.map((task) => (
                      <li
                        key={task}
                        className="flex items-start gap-2 text-sm text-zinc-400"
                      >
                        <svg
                          className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                          />
                        </svg>
                        {task}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Custom Agent CTA */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-500 px-8 py-16 text-center sm:px-16 sm:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Build your custom agent
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
                Need something specific? Create custom AI agents tailored to
                your unique marketing workflows and requirements.
              </p>
              <Link
                href="/register"
                className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-white px-8 text-sm font-semibold text-brand-600 transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
