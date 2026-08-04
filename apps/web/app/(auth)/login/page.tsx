'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthCard } from '@/components/auth/AuthCard';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
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
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Invalid email or password');
      }

      toast.success('Signed in successfully');
      window.location.href = '/dashboard';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your AmarktAI Marketing account"
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
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors hover:text-zinc-300"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-400">{errors.password}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="remember"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-white/[0.08] bg-[var(--color-surface-2)] text-brand-500 focus:ring-brand-500"
          />
          <label htmlFor="remember" className="text-sm text-zinc-400">
            Remember me
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/[0.08]" />
        <span className="text-xs text-zinc-500">Or continue with</span>
        <div className="h-px flex-1 bg-white/[0.08]" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled
          className="flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-[var(--color-surface-2)] py-2.5 text-sm font-medium text-zinc-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>Google</span>
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500">
            Soon
          </span>
        </button>
        <button
          type="button"
          disabled
          className="flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-[var(--color-surface-2)] py-2.5 text-sm font-medium text-zinc-400 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
          </svg>
          <span>GitHub</span>
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500">
            Soon
          </span>
        </button>
      </div>

      <p className="mt-6 text-center text-sm text-zinc-400">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="font-medium text-brand-400 transition-colors hover:text-brand-300"
        >
          Sign up
        </Link>
      </p>
    </AuthCard>
  );
}
