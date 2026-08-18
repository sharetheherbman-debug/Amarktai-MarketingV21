'use client';

import Link from 'next/link';
import { useState } from 'react';

const benefits = [
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
    title: 'Autonomous AI Workforce',
    description:
      'A governed AI workforce that plans, creates, reviews, and measures marketing while keeping external publication behind owner approval.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 003 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    title: 'Multi-Channel Mastery',
    description:
      'Coordinate supported social channels, email, SEO, content, and advertising from one measurable workflow.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
    title: 'Data-Driven Decisions',
    description:
      'AI-powered analytics and insights that turn raw data into actionable strategies. Know what works, double down on winners.',
  },
];

const steps = [
  {
    number: '01',
    title: 'Connect Your Channels',
    description: 'Link your social accounts, email platforms, website, and ad accounts in minutes.',
  },
  {
    number: '02',
    title: 'Configure Your AI Workforce',
    description: 'Set your goals, define your brand voice, and choose your marketing strategies.',
  },
  {
    number: '03',
    title: 'Launch Campaigns',
    description: 'AI agents create and deploy marketing content across all your channels automatically.',
  },
  {
    number: '04',
    title: 'Optimize & Scale',
    description: 'AI learns from performance data, improves continuously, and scales what works.',
  },
];

const agents = [
  {
    icon: '✍️',
    name: 'Content Creator',
    description: 'Writes blog posts, articles, social media content, and ad copy tailored to your brand voice.',
  },
  {
    icon: '🔍',
    name: 'SEO Specialist',
    description: 'Researches keywords, optimizes content, and audits your site for maximum search visibility.',
  },
  {
    icon: '📱',
    name: 'Social Media Manager',
    description: 'Creates posts, schedules content, engages with your audience, and grows your following.',
  },
  {
    icon: '📧',
    name: 'Email Marketing',
    description: 'Designs campaigns, writes compelling copy, and optimizes send times for maximum engagement.',
  },
  {
    icon: '📊',
    name: 'Analytics Agent',
    description: 'Tracks KPIs, generates reports, and identifies trends to inform your marketing strategy.',
  },
  {
    icon: '🔬',
    name: 'Research Agent',
    description: 'Performs competitor analysis, market research, and detects emerging trends in your industry.',
  },
];

const channels = [
  'Facebook', 'Instagram', 'X', 'LinkedIn', 'Threads',
  'Pinterest', 'Reddit', 'YouTube', 'Email', 'Blog', 'SEO',
];

const launchSafeguards = [
  {
    name: 'Owner-approved publishing',
    description: 'Final customer-facing copy is delivered only from the exact content version approved by the organization owner.',
  },
  {
    name: 'Evidence before claims',
    description: 'Business facts come from connected application data, approved knowledge, and configured brand context—not invented testimonials.',
  },
  {
    name: 'Control stays with you',
    description: 'Emergency stop, operating windows, credit limits, channel policies, and immutable audit trails govern external actions.',
  },
];

const faqs = [
  {
    question: 'What is EquiProfile Marketing?',
    answer:
      'EquiProfile Marketing is an autonomous growth operating system for campaign planning, governed content creation, SEO, social distribution, email, and analytics.',
  },
  {
    question: 'How does the AI workforce work?',
    answer:
      'Each AI agent is specialized for a specific marketing function. They work autonomously, collaborating through a shared knowledge base of your brand, goals, and performance data. You set the strategy; the agents execute.',
  },
  {
    question: 'How is AI generation provided?',
    answer:
      'Approved generation is routed through vetted processing partners. Credentials and infrastructure stay server-side and never enter customer onboarding.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Absolutely. We use enterprise-grade encryption (AES-256) for data at rest and TLS 1.3 for data in transit. We never use your data to train AI models, and you retain full ownership of all content created.',
  },
  {
    question: 'Can I customize the AI agents?',
    answer:
      'Yes. You can configure each agent\'s behavior, set brand voice guidelines, define content boundaries, and even create custom agents tailored to your specific marketing needs.',
  },
  {
    question: 'What happens if an AI provider goes down?',
    answer:
      'Generation fails closed and records the failure for retry. The platform does not silently route customer data to an unapproved AI provider.',
  },
];

