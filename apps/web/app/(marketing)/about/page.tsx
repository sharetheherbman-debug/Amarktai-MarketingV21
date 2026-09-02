import Link from 'next/link';
import { MARKETING_BRAND_NAME } from '@/lib/branding';

const values = [
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: 'Innovation',
    description:
      'We push the boundaries of what AI can do for marketing. Our team constantly explores new models, techniques, and approaches to deliver cutting-edge solutions.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    title: 'Transparency',
    description:
      'We believe in open communication with our users. Our pricing is clear, our AI decisions are explainable, and our roadmap is public.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: 'Security',
    description:
      'Your data is sacred. We implement enterprise-grade security at every level, from encryption to access controls, and we never use your data to train our models.',
  },
  {
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    title: 'Simplicity',
    description:
      'Powerful technology should be easy to use. We design every feature with simplicity in mind, so you can focus on strategy, not configuration.',
  },
];

const team = [
  {
    name: 'Alex Rivera',
    role: 'CEO & Co-Founder',
    bio: 'Former VP of Marketing at a Fortune 500 company. 15 years of marketing leadership experience.',
  },
  {
    name: 'Sarah Kim',
    role: 'CTO & Co-Founder',
    bio: 'PhD in Machine Learning from Stanford. Previously led AI engineering at a major tech company.',
  },
  {
    name: 'Marcus Johnson',
    role: 'VP of Product',
    bio: 'Product leader with experience at top SaaS companies. Passionate about user-centric design.',
  },
  {
    name: 'Priya Patel',
    role: 'Head of AI Research',
    bio: 'Published researcher in NLP and generative AI. 10+ years building AI-powered products.',
  },
  {
    name: 'David Chen',
    role: 'Head of Engineering',
    bio: 'Full-stack engineer with expertise in distributed systems. Scaled platforms to millions of users.',
  },
  {
    name: 'Emma Wilson',
    role: 'Head of Customer Success',
    bio: 'Customer success veteran with a track record of building world-class support teams.',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Building the Future of{' '}
              <span className="text-gradient">Marketing</span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-zinc-400 sm:text-xl">
              {MARKETING_BRAND_NAME} is building governed, evidence-led
              automation that gives growing businesses a capable marketing
              operating system without giving up owner control.
            </p>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Our Story
            </h2>
            <div className="mt-8 space-y-6 text-base leading-relaxed text-zinc-400">
              <p>
                {MARKETING_BRAND_NAME} starts from a simple observation: marketing
                teams spend too much time on repetitive tasks and not enough
                time on strategy and creativity. We saw talented marketers
                drowning in content calendars, social media scheduling, and
                manual reporting — while the real work of understanding
                customers and building great campaigns took a back seat.
              </p>
              <p>
                The product is designed around a clear division of responsibility:
                specialist agents can research, plan, draft, revise, and measure,
                while owners retain control of final customer-facing content and
                policy-governed external actions.
              </p>
              <p>
                The current release connects campaign strategy, a living business
                knowledge layer, governed content production, supported social and
                email delivery, and attribution in one auditable workspace.
              </p>
              <p>
                We&apos;re just getting started. Our vision is a world where
                every business, regardless of size or budget, has access to a
                world-class marketing team — powered by AI.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Our Values
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              The principles that guide everything we build.
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value) => (
              <div
                key={value.title}
                className="rounded-2xl border border-white/[0.06] bg-surface-100 p-6"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                  {value.icon}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">
                  {value.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              The Team
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              The people building the future of marketing.
            </p>
          </div>
          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {team.map((member) => (
              <div
                key={member.name}
                className="rounded-2xl border border-white/[0.06] bg-surface-100 p-6"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/20 text-xl font-bold text-brand-400">
                  {member.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">
                  {member.name}
                </h3>
                <p className="text-sm text-brand-400">{member.role}</p>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  {member.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Join Us */}
      <section className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-500 px-8 py-16 text-center sm:px-16 sm:py-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Join Us
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
                We&apos;re always looking for talented people who are
                passionate about AI and marketing. Come build the future with
                us.
              </p>
              <Link
                href="/about#careers"
                className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-white px-8 text-sm font-semibold text-brand-600 transition-all hover:bg-white/90 active:scale-[0.98]"
              >
                View Open Positions
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
