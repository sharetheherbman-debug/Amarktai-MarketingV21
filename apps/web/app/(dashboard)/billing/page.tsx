'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Coins,
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  PoundSterling,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  tier: string;
  price_monthly_cents: number;
  price_yearly_cents: number;
  currency?: string;
  features: string[];
  limits: Record<string, number>;
  trial_days: number;
}

interface Subscription {
  id: string;
  plan_name: string;
  plan_slug: string;
  status: string;
  billing_cycle: string;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string | null;
  status: string;
  total_cents: number;
  currency?: string;
  description: string | null;
  created_at: string;
  pdf_url?: string | null;
  hosted_invoice_url?: string | null;
}

interface CreditWallet {
  organization_id: string;
  wallet_type: 'customer' | 'internal';
  currency: 'GBP';
  available_credits: number;
  reserved_credits: number;
  lifetime_purchased_credits: number;
  lifetime_granted_credits: number;
  lifetime_spent_credits: number;
}

interface CreditPack {
  code: string;
  name: string;
  description: string | null;
  credits: number;
  price_pence: number;
  currency: 'GBP';
  formatted_price: string;
}

interface CheckoutResult {
  checkout_url: string | null;
  checkout_session_id?: string;
}

interface CreditCheckoutResult {
  checkout_url: string;
  checkout_session_id: string;
  pack: CreditPack;
}

interface PortalResult {
  url: string;
}

type BillingTab = 'credits' | 'plans' | 'subscription' | 'invoices' | 'usage';

const tierIcons: Record<string, typeof Crown> = {
  free: Zap,
  starter: Star,
  professional: Crown,
  enterprise: Building2,
};

const tierColors: Record<string, string> = {
  free: 'text-zinc-400',
  starter: 'text-blue-400',
  professional: 'text-brand-400',
  enterprise: 'text-amber-400',
};

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400',
  trialing: 'bg-blue-500/10 text-blue-400',
  past_due: 'bg-red-500/10 text-red-400',
  unpaid: 'bg-red-500/10 text-red-400',
  incomplete: 'bg-amber-500/10 text-amber-400',
  incomplete_expired: 'bg-red-500/10 text-red-400',
  canceled: 'bg-zinc-500/10 text-zinc-400',
};

const formatGBP = (pence: number) => new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
}).format((Number(pence) || 0) / 100);

