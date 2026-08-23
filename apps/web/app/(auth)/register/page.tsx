'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { AuthCard } from '@/components/auth/AuthCard';

export default function RegisterPage() {
  return (
    <AuthCard
      title="Workspace access is provisioned"
      subtitle="Public self-registration is disabled for this Marketing deployment."
    >
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-zinc-100">Use an approved access route</p>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Existing workspace users can sign in directly. Administrators of a trusted connected application should open Marketing from that application so the signed SSO handoff can provision or link their account securely.
            </p>
          </div>
        </div>
      </div>
      <Link
        href="/login"
        className="mt-5 flex w-full items-center justify-center rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-400"
      >
        Go to sign in
      </Link>
    </AuthCard>
  );
}
