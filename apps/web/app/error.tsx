'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.08),transparent)]" />
      <div className="relative z-10 max-w-md text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 mx-auto">
          <svg
            className="h-10 w-10 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Something went wrong
        </h1>
        <p className="mt-3 text-base text-zinc-400">
          An unexpected error occurred. Please try again.
        </p>
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-left">
            <p className="text-xs font-mono text-red-400 break-all">
              {error.message || 'Unknown error'}
            </p>
            {error.digest && (
              <p className="mt-1 text-xs font-mono text-zinc-500">
                Digest: {error.digest}
              </p>
            )}
          </div>
        )}
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-6 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-white/[0.08] px-6 text-sm font-medium text-zinc-300 transition-all hover:bg-white/[0.04]"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
