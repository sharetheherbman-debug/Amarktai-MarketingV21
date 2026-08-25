import Link from 'next/link';
import { ArrowRight, CalendarDays, FileText, Images, Megaphone, PanelsTopLeft, Sparkles, Video } from 'lucide-react';

const primaryActions = [
  {
    title: 'Create a Campaign',
    description: 'Give Marketing an objective, offer and audience. It builds one connected strategy, asset mix, calendar and measurement plan.',
    href: '/campaigns/new?deliverable=campaign',
    cta: 'Build campaign plan',
    icon: Megaphone,
    recommended: true,
  },
  {
    title: 'Create This Week’s Marketing',
    description: 'Prepare a governed week of social content and supporting material from your approved business and brand context.',
    href: '/campaigns/new?deliverable=weekly',
    cta: 'Plan this week',
    icon: CalendarDays,
    recommended: false,
  },
  {
    title: 'Create 1 Video Ad + 5 Image Ads',
    description: 'Request one cohesive, branded advertising rotation set. Marketing plans the mix as one batch and uses the economical video route where available.',
    href: '/campaigns/new?deliverable=ad-batch',
    cta: 'Create ad rotation set',
    icon: Video,
    recommended: false,
  },
  {
    title: 'Create a Marketing Deliverable',
    description: 'Choose social ads, promotional graphics, banners, email, landing-page, article, offer or retargeting material in one campaign brief.',
    href: '/campaigns/new',
    cta: 'Choose deliverables',
    icon: PanelsTopLeft,
    recommended: false,
  },
];

export default function CreatePage() {
  return (
    <div className="space-y-6">
      <header className="ep-panel overflow-hidden p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="ep-section-label">Create</p>
          <h1 className="ep-page-title mt-2">Tell Marketing the outcome. It handles the work.</h1>
          <p className="ep-page-copy mt-3 max-w-2xl text-sm leading-6 sm:text-base">
            Start a finished marketing deliverable or a complete campaign batch. The Marketing Director uses your approved business context, brand rules and safety limits to plan, create, check and prepare work for review or approved release.
          </p>
        </div>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        {primaryActions.map(({ title, description, href, cta, icon: Icon, recommended }) => (
          <Link
            key={href}
            href={href}
            className={recommended
              ? 'ep-panel group relative overflow-hidden border-[var(--ep-blue)] p-6 transition hover:-translate-y-0.5 hover:shadow-lg'
              : 'ep-card group p-6 transition hover:-translate-y-0.5 hover:border-[var(--ep-border-strong)] hover:shadow-md'}
          >
            {recommended && (
              <span className="absolute right-4 top-4 rounded-full bg-[var(--ep-blue-soft)] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--ep-blue)]">
                Start here
              </span>
            )}
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--ep-blue-soft)] text-[var(--ep-blue)]">
              <Icon className="h-5 w-5" />
            </div>
            <h2 className="mt-5 text-xl font-extrabold text-[var(--ep-navy)]">{title}</h2>
            <p className="mt-2 min-h-[48px] text-sm leading-6 text-[var(--ep-text-muted)]">{description}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--ep-blue)]">
              {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>

      <section className="ep-card p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
          <span className="w-fit rounded-xl bg-[var(--ep-blue-soft)] p-3 text-[var(--ep-blue)]"><Sparkles className="h-5 w-5" /></span>
          <div>
            <p className="ep-section-label">How the batch works</p>
            <h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Progress and finished work, not a generator control panel.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">Marketing validates the strategy, reviews approved facts and brand context, creates campaign-ready variations, runs bounded quality checks, then moves the work into approval, scheduling and results workflows. Provider names and arbitrary model pickers are not part of this owner path.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-[var(--ep-text-muted)]">
              <span className="rounded-full bg-[var(--ep-surface-subtle)] px-3 py-2">Strategy</span><span className="rounded-full bg-[var(--ep-surface-subtle)] px-3 py-2">Brand review</span><span className="rounded-full bg-[var(--ep-surface-subtle)] px-3 py-2">Batch production</span><span className="rounded-full bg-[var(--ep-surface-subtle)] px-3 py-2">Quality checks</span><span className="rounded-full bg-[var(--ep-surface-subtle)] px-3 py-2">Approval / scheduling</span>
            </div>
          </div>
        </div>
      </section>

      <section className="ep-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3"><span className="rounded-xl bg-[var(--ep-surface-subtle)] p-2.5 text-[var(--ep-blue)]"><Images className="h-5 w-5" /></span><div><p className="text-sm font-extrabold text-[var(--ep-navy)]">Need a specialist creative revision?</p><p className="mt-1 text-sm leading-6 text-[var(--ep-text-muted)]">Creative Studio remains an advanced, runtime-gated workspace. It is intentionally secondary to campaign deliverables and does not claim an unavailable service can make an asset.</p></div></div>
        <Link href="/creative-studio" className="ep-button-secondary shrink-0 px-4 py-2.5 text-sm"><FileText className="h-4 w-4" /> Open specialist workspace</Link>
      </section>
    </div>
  );
}
