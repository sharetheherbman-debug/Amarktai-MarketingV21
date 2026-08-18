import Link from 'next/link';
import { ArrowRight, Globe2, Search, Swords, TrendingUp } from 'lucide-react';

const areas = [
  {
    href: '/competitors',
    title: 'Competitor Intelligence',
    description: 'Track the competitors that matter, their positioning and changes worth considering in campaign planning.',
    icon: Swords,
  },
  {
    href: '/trends',
    title: 'Trend Intelligence',
    description: 'Monitor topics and signals, review discovered items and keep useful market changes visible to the marketing workflow.',
    icon: TrendingUp,
  },
  {
    href: '/seo',
    title: 'SEO Intelligence',
    description: 'Work with keywords, pages and search opportunities already supported by the Marketing SEO workspace.',
    icon: Search,
  },
  {
    href: '/knowledge',
    title: 'Business & Market Knowledge',
    description: 'Search the organisation-scoped knowledge used to ground planning, generation and marketing decisions.',
    icon: Globe2,
  },
];

export default function IntelligencePage() {
  return (
    <div className="space-y-6">
      <header className="ep-panel p-6 sm:p-8">
        <p className="ep-section-label">Research & Intelligence</p>
        <h1 className="ep-page-title mt-2">See what is changing before you decide what to create.</h1>
        <p className="ep-page-copy mt-3 max-w-3xl text-sm leading-6 sm:text-base">
          Bring competitor, trend, SEO and grounded business knowledge together before campaign strategy and production.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {areas.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="ep-card group p-5 transition hover:border-[#9fb4c8] hover:shadow-[var(--ep-shadow-float)] sm:p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-[var(--ep-blue-soft)] p-3 text-[var(--ep-blue)]"><Icon className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold text-[var(--ep-navy)]">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">{description}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--ep-blue)]">Open workspace <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
              </div>
            </div>
          </Link>
        ))}
      </section>

      <section className="ep-card p-5 sm:p-6">
        <p className="ep-section-label">How it feeds the system</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {['Observe', 'Interpret', 'Plan', 'Measure & learn'].map((label, index) => (
            <div key={label} className="rounded-xl bg-[var(--ep-surface-subtle)] p-4">
              <span className="text-xs font-extrabold text-[var(--ep-blue)]">0{index + 1}</span>
              <p className="mt-2 font-bold text-[var(--ep-navy)]">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--ep-text-muted)]">This area exposes existing intelligence capabilities; it does not claim access to private platform algorithms or invent market data.</p>
      </section>
    </div>
  );
}
