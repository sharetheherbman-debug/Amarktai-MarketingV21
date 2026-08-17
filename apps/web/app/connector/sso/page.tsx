'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { useAuthStore, type Organization, type User } from '@/stores/auth.store';

interface RedeemResponse {
  success: boolean;
  data?: {
    user: User;
    organization: Organization;
    accessToken: string;
    target_path: string;
    mfa_enrollment_required?: boolean;
  };
  error?: { message?: string };
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/api') return '/api/v1';
  return trimmed;
}

const API_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

function ConnectorSsoContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const acceptTrustedSession = useAuthStore((state) => state.acceptTrustedSession);
  const [status, setStatus] = useState<'working' | 'success' | 'error'>('working');
  const [message, setMessage] = useState('Verifying your secure EquiProfile handoff…');

  useEffect(() => {
    const code = searchParams.get('code') || '';
    if (!code) {
      setStatus('error');
      setMessage('The secure sign-in code is missing. Return to EquiProfile and open Marketing again.');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/application-connectors/sso/redeem`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const payload = await response.json().catch(() => ({})) as RedeemResponse;
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error?.message || 'Secure sign-in could not be completed.');
        }
        if (cancelled) return;
        acceptTrustedSession({
          user: payload.data.user,
          accessToken: payload.data.accessToken,
          organization: payload.data.organization,
          target_path: payload.data.target_path,
        });
        setStatus('success');
        setMessage('Secure sign-in complete. Opening the EquiProfile Marketing workspace…');
        window.history.replaceState({}, '', '/connector/sso');
        router.replace(payload.data.mfa_enrollment_required ? '/mfa/setup' : (payload.data.target_path || '/dashboard'));
      } catch (error) {
        if (cancelled) return;
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Secure sign-in failed.');
      }
    })();

    return () => { cancelled = true; };
  }, [acceptTrustedSession, router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-6">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
          {status === 'working' ? <Loader2 className="h-7 w-7 animate-spin text-emerald-400" /> : status === 'success' ? <CheckCircle2 className="h-7 w-7 text-emerald-400" /> : <AlertCircle className="h-7 w-7 text-red-400" />}
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
          <ShieldCheck className="h-4 w-4" /> EquiProfile secure connection
        </div>
        <h1 className="mt-3 text-2xl font-bold text-white">Marketing sign-in</h1>
        <p className={`mt-3 text-sm leading-6 ${status === 'error' ? 'text-red-300' : 'text-zinc-400'}`}>{message}</p>
        {status === 'error' && (
          <a href="https://equiprofile.online" className="mt-6 inline-flex rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400">
            Return to EquiProfile
          </a>
        )}
      </section>
    </main>
  );
}

export default function ConnectorSsoPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-[#09090b]"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></main>}>
      <ConnectorSsoContent />
    </Suspense>
  );
}
