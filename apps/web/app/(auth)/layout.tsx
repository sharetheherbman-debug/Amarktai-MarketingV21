import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: {
    default: 'Authentication',
    template: '%s | AmarktAI Marketing',
  },
  description: 'Sign in to your AmarktAI Marketing account or create a new one.',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#050505] px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.12),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-8 flex justify-center">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/20">
              <svg
                className="h-6 w-6 text-brand-400"
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
            <span className="text-xl font-bold text-white">
              Amarkt<span className="text-brand-400">AI</span>
            </span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
