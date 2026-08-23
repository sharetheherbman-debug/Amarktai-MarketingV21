'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthCard } from '@/components/auth/AuthCard';
import { useAuthStore } from '@/stores/auth.store';

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const authLoading = useAuthStore((state) => state.isLoading);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!password) {
      newErrors.password = 'Password is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || authLoading) return;

    try {
      const enrollmentRequired = await login({ email, password, mfa_code: mfaCode || undefined });
      toast.success('Signed in successfully');
      router.replace(enrollmentRequired ? '/mfa/setup' : '/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to sign in');
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Marketing workspace"
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
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              placeholder="you@example.com"
              className={`w-full rounded-lg border bg-[var(--color-surface-2)] py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                errors.email ? 'border-red-500' : 'border-white/[0.08]'
              }`}
            />
          </div>
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-400">{errors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="mfaCode" className="block text-sm font-medium text-zinc-300">Authenticator or recovery code</label>
          <input id="mfaCode" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Required after enrollment" className="mt-1 w-full rounded-lg border border-white/[0.08] bg-[var(--color-surface-2)] px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none" />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-brand-400 transition-colors hover:text-brand-300"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative mt-1">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="Enter your password"
              className={`w-full rounded-lg border bg-[var(--color-surface-2)] py-2.5 pl-10 pr-10 text-sm text-white placeholder-zinc-500 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                errors.password ? 'border-red-500' : 'border-white/[0.08]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-400">{errors.password}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={authLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {authLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {authLoading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs leading-5 text-zinc-500">
        Workspace access is provisioned by an administrator or through a trusted connected application.
      </p>
    </AuthCard>
  );
}
