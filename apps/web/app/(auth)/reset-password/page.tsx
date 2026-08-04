'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, Loader2, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthCard } from '@/components/auth/AuthCard';

type PasswordStrength = 'weak' | 'medium' | 'strong';

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 'weak';
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (score <= 2) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}

const strengthConfig: Record<PasswordStrength, { label: string; color: string; width: string }> = {
  weak: { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' },
  medium: { label: 'Medium', color: 'bg-yellow-500', width: 'w-2/3' },
  strong: { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' },
};

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  useEffect(() => {
    if (!token) {
      setInvalidToken(true);
    }
  }, [token]);

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !token) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'INVALID_TOKEN') {
          setInvalidToken(true);
          return;
        }
        throw new Error(data.message || 'Failed to reset password');
      }

      setSuccess(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (invalidToken) {
    return (
      <AuthCard title="Invalid link">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
            <XCircle className="h-8 w-8 text-red-400" />
          </div>
          <p className="text-sm text-zinc-400">
            This password reset link is invalid or has expired.
          </p>
          <Link
            href="/forgot-password"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
          >
            Request a new link
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (success) {
    return (
      <AuthCard title="Password reset successfully">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10">
            <CheckCircle className="h-8 w-8 text-brand-400" />
          </div>
          <p className="text-sm text-zinc-400">
            Your password has been reset. You can now sign in with your new password.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
          >
            Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set new password"
      subtitle="Enter your new password below"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
            New password
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
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="Enter new password"
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
          {password && (
            <div className="mt-2">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full transition-all ${strengthConfig[strength].color} ${strengthConfig[strength].width}`}
                />
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Strength:{' '}
                <span
                  className={
                    strength === 'strong'
                      ? 'text-emerald-400'
                      : strength === 'medium'
                        ? 'text-yellow-400'
                        : 'text-red-400'
                  }
                >
                  {strengthConfig[strength].label}
                </span>
              </p>
            </div>
          )}
          {errors.password && <p className="mt-1.5 text-xs text-red-400">{errors.password}</p>}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300">
            Confirm new password
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
                if (errors.confirmPassword)
                  setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              placeholder="Confirm new password"
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
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <AuthCard title="Loading...">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      </AuthCard>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
