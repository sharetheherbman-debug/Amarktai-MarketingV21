'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.08),transparent)]" />
      <div className="relative z-10 text-center">
        <p className="text-8xl font-bold text-brand-500/20">404</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
          Page not found
        </h1>
        <p className="mt-3 text-base text-zinc-400">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
          >
            Go Home
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/[0.08] px-6 text-sm font-medium text-zinc-300 transition-all hover:bg-white/[0.04]"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
