'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthCard } from '@/components/auth/AuthCard';
import { useAuthStore, type User } from '@/stores/auth.store';

const API_URL = String(process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/+$/, '');

interface MfaSetup {
  qr_data_url: string;
  manual_key: string;
}

interface ConfirmPayload {
  success?: boolean;
  data?: {
    user: User;
    recovery_codes: string[];
  };
  error?: { message?: string };
}

export default function MfaSetupPage() {
  const router = useRouter();
  const acceptTrustedSession = useAuthStore((state) => state.acceptTrustedSession);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`${API_URL}/auth/mfa/enroll`, { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error?.message || 'Unable to start MFA enrollment');
        return payload.data as MfaSetup;
      })
      .then((data) => { if (!cancelled) setSetup(data); })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : 'Unable to start MFA enrollment');
        if (reason instanceof Error && /session|required|unauthor/i.test(reason.message)) router.replace('/login');
      });
    return () => { cancelled = true; };
  }, [router]);

  async function confirm() {
    setError(null);
    const response = await fetch(`${API_URL}/auth/mfa/confirm`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const payload = await response.json().catch(() => ({})) as ConfirmPayload;
    if (!response.ok || !payload.data) {
      setError(payload.error?.message || 'Invalid code');
      return;
    }

    const orgResponse = await fetch(`${API_URL}/organizations`, { credentials: 'include' });
    const orgPayload = await orgResponse.json().catch(() => ({}));
    if (!orgResponse.ok || !Array.isArray(orgPayload.data)) {
      setError(orgPayload.error?.message || 'MFA was enabled, but your workspace could not be loaded');
      return;
    }
    acceptTrustedSession({ user: payload.data.user, organizations: orgPayload.data });
    setRecovery(payload.data.recovery_codes);
  }

  if (recovery) {
    return (
      <AuthCard title="Save your recovery codes" subtitle="These codes are shown once. Store them securely.">
        <div className="grid gap-2 rounded-lg bg-black/30 p-4 font-mono text-sm text-white">
          {recovery.map((item) => <span key={item}>{item}</span>)}
        </div>
        <button onClick={() => router.replace('/dashboard')} className="mt-5 w-full rounded-lg bg-brand-500 py-2.5 font-semibold text-white">I have saved them</button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Secure your account" subtitle="Marketing requires authenticator-app 2FA before dashboard access.">
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {setup && <>
        <img src={setup.qr_data_url} alt="Authenticator QR code" className="mx-auto h-48 w-48 rounded-lg bg-white p-2" />
        <p className="mt-3 break-all text-center font-mono text-xs text-zinc-400">{setup.manual_key}</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className="mt-5 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-white" />
        <button onClick={confirm} className="mt-3 w-full rounded-lg bg-brand-500 py-2.5 font-semibold text-white">Verify and enable 2FA</button>
      </>}
    </AuthCard>
  );
}
