import Link from 'next/link';
import {
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Megaphone,
  Sparkles,
  Video,
} from 'lucide-react';

const primaryActions = [
  {
    title: 'Create an Ad',
    description: 'Build a finished Facebook or Instagram image advert with exact headline, copy, CTA and brand.',
    href: '/advertising',
    cta: 'Create Facebook / Instagram Ad',
    icon: Megaphone,
    recommended: true,
  },
  {
    title: 'Create Social Content',
    description: 'Create governed written marketing content using the existing Content Studio workflow.',
    href: '/content-studio/generate',
    cta: 'Create Social Post',
    icon: FileText,
    recommended: false,
  },
  {
    title: 'Create Campaign Content',
    description: 'Start with campaign strategy, audience and objectives, then prepare content around it.',
    href: '/campaigns/new',
    cta: 'Start Campaign Content',
    icon: Sparkles,
    recommended: false,
  },
];

export default function CreatePage() {
  return (
    <div className="space-y-6">
      <header className="ep-panel overflow-hidden p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="ep-section-label">Create</p>
          <h1 className="ep-page-title mt-2">What do you want Marketing to create?</h1>
          <p className="ep-page-copy mt-3 max-w-2xl text-sm leading-6 sm:text-base">
            Start with the business outcome. Provider names, runtime models, queues and generation jobs stay out of the normal client workflow.
          </p>
        </div>
      </header>

      <section className="grid gap-5 lg:grid-cols-3">
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
            <p className="mt-2 min-h-[72px] text-sm leading-6 text-[var(--ep-text-muted)]">{description}</p>
            <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--ep-blue)]">
              {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>

      <section className="ep-panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="ep-section-label">Advanced creative tools</p>
            <h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Image and video tools are still being simplified.</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">
              The existing Creative Studio remains available to administrators, but raw model and long-form controls are deliberately not presented as the normal client workflow. A simple low-cost Short Video flow is the next acceptance target after Create Ad is browser-proven.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/creative-studio" className="ep-button-secondary px-4 py-2.5 text-sm">
              <ImageIcon className="h-4 w-4" /> Advanced image tools
            </Link>
            <Link href="/creative-studio" className="ep-button-secondary px-4 py-2.5 text-sm">
              <Video className="h-4 w-4" /> Advanced video tools
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
