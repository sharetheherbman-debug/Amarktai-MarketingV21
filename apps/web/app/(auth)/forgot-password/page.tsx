'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthCard } from '@/components/auth/AuthCard';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function validate(): boolean {
    if (!email) {
      setError('Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email');
      return false;
    }
    setError('');
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to send reset link');
      }

      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
            <CheckCircle className="h-8 w-8 text-brand-400" />
          </div>
          <p className="text-sm text-zinc-400">
            We&apos;ve sent a password reset link to{' '}
            <span className="font-medium text-white">{email}</span>
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Didn&apos;t receive it? Check your spam folder or try again.
          </p>
          <div className="mt-6 flex flex-col gap-3 w-full">
            <button
              type="button"
              onClick={() => {
                setSent(false);
                setEmail('');
              }}
              className="w-full rounded-lg border border-white/[0.08] py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04]"
            >
              Try another email
            </button>
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 text-sm text-brand-400 transition-colors hover:text-brand-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
            Email
          </label>
          <div className="relative mt-1">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              placeholder="you@example.com"
              className={`w-full rounded-lg border bg-[var(--color-surface-2)] py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                error ? 'border-red-500' : 'border-white/[0.08]'
              }`}
            />
          </div>
          {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
      </form>

      <Link
        href="/login"
        className="mt-6 flex items-center justify-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </Link>
    </AuthCard>
  );
}
