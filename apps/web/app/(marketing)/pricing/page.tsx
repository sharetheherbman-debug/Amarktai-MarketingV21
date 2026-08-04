'use client';

import Link from 'next/link';
import { useState } from 'react';

const plans = [
  {
    name: 'Starter',
    monthlyPrice: 29,
    annualPrice: 23,
    description: 'Perfect for solopreneurs and small teams getting started with AI marketing.',
    features: [
      { label: '5 AI agents', included: true },
      { label: '10,000 AI tasks/month', included: true },
      { label: '3 projects', included: true },
      { label: 'Basic analytics', included: true },
      { label: 'Email support', included: true },
      { label: '1 user', included: true },
      { label: 'Advanced analytics', included: false },
      { label: 'Priority support', included: false },
      { label: 'API access', included: false },
      { label: 'Custom branding', included: false },
      { label: 'SSO & SAML', included: false },
    ],
    cta: 'Start Free Trial',
    ctaHref: '/register',
    popular: false,
  },
  {
    name: 'Professional',
    monthlyPrice: 99,
    annualPrice: 79,
    description: 'For growing businesses that need more power and advanced features.',
    features: [
      { label: '25 AI agents', included: true },
      { label: '100,000 AI tasks/month', included: true },
      { label: 'Unlimited projects', included: true },
      { label: 'Advanced analytics', included: true },
      { label: 'Priority support', included: true },
      { label: '5 users', included: true },
      { label: 'API access', included: true },
      { label: 'Custom branding', included: true },
      { label: 'SSO & SAML', included: false },
      { label: 'Custom integrations', included: false },
      { label: 'On-premise option', included: false },
    ],
    cta: 'Start Free Trial',
    ctaHref: '/register',
    popular: true,
  },
  {
    name: 'Enterprise',
    monthlyPrice: null,
    annualPrice: null,
    description: 'For large organizations with custom requirements and scale.',
    features: [
      { label: 'Unlimited AI agents', included: true },
      { label: 'Unlimited AI tasks', included: true },
      { label: 'Unlimited projects', included: true },
      { label: 'Advanced analytics', included: true },
      { label: 'Dedicated support', included: true },
      { label: 'Unlimited users', included: true },
      { label: 'API access', included: true },
      { label: 'Custom branding', included: true },
      { label: 'SSO & SAML', included: true },
      { label: 'Custom integrations', included: true },
      { label: 'On-premise option', included: true },
    ],
    cta: 'Contact Sales',
    ctaHref: '/contact',
    popular: false,
  },
];

const faqs = [
  {
    question: 'Can I change plans at any time?',
    answer:
      'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we\'ll prorate the difference.',
  },
  {
    question: 'What happens when I reach my task limit?',
    answer:
      'You\'ll receive a notification when you reach 80% of your limit. You can upgrade your plan or purchase additional task packs. Your agents will never stop working unexpectedly.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Yes! All plans come with a 14-day free trial. No credit card required. You can explore all features before committing.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards (Visa, Mastercard, American Express), as well as wire transfers for Enterprise plans.',
  },
  {
    question: 'Can I cancel at any time?',
    answer:
      'Absolutely. You can cancel your subscription at any time from your dashboard. You\'ll continue to have access until the end of your billing period.',
  },
  {
    question: 'Do you offer discounts for nonprofits or education?',
    answer:
      'Yes, we offer special pricing for nonprofits, educational institutions, and open-source projects. Contact our sales team for details.',
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
        <span className="text-sm font-medium text-white sm:text-base">
          {question}
        </span>
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

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Simple,{' '}
              <span className="text-gradient">Transparent Pricing</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400 sm:text-xl">
              Start free, scale as you grow. No hidden fees, no surprises.
            </p>
            <div className="mt-8 inline-flex items-center gap-3 rounded-lg border border-white/[0.06] bg-surface-100 p-1">
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
                <span className="ml-1.5 text-xs text-brand-400">Save 20%</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-8 ${
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
                <h3 className="text-lg font-semibold text-white">
                  {plan.name}
                </h3>
                <div className="mt-4">
                  {plan.monthlyPrice !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-bold text-white">
                        ${annual ? plan.annualPrice : plan.monthlyPrice}
                      </span>
                      <span className="text-sm text-zinc-500">/mo</span>
                    </div>
                  ) : (
                    <div className="text-5xl font-bold text-white">Custom</div>
                  )}
                  {annual && plan.monthlyPrice !== null && (
                    <p className="mt-1 text-sm text-zinc-500">
                      Billed ${plan.annualPrice! * 12}/year (save $
                      {(plan.monthlyPrice! - plan.annualPrice!) * 12})
                    </p>
                  )}
                </div>
                <p className="mt-4 text-sm text-zinc-400">{plan.description}</p>
                <ul className="mt-8 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li
                      key={f.label}
                      className={`flex items-start gap-2 text-sm ${
                        f.included ? 'text-zinc-300' : 'text-zinc-600'
                      }`}
                    >
                      {f.included ? (
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
                      ) : (
                        <svg
                          className="mt-0.5 h-4 w-4 shrink-0 text-zinc-700"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 12h-15"
                          />
                        </svg>
                      )}
                      {f.label}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.ctaHref}
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
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Feature Comparison
            </h2>
            <p className="mt-4 text-zinc-400">
              See exactly what&apos;s included in each plan.
            </p>
          </div>
          <div className="mt-12 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="pb-4 text-left text-sm font-medium text-zinc-500">
                    Feature
                  </th>
                  <th className="pb-4 text-center text-sm font-medium text-zinc-500">
                    Starter
                  </th>
                  <th className="pb-4 text-center text-sm font-medium text-brand-400">
                    Professional
                  </th>
                  <th className="pb-4 text-center text-sm font-medium text-zinc-500">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {[
                  ['AI Agents', '5', '25', 'Unlimited'],
                  ['AI Tasks/month', '10,000', '100,000', 'Unlimited'],
                  ['Projects', '3', 'Unlimited', 'Unlimited'],
                  ['Users', '1', '5', 'Unlimited'],
                  ['Analytics', 'Basic', 'Advanced', 'Advanced'],
                  ['Support', 'Email', 'Priority', 'Dedicated'],
                  ['API Access', '—', '✓', '✓'],
                  ['Custom Branding', '—', '✓', '✓'],
                  ['SSO & SAML', '—', '—', '✓'],
                  ['Custom Integrations', '—', '—', '✓'],
                  ['On-Premise Option', '—', '—', '✓'],
                  ['SLA Guarantee', '—', '—', '✓'],
                ].map(([feature, starter, pro, enterprise]) => (
                  <tr key={feature}>
                    <td className="py-4 text-sm text-zinc-300">{feature}</td>
                    <td className="py-4 text-center text-sm text-zinc-400">
                      {starter}
                    </td>
                    <td className="py-4 text-center text-sm text-white">
                      {pro}
                    </td>
                    <td className="py-4 text-center text-sm text-zinc-400">
                      {enterprise}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Pricing FAQ
            </h2>
          </div>
          <div className="mt-12">
            {faqs.map((faq) => (
              <FAQItem key={faq.question} {...faq} />
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise CTA */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-500 px-8 py-16 text-center sm:px-16 sm:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Need a custom solution?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
                Let&apos;s talk about your requirements. We offer custom
                pricing, dedicated support, and tailored solutions for
                enterprises.
              </p>
              <Link
                href="/contact"
                className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-white px-8 text-sm font-semibold text-brand-600 transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
