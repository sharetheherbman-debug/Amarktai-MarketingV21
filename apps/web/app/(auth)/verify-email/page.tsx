'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthCard } from '@/components/auth/AuthCard';

type VerifyState = 'loading' | 'success' | 'error' | 'manual';

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');

  const [state, setState] = useState<VerifyState>(token ? 'loading' : 'manual');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!token) return;

    async function verify() {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          setState('error');
          return;
        }

        setState('success');
      } catch {
        setState('error');
      }
    }

    verify();
  }, [token]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function handleResend() {
    if (!emailParam || resendCooldown > 0) return;
    setResendLoading(true);
    try {
      const res = await fetch('/api/auth/verify-email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailParam }),
      });

      if (!res.ok) {
        throw new Error('Failed to resend email');
      }

      toast.success('Verification email sent');
      setResendCooldown(60);
    } catch {
      toast.error('Failed to resend verification email');
    } finally {
      setResendLoading(false);
    }
  }

  if (state === 'loading') {
    return (
      <AuthCard title="Verifying your email">
        <div className="flex flex-col items-center py-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-400" />
          <p className="mt-4 text-sm text-zinc-400">Please wait while we verify your email...</p>
        </div>
      </AuthCard>
    );
  }

  if (state === 'success') {
    return (
      <AuthCard title="Email verified!">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
            <CheckCircle className="h-8 w-8 text-brand-400" />
          </div>
          <p className="text-sm text-zinc-400">
            Your email has been verified successfully. You can now access your dashboard.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
          >
            Continue to dashboard
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (state === 'error') {
    return (
      <AuthCard title="Verification failed">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <XCircle className="h-8 w-8 text-red-400" />
          </div>
          <p className="text-sm text-zinc-400">
            The verification link is invalid or has expired.
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading || resendCooldown > 0}
            className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {resendLoading
              ? 'Sending...'
              : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : 'Resend verification email'}
          </button>
          <Link
            href="/login"
            className="mt-4 text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Check your inbox">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
          <Mail className="h-8 w-8 text-brand-400" />
        </div>
        <p className="text-sm text-zinc-400">
          We&apos;ve sent a verification link to{' '}
          {emailParam && (
            <span className="font-medium text-white">{emailParam}</span>
          )}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Click the link in the email to verify your account.
        </p>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendLoading || resendCooldown > 0 || !emailParam}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {resendLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {resendLoading
            ? 'Sending...'
            : resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : 'Resend email'}
        </button>
        <Link
          href="/login"
          className="mt-4 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <AuthCard title="Loading...">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      </AuthCard>
    }>
      <VerifyEmailForm />
    </Suspense>
  );
}
