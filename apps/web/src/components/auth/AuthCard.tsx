'use client';

import Link from 'next/link';

interface AuthCardProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthCard({ children, title, subtitle }: AuthCardProps) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}