const formatCredits = (credits: number) => new Intl.NumberFormat('en-GB').format(Number(credits) || 0);

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<BillingTab>('credits');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      setError('Select an organisation before opening billing.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [plansRes, subRes, invRes, usageRes, walletRes, packsRes] = await Promise.all([
        api.get<ApiResponse<Plan[]>>('/billing/plans'),
        api.get<ApiResponse<Subscription | null>>('/billing/subscription', {
          params: { organization_id: orgId },
        }),
        api.get<ApiResponse<Invoice[]>>('/billing/invoices', {
          params: { organization_id: orgId },
        }),
        api.get<ApiResponse<Record<string, number>>>('/billing/usage', {
          params: { organization_id: orgId },
        }),
        api.get<ApiResponse<CreditWallet>>('/generation-credits/wallet', {
          params: { organization_id: orgId },
        }),
        api.get<ApiResponse<CreditPack[]>>('/generation-credits/packs', {
          params: { organization_id: orgId },
        }),
      ]);

      setPlans(plansRes.data || []);
      setSubscription(subRes.data || null);
      setInvoices(invRes.data || []);
      setUsage(usageRes.data || {});
      setWallet(walletRes.data || null);
      setCreditPacks(packsRes.data || []);
      if (subRes.data?.billing_cycle === 'yearly') setBillingCycle('yearly');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load billing.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const credits = params.get('credits');

    if (credits === 'success') {
      setTab('credits');
      setNotice('Payment received. Stripe is confirming the purchase and your Generation Credits will appear here shortly.');
      window.history.replaceState({}, '', window.location.pathname);
      const first = window.setTimeout(() => void fetchData(), 1200);
      const second = window.setTimeout(() => void fetchData(), 3500);
      return () => {
        window.clearTimeout(first);
        window.clearTimeout(second);
      };
    }

    if (credits === 'cancelled') {
      setTab('credits');
      setError('Generation Credit purchase was cancelled. No credits were added and no payment was recorded.');
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (checkout === 'success') {
      setTab('subscription');
      setNotice('Subscription payment received. Stripe is confirming the change.');
      window.history.replaceState({}, '', window.location.pathname);
      const timer = window.setTimeout(() => void fetchData(), 1500);
      return () => window.clearTimeout(timer);
    }

    if (checkout === 'cancelled') {
      setError('Stripe Checkout was cancelled. No payment was recorded.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchData]);

  const handlePlan = async (planSlug: string) => {
    if (!orgId) return;
    try {
      setBusy(`plan:${planSlug}`);
      setError(null);
      const response = await api.post<ApiResponse<CheckoutResult>>('/billing/subscription', {
        body: {
          organization_id: orgId,
          plan_slug: planSlug,
          billing_cycle: billingCycle,
        },
      });
      if (response.data?.checkout_url) {
        window.location.assign(response.data.checkout_url);
        return;
      }
      await fetchData();
      setTab('subscription');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Subscription request failed.');
    } finally {
      setBusy(null);
    }
  };

  const buyCredits = async (packCode: string) => {
    if (!orgId) return;
    try {
      setBusy(`credits:${packCode}`);
      setError(null);
      setNotice(null);
      const response = await api.post<ApiResponse<CreditCheckoutResult>>('/generation-credits/checkout', {
        body: { organization_id: orgId, pack_code: packCode },
      });
      if (!response.data?.checkout_url) throw new Error('Stripe returned no credit-purchase checkout URL.');
      window.location.assign(response.data.checkout_url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the Generation Credit purchase.');
      setBusy(null);
    }
  };

  const openPortal = async () => {
    if (!orgId) return;
    try {
      setBusy('portal');
      setError(null);
      const response = await api.post<ApiResponse<PortalResult>>('/billing/portal', {
        body: { organization_id: orgId },
      });
      if (!response.data?.url) throw new Error('Stripe returned no billing portal URL.');
      window.location.assign(response.data.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open Stripe Billing Portal.');
      setBusy(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel renewal at the end of the current billing period?')) return;
    try {
      setBusy('cancel');
      await api.put('/billing/subscription/cancel', {
        body: { organization_id: orgId, immediately: false },
      });
      await fetchData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Cancellation failed.');
    } finally {
      setBusy(null);
    }
  };

  const planPrice = (plan: Plan) => billingCycle === 'yearly'
    ? plan.price_yearly_cents
    : plan.price_monthly_cents;
  const displayCycle = billingCycle === 'yearly' ? '/year' : '/month';
  const currentUsage = useMemo(() => Object.entries(usage), [usage]);
  const spendableCredits = wallet?.available_credits || 0;
  const totalControlledCredits = spendableCredits + (wallet?.reserved_credits || 0);

  const tabs: ReadonlyArray<[BillingTab, string, typeof CreditCard]> = [
    ['credits', 'Generation Credits', Coins],
    ['plans', 'Plans', CreditCard],
    ['subscription', 'Subscription', Crown],
    ['invoices', 'Invoices', Receipt],
    ['usage', 'Usage', BarChart3],
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing & Generation Credits</h1>
          <p className="mt-1 text-sm text-zinc-400">
            All prices and AI generation charges for this workspace are in pounds sterling.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openPortal()}
          disabled={busy === 'portal'}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
        >
          {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Manage Stripe billing
        </button>
      </header>

      {notice && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-sm text-emerald-200">{notice}</p>
          <button type="button" onClick={() => setNotice(null)} className="ml-auto text-emerald-400 hover:text-emerald-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav className="flex flex-wrap items-center gap-1 rounded-lg bg-white/[0.03] p-1" aria-label="Billing sections">
        {tabs.map(([key, label, Icon]) => (
          <button
            type="button"
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${
              tab === key ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void fetchData()}
          className="ml-auto rounded-md p-2 text-zinc-400 hover:text-white"
          aria-label="Refresh billing"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </nav>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : tab === 'credits' ? (
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Available</p>
                <WalletCards className="h-5 w-5 text-brand-400" />
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{formatCredits(spendableCredits)}</p>
              <p className="mt-1 text-xs text-zinc-500">Generation Credits ready to spend</p>
            </article>
            <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Reserved</p>
                <ShieldCheck className="h-5 w-5 text-amber-400" />
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{formatCredits(wallet?.reserved_credits || 0)}</p>
              <p className="mt-1 text-xs text-zinc-500">Held for queued or running jobs</p>
            </article>
            <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Lifetime used</p>
                <Sparkles className="h-5 w-5 text-violet-400" />
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{formatCredits(wallet?.lifetime_spent_credits || 0)}</p>
              <p className="mt-1 text-xs text-zinc-500">Settled GenX generation charges</p>
            </article>
            <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Retail value controlled</p>
                <PoundSterling className="h-5 w-5 text-emerald-400" />
              </div>
              <p className="mt-3 text-3xl font-bold text-white">{formatGBP(totalControlledCredits)}</p>
              <p className="mt-1 text-xs text-zinc-500">100 credits represent £1.00</p>
            </article>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <div className="max-w-3xl">
              <h2 className="text-lg font-semibold text-white">Prepaid, controlled generation</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Text, image, voice, audio, avatar and video generation all use one Generation Credit wallet. The platform reserves credits before a job, settles the actual GenX charge after completion, and releases unused credits automatically. Failed no-cost work is not charged.
              </p>
            </div>
          </div>

          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">Add Generation Credits</h2>
              <p className="mt-1 text-sm text-zinc-400">One-time GBP payments are processed securely by Stripe.</p>
            </div>
            {creditPacks.length === 0 ? (
              <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-14 text-center">
                <Coins className="mx-auto h-8 w-8 text-zinc-500" />
                <p className="mt-4 text-sm text-zinc-400">No credit packs are currently available.</p>
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {creditPacks.map((pack) => (
                  <article key={pack.code} className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
                    <p className="text-sm font-medium text-brand-400">{pack.name}</p>
                    <p className="mt-3 text-3xl font-bold text-white">{formatGBP(pack.price_pence)}</p>
                    <p className="mt-2 text-lg font-semibold text-zinc-200">{formatCredits(pack.credits)} credits</p>
                    <p className="mt-2 min-h-10 text-xs leading-5 text-zinc-500">
                      {pack.description || 'Prepaid Generation Credits for this workspace.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => void buyCredits(pack.code)}
                      disabled={busy !== null}
                      className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50"
                    >
                      {busy === `credits:${pack.code}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      Continue to Stripe
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : tab === 'plans' ? (
        <section className="space-y-6">
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1">
              {(['monthly', 'yearly'] as const).map((cycle) => (
                <button
                  type="button"
                  key={cycle}
                  onClick={() => setBillingCycle(cycle)}
                  className={`rounded-md px-4 py-2 text-sm capitalize ${
                    billingCycle === cycle ? 'bg-brand-500 text-white' : 'text-zinc-400'
                  }`}
                >
                  {cycle}{cycle === 'yearly' ? ' · annual pricing' : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const Icon = tierIcons[plan.tier] || Zap;
              const isCurrent = subscription?.plan_slug === plan.slug && subscription.billing_cycle === billingCycle;
              const selectedPrice = planPrice(plan);
              return (
                <article
                  key={plan.id}
                  className={`rounded-xl border p-6 ${
                    isCurrent ? 'border-brand-500/50 bg-brand-500/5' : 'border-white/[0.06] bg-surface-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${tierColors[plan.tier] || 'text-zinc-400'}`} />
                    <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  </div>
                  {plan.description && <p className="mt-1 text-xs text-zinc-500">{plan.description}</p>}
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-white">{formatGBP(selectedPrice)}</span>
                    <span className="text-sm text-zinc-400">{displayCycle}</span>
                  </div>
                  {plan.trial_days > 0 && (
                    <p className="mt-1 text-xs text-brand-400">{plan.trial_days}-day trial managed by Stripe</p>
                  )}
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-zinc-300">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => void handlePlan(plan.slug)}
                    disabled={isCurrent || busy !== null}
                    className={`mt-6 w-full rounded-lg py-2.5 text-sm font-semibold ${
                      isCurrent
                        ? 'cursor-default bg-white/[0.04] text-zinc-500'
                        : 'bg-brand-500 text-white hover:bg-brand-400 disabled:opacity-50'
                    }`}
                  >
                    {busy === `plan:${plan.slug}` ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : isCurrent ? (
                      'Current plan'
                    ) : subscription ? (
                      'Change with Stripe'
                    ) : selectedPrice > 0 ? (
                      'Continue to Stripe'
                    ) : (
                      'Activate free plan'
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ) : tab === 'subscription' ? (
        !subscription ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
            <Crown className="mx-auto h-8 w-8 text-zinc-500" />
            <p className="mt-4 text-sm text-zinc-400">No subscription. Choose a plan to get started.</p>
          </div>
        ) : (
          <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{subscription.plan_name}</h3>
                <p className="text-sm capitalize text-zinc-400">{subscription.billing_cycle} billing</p>
              </div>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusColors[subscription.status] || 'bg-zinc-500/10 text-zinc-400'}`}>
                {subscription.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-zinc-500">Period end</p>
                <p className="text-sm text-white">
                  {subscription.current_period_end
                    ? new Date(subscription.current_period_end).toLocaleDateString('en-GB')
                    : 'Pending Stripe confirmation'}
                </p>
              </div>
              {subscription.trial_end && (
                <div>
                  <p className="text-xs text-zinc-500">Trial end</p>
                  <p className="text-sm text-white">{new Date(subscription.trial_end).toLocaleDateString('en-GB')}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-zinc-500">Renewal</p>
                <p className="text-sm text-white">{subscription.cancel_at_period_end ? 'Ends this period' : 'Automatic'}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void openPortal()}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white"
              >
                <ArrowUpRight className="h-4 w-4" />
                Open Stripe portal
              </button>
              {['active', 'trialing'].includes(subscription.status) && !subscription.cancel_at_period_end && (
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={busy === 'cancel'}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm font-medium text-red-400 disabled:opacity-50"
                >
                  {busy === 'cancel' ? 'Submitting…' : 'Cancel at period end'}
                </button>
              )}
            </div>
          </section>
        )
      ) : tab === 'invoices' ? (
        invoices.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
            <Receipt className="mx-auto h-8 w-8 text-zinc-500" />
            <p className="mt-4 text-sm text-zinc-400">No Stripe invoices yet.</p>
          </div>
        ) : (
          <section className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-surface-100">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{invoice.invoice_number || invoice.description || 'Invoice'}</p>
                  <p className="text-xs text-zinc-500">{new Date(invoice.created_at).toLocaleDateString('en-GB')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-white">{formatGBP(invoice.total_cents)}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${invoice.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                    {invoice.status}
                  </span>
                  {invoice.hosted_invoice_url && (
                    <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer" className="text-brand-400" aria-label="Open Stripe invoice">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </section>
        )
      ) : (
        currentUsage.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
            <BarChart3 className="mx-auto h-8 w-8 text-zinc-500" />
            <p className="mt-4 text-sm text-zinc-400">No metered usage has been recorded this period.</p>
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {currentUsage.map(([metric, quantity]) => (
              <article key={metric} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{metric.replace(/_/g, ' ')}</p>
                <p className="mt-2 text-2xl font-bold text-white">{formatCredits(quantity)}</p>
              </article>
            ))}
          </section>
        )
      )}
    </div>
  );
}
