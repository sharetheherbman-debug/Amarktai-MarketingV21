'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/features', label: 'Features' },
  { href: '/ai-agents', label: 'Agents' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/blog', label: 'Blog' },
  { href: '/docs', label: 'Docs' },
];

export function MarketingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? 'glass border-b border-white/[0.06]'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20">
            <svg
              className="h-5 w-5 text-brand-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <span className="text-lg font-bold text-white">
            Amarkt<span className="text-brand-400">AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => {
            const isActive =
              pathname === link.href ||
              pathname?.startsWith(link.href + '/');
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/[0.06] text-white'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
          >
            Get Started
          </Link>
        </div>

        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="animate-fade-in border-t border-white/[0.06] glass md:hidden">
          <div className="mx-auto max-w-7xl space-y-1 px-4 py-4 sm:px-6 lg:px-8">
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                pathname?.startsWith(link.href + '/');
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-white/[0.06] text-white'
                      : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="flex gap-3 border-t border-white/[0.06] pt-4">
              <Link
                href="/login"
                className="flex-1 rounded-lg border border-white/10 py-2.5 text-center text-sm font-medium text-zinc-300 transition-colors hover:text-white"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="flex-1 rounded-lg bg-brand-500 py-2.5 text-center text-sm font-semibold text-white transition-all hover:bg-brand-400"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