const pricingPlans = [
  {
    name: 'Starter',
    monthlyPrice: 29,
    annualPrice: 23,
    description: 'Perfect for solopreneurs and small teams getting started with AI marketing.',
    features: [
      '5 AI agents',
      '10,000 AI tasks/month',
      '3 projects',
      'Basic analytics',
      'Email support',
      '1 user',
    ],
    cta: 'Start Free Trial',
    popular: false,
  },
  {
    name: 'Professional',
    monthlyPrice: 99,
    annualPrice: 79,
    description: 'For growing businesses that need more power and advanced features.',
    features: [
      '25 AI agents',
      '100,000 AI tasks/month',
      'Unlimited projects',
      'Advanced analytics',
      'Priority support',
      '5 users',
      'API access',
      'Custom branding',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    monthlyPrice: null,
    annualPrice: null,
    description: 'For large organizations with custom requirements and scale.',
    features: [
      'Unlimited everything',
      'Dedicated support',
      'SLA guarantee',
      'SSO & SAML',
      'Custom integrations',
      'On-premise option',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/[0.06]">
      <button
        type="button"
        className="flex w-full items-center justify-between py-5 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-medium text-white sm:text-base">{question}</span>
        <svg
          className={`ml-4 h-5 w-5 shrink-0 text-zinc-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="pb-5">
          <p className="text-sm leading-relaxed text-zinc-400">{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-4 py-1.5 text-sm text-brand-400">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
              Now in public beta
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Your AI Marketing{' '}
              <span className="text-gradient">Operating System</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400 sm:text-xl">
              Deploy an autonomous AI workforce that creates content, manages
              campaigns, optimizes SEO, and grows your business — all from one
              platform.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand-500 px-8 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] sm:w-auto"
              >
                Start Free Trial
              </Link>
              <Link
                href="/features"
                className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/10 px-8 text-sm font-semibold text-white transition-all hover:bg-white/[0.04] sm:w-auto"
              >
                Explore Features
                <svg className="ml-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
            <p className="mt-6 text-sm text-zinc-500">
              Owner-controlled automation with auditable approval boundaries
            </p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Why marketers choose EquiProfile Marketing
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Stop juggling tools. Start deploying agents.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="group rounded-2xl border border-white/[0.06] bg-surface-100 p-8 transition-all hover:border-brand-500/30 hover:bg-surface-200"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 transition-colors group-hover:bg-brand-500/20">
                  {benefit.icon}
                </div>
                <h3 className="mt-6 text-lg font-semibold text-white">
                  {benefit.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              How it works
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              From setup to results in four simple steps.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="text-5xl font-bold text-brand-500/20">
                  {step.number}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Workforce */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Meet your AI workforce
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Specialized agents that handle every aspect of your marketing.
            </p>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <div
                key={agent.name}
                className="group rounded-2xl border border-white/[0.06] bg-surface-100 p-6 transition-all hover:border-brand-500/30"
              >
                <div className="text-3xl">{agent.icon}</div>
                <h3 className="mt-4 text-base font-semibold text-white">
                  {agent.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {agent.description}
                </p>
                <Link
                  href="/ai-agents"
                  className="mt-4 inline-flex items-center gap-1 text-sm text-brand-400 transition-colors hover:text-brand-300"
                >
                  Learn more
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Channels */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              All your channels, one platform
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Connect and automate every channel your audience uses.
            </p>
          </div>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-4">
            {channels.map((channel) => (
              <div
                key={channel}
                className="rounded-xl border border-white/[0.06] bg-surface-100 px-6 py-3 text-sm font-medium text-zinc-300 transition-all hover:border-brand-500/30 hover:text-white"
              >
                {channel}
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-zinc-500">
            And 50+ more integrations coming soon
          </p>
        </div>
      </section>

      {/* Governed generation */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Governed AI generation
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              One approved AI route, consistent governance, and clear credit controls.
            </p>
          </div>
          <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row">
            <div className="rounded-2xl border border-white/[0.06] bg-surface-100 px-8 py-6 text-center">
              <div className="text-lg font-semibold text-white">Approved generation route</div>
              <div className="mt-1 text-sm text-zinc-500">Governed AI generation</div>
            </div>
          </div>
          <p className="mt-8 text-center text-sm text-zinc-500">
            Generation fails closed when the approved route is unavailable; no unapproved fallback is used.
          </p>
        </div>
      </section>

      {/* Verifiable launch safeguards */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Built around verifiable safeguards
            </h2>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {launchSafeguards.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-white/[0.06] bg-surface-100 p-8"
              >
                <div className="text-sm font-semibold text-brand-400">{t.name}</div>
                <p className="mt-4 text-sm leading-relaxed text-zinc-300">{t.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Frequently asked questions
            </h2>
          </div>
          <div className="mt-12">
            {faqs.map((faq) => (
              <FAQItem key={faq.question} {...faq} />
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Start free. Scale as you grow.
            </p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-lg border border-white/[0.06] bg-surface-100 p-1">
              <button
                type="button"
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  !annual ? 'bg-white/[0.08] text-white' : 'text-zinc-400'
                }`}
                onClick={() => setAnnual(false)}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  annual ? 'bg-white/[0.08] text-white' : 'text-zinc-400'
                }`}
                onClick={() => setAnnual(true)}
              >
                Annual
                <span className="ml-1.5 text-xs text-brand-400">-20%</span>
              </button>
            </div>
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl border p-8 ${
                  plan.popular
                    ? 'border-brand-500/50 bg-surface-100'
                    : 'border-white/[0.06] bg-surface-100'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <div className="mt-4">
                  {plan.monthlyPrice !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-white">
                        ${annual ? plan.annualPrice : plan.monthlyPrice}
                      </span>
                      <span className="text-sm text-zinc-500">/mo</span>
                    </div>
                  ) : (
                    <div className="text-4xl font-bold text-white">Custom</div>
                  )}
                </div>
                <p className="mt-4 text-sm text-zinc-400">{plan.description}</p>
                <ul className="mt-8 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                      <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.monthlyPrice !== null ? '/register' : '/contact'}
                  className={`mt-8 flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold transition-all ${
                    plan.popular
                      ? 'bg-brand-500 text-white hover:bg-brand-400'
                      : 'border border-white/10 text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="text-sm text-brand-400 transition-colors hover:text-brand-300"
            >
              View full pricing details →
            </Link>
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
                Ready to transform your marketing?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
                Start your free trial today. No credit card required.
              </p>
              <Link
                href="/register"
                className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-white px-8 text-sm font-semibold text-brand-600 transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
