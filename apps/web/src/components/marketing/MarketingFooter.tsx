import Link from 'next/link';
import {
  AMARKTAI_NETWORK_URL,
  MARKETING_BRAND_DESCRIPTION,
  MARKETING_BRAND_LOGO_URL,
  MARKETING_BRAND_NAME,
} from '@/lib/branding';

const footerLinks = {
  product: [
    { label: 'Features', href: '/features' },
    { label: 'Agents', href: '/ai-agents' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Integrations', href: '/features#integrations' },
    { label: 'API', href: '/docs#api' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/contact' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Cookie Policy', href: '/cookies' },
  ],
};

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-3">
              <img
                src={MARKETING_BRAND_LOGO_URL}
                alt={MARKETING_BRAND_NAME}
                className="h-9 w-auto max-w-[150px] object-contain"
              />
              <span className="sr-only">{MARKETING_BRAND_NAME}</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              {MARKETING_BRAND_DESCRIPTION}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Product
            </h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Company
            </h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white">
              Legal
            </h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-zinc-400 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 sm:flex-row">
          <p className="text-sm text-zinc-500">
            &copy; {new Date().getFullYear()} {MARKETING_BRAND_NAME}. Part of{' '}
            <a
              href={AMARKTAI_NETWORK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-400 transition-colors hover:text-white"
            >
              AmarktAI Network
            </a>
          </p>
          <Link
            href="/status"
            className="flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-white"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            System status
          </Link>
        </div>
      </div>
    </footer>
  );
}
