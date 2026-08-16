'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Mail, Lock, User, Eye, EyeOff, Loader2, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthCard } from '@/components/auth/AuthCard';

type InviteState = 'loading' | 'existing-user' | 'new-user' | 'already-member' | 'error';

interface InviteData {
  organizationName: string;
  email: string;
  isNewUser: boolean;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState<string>('');
  const [state, setState] = useState<InviteState>('loading');
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<
    Partial<Record<'name' | 'password' | 'confirmPassword', string>>
  >({});

  useEffect(() => {
    params.then((p) => setToken(p.token));
  }, [params]);

  useEffect(() => {
    if (!token) return;

    async function validateInvite() {
      try {
        const res = await fetch(`/api/invites/${token}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.code === 'ALREADY_MEMBER') {
            setState('already-member');
            setInviteData(data);
            return;
          }
          setState('error');
          setErrorMessage(data.message || 'This invite link is invalid or has expired.');
          return;
        }

        const data = await res.json();
        setInviteData(data);
        setState(data.isNewUser ? 'new-user' : 'existing-user');
      } catch {
        setState('error');
        setErrorMessage('Failed to validate invite link.');
      }
    }

    validateInvite();
  }, [token]);

  async function handleAcceptInvite() {
    setLoading(true);
    try {
      const res = await fetch(`/api/invites/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to accept invitation');
      }

      toast.success('Welcome to the team!');
      window.location.href = '/dashboard';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterAndAccept(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = 'Full name is required';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    if (!confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (password !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/invites/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to create account');
      }

      toast.success('Account created! Welcome to the team!');
      window.location.href = '/dashboard';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  if (state === 'loading') {
    return (
      <AuthCard title="Validating invitation">
        <div className="flex flex-col items-center py-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-400" />
          <p className="mt-4 text-sm text-zinc-400">Checking your invitation...</p>
        </div>
      </AuthCard>
    );
  }

  if (state === 'error') {
    return (
      <AuthCard title="Invalid invitation">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <XCircle className="h-8 w-8 text-red-400" />
          </div>
          <p className="text-sm text-zinc-400">{errorMessage}</p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
          >
            Go home
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (state === 'already-member') {
    return (
      <AuthCard title="Already a member">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
            <CheckCircle className="h-8 w-8 text-brand-400" />
          </div>
          <p className="text-sm text-zinc-400">
            You&apos;re already a member of{' '}
            <span className="font-medium text-white">
              {inviteData?.organizationName}
            </span>
            .
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
          >
            Go to dashboard
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (state === 'existing-user') {
    return (
      <AuthCard
        title="You've been invited!"
        subtitle={`Join ${inviteData?.organizationName} on EquiProfile Marketing`}
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
            <Mail className="h-8 w-8 text-brand-400" />
          </div>
          <p className="text-sm text-zinc-400">
            Sign in as{' '}
            <span className="font-medium text-white">{inviteData?.email}</span>{' '}
            to accept the invitation.
          </p>
          <button
            type="button"
            onClick={handleAcceptInvite}
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Accepting...' : 'Accept invitation'}
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="You've been invited!"
      subtitle={`Join ${inviteData?.organizationName} on EquiProfile Marketing`}
    >
      <form onSubmit={handleRegisterAndAccept} className="space-y-5">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center text-sm text-zinc-400">
          Creating account for{' '}
          <span className="font-medium text-white">{inviteData?.email}</span>
        </div>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-zinc-300">
            Full name
          </label>
          <div className="relative mt-1">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearError('name');
              }}
              placeholder="John Doe"
              className={`w-full rounded-lg border bg-[var(--color-surface-2)] py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                errors.name ? 'border-red-500' : 'border-white/[0.08]'
              }`}
            />
          </div>
          {errors.name && <p className="mt-1.5 text-xs text-red-400">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
            Password
          </label>
          <div className="relative mt-1">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError('password');
              }}
              placeholder="Create a password"
              className={`w-full rounded-lg border bg-[var(--color-surface-2)] py-2.5 pl-10 pr-10 text-sm text-white placeholder-zinc-500 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                errors.password ? 'border-red-500' : 'border-white/[0.08]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1.5 text-xs text-red-400">{errors.password}</p>}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300">
            Confirm password
          </label>
          <div className="relative mt-1">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearError('confirmPassword');
              }}
              placeholder="Confirm your password"
              className={`w-full rounded-lg border bg-[var(--color-surface-2)] py-2.5 pl-10 pr-10 text-sm text-white placeholder-zinc-500 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                errors.confirmPassword ? 'border-red-500' : 'border-white/[0.08]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {errors.confirmPassword && (
            <p className="mt-1.5 text-xs text-red-400">{errors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Creating account...' : 'Accept & Create Account'}
        </button>
      </form>
    </AuthCard>
  );
}
