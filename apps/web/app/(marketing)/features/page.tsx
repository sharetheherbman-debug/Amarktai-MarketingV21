'use client';

import Link from 'next/link';
import { useState } from 'react';

interface Feature {
  title: string;
  description: string;
  status: 'available' | 'coming-soon';
}

interface FeatureCategory {
  title: string;
  description: string;
  icon: React.ReactNode;
  features: Feature[];
}

const featureCategories: FeatureCategory[] = [
  {
    title: 'AI Content Creation',
    description:
      'Generate high-quality marketing content at scale with AI that understands your brand voice.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 01-2.25 2.25M16.5 7.5V18a2.25 2.25 0 002.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 002.25 2.25h13.5M6 7.5h3v3H6v-3z" />
      </svg>
    ),
    features: [
      {
        title: 'Blog Post Generation',
        description: 'Create SEO-optimized blog posts, articles, and long-form content in minutes.',
        status: 'available',
      },
      {
        title: 'Social Media Content',
        description: 'Generate platform-specific posts for Twitter, LinkedIn, Instagram, and more.',
        status: 'available',
      },
      {
        title: 'Ad Copy Creation',
        description: 'Write compelling ad copy for Google, Facebook, Instagram, and other platforms.',
        status: 'available',
      },
      {
        title: 'Email Campaign Content',
        description: 'Craft engaging email copy, subject lines, and newsletter content.',
        status: 'available',
      },
    ],
  },
  {
    title: 'SEO Optimization',
    description:
      'Dominate search rankings with AI-powered SEO tools that optimize your entire web presence.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
    features: [
      {
        title: 'Keyword Research',
        description: 'Discover high-value keywords, analyze search volume, and identify content gaps.',
        status: 'available',
      },
      {
        title: 'Content Optimization',
        description: 'Real-time suggestions to improve content SEO score and search visibility.',
        status: 'available',
      },
      {
        title: 'Technical SEO Audits',
        description: 'Automated site audits that identify and fix technical SEO issues.',
        status: 'coming-soon',
      },
      {
        title: 'Backlink Analysis',
        description: 'Monitor your backlink profile and discover new link-building opportunities.',
        status: 'coming-soon',
      },
    ],
  },
  {
    title: 'Social Media Management',
    description:
      'Manage all your social channels from one place with AI that understands each platform.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.2 48.2 0 005.22-.253c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
    features: [
      {
        title: 'Content Scheduling',
        description: 'Schedule posts across all platforms with AI-optimized timing.',
        status: 'available',
      },
      {
        title: 'Audience Engagement',
        description: 'AI-powered responses and engagement to grow your community.',
        status: 'available',
      },
      {
        title: 'Multi-Platform Analytics',
        description: 'Unified analytics dashboard showing performance across all channels.',
        status: 'available',
      },
      {
        title: 'Social Listening',
        description: 'Monitor brand mentions, trends, and conversations in your industry.',
        status: 'coming-soon',
      },
    ],
  },
  {
    title: 'Email Marketing',
    description:
      'Build, send, and optimize email campaigns with AI that learns what works for your audience.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
    features: [
      {
        title: 'Automated Sequences',
        description: 'Build intelligent drip campaigns that adapt based on subscriber behavior.',
        status: 'available',
      },
      {
        title: 'A/B Testing',
        description: 'Test subject lines, content, and send times with AI-powered optimization.',
        status: 'available',
      },
      {
        title: 'Personalization',
        description: 'Dynamic content personalization based on subscriber data and preferences.',
        status: 'available',
      },
      {
        title: 'Deliverability Optimization',
        description: 'AI monitors and improves your email deliverability and sender reputation.',
        status: 'coming-soon',
      },
    ],
  },
  {
    title: 'Analytics & Reporting',
    description:
      'Turn data into decisions with AI-powered analytics that surface the insights that matter.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
    features: [
      {
        title: 'Real-Time Dashboards',
        description: 'Live dashboards showing KPIs, trends, and campaign performance.',
        status: 'available',
      },
      {
        title: 'Custom Reports',
        description: 'Build custom reports with drag-and-drop simplicity. Export in any format.',
        status: 'available',
      },
      {
        title: 'Attribution Modeling',
        description: 'Multi-touch attribution to understand which channels drive conversions.',
        status: 'coming-soon',
      },
      {
        title: 'Predictive Analytics',
        description: 'AI-powered forecasting that predicts trends and recommends actions.',
        status: 'coming-soon',
      },
    ],
  },
  {
    title: 'Campaign Automation',
    description:
      'Build complex marketing workflows with a visual builder and AI-powered optimization.',
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    features: [
      {
        title: 'Visual Workflow Builder',
        description: 'Drag-and-drop interface to build complex marketing automation workflows.',
        status: 'coming-soon',
      },
      {
        title: 'Smart Triggers',
        description: 'Event-based triggers that launch campaigns based on user behavior.',
        status: 'coming-soon',
      },
      {
        title: 'Campaign Scheduling',
        description: 'Schedule campaigns with AI-optimized timing for maximum engagement.',
        status: 'available',
      },
      {
        title: 'Cross-Channel Orchestration',
        description: 'Coordinate campaigns across email, social, ads, and more from one workflow.',
        status: 'coming-soon',
      },
    ],
  },
];

function FeatureStatus({ status }: { status: 'available' | 'coming-soon' }) {
  if (status === 'coming-soon') {
    return (
      <span className="inline-flex items-center rounded-full bg-accent-500/10 px-2 py-0.5 text-xs font-medium text-accent-400">
        Coming Soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-400">
      Available
    </span>
  );
}

export default function FeaturesPage() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Powerful Features for{' '}
              <span className="text-gradient">Modern Marketing</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400 sm:text-xl">
              Everything you need to build, launch, and optimize marketing
              campaigns — powered by AI agents that never sleep.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Categories */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-4">
            {featureCategories.map((category, index) => (
              <div
                key={category.title}
                className="overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-100"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-6 py-5 text-left sm:px-8"
                  onClick={() =>
                    setExpandedIndex(expandedIndex === index ? null : index)
                  }
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
                      {category.icon}
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        {category.title}
                      </h2>
                      <p className="mt-0.5 text-sm text-zinc-500">
                        {category.description}
                      </p>
                    </div>
                  </div>
                  <svg
                    className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${
                      expandedIndex === index ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {expandedIndex === index && (
                  <div className="border-t border-white/[0.06] px-6 pb-6 pt-4 sm:px-8">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {category.features.map((feature) => (
                        <div
                          key={feature.title}
                          className="rounded-xl border border-white/[0.06] bg-surface p-5"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-white">
                              {feature.title}
                            </h3>
                            <FeatureStatus status={feature.status} />
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                            {feature.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-500 px-8 py-16 text-center sm:px-16 sm:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                See what AI can do for your marketing
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
                Start building your AI marketing workforce today.
              </p>
              <Link
                href="/register"
                className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-white px-8 text-sm font-semibold text-brand-600 transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
