'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowUpRight, BarChart3, Building2, CheckCircle2, CreditCard,
  Crown, ExternalLink, Loader2, Receipt, RefreshCw, Star, X, Zap,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Plan {
  id: string; slug: string; name: string; description: string | null; tier: string;
  price_monthly_cents: number; price_yearly_cents: number; features: string[];
  limits: Record<string, number>; trial_days: number;
}
interface Subscription {
  id: string; plan_name: string; plan_slug: string; status: string; billing_cycle: string;
  current_period_end: string | null; trial_end: string | null; cancel_at_period_end: boolean;
  stripe_subscription_id: string | null;
}
interface Invoice {
  id: string; invoice_number: string | null; status: string; total_cents: number;
  description: string | null; created_at: string; pdf_url?: string | null;
  hosted_invoice_url?: string | null;
}
interface CheckoutResult { checkout_url: string | null; checkout_session_id?: string; }
interface PortalResult { url: string; }

const tierIcons: Record<string, typeof Crown> = { free: Zap, starter: Star, professional: Crown, enterprise: Building2 };
const tierColors: Record<string, string> = { free: 'text-zinc-400', starter: 'text-blue-400', professional: 'text-brand-400', enterprise: 'text-amber-400' };
const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400', trialing: 'bg-blue-500/10 text-blue-400',
  past_due: 'bg-red-500/10 text-red-400', unpaid: 'bg-red-500/10 text-red-400',
  incomplete: 'bg-amber-500/10 text-amber-400', incomplete_expired: 'bg-red-500/10 text-red-400',
  canceled: 'bg-zinc-500/10 text-zinc-400',
};

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'plans' | 'subscription' | 'invoices' | 'usage'>('plans');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      setError('Select an organization before opening billing.');
      return;
    }
    try {
      setLoading(true);
      const [plansRes, subRes, invRes, usageRes] = await Promise.all([
        api.get<ApiResponse<Plan[]>>('/billing/plans'),
        api.get<ApiResponse<Subscription | null>>('/billing/subscription', { params: { organization_id: orgId } }),
        api.get<ApiResponse<Invoice[]>>('/billing/invoices', { params: { organization_id: orgId } }),
        api.get<ApiResponse<Record<string, number>>>('/billing/usage', { params: { organization_id: orgId } }),
      ]);
      setPlans(plansRes.data || []);
      setSubscription(subRes.data || null);
      setInvoices(invRes.data || []);
      setUsage(usageRes.data || {});
      if (subRes.data?.billing_cycle === 'yearly') setBillingCycle('yearly');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load billing.');
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (checkout === 'success') {
      setTab('subscription');
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
      setBusy(planSlug);
      setError(null);
      const response = await api.post<ApiResponse<CheckoutResult>>('/billing/subscription', {
        body: { organization_id: orgId, plan_slug: planSlug, billing_cycle: billingCycle },
      });
      if (response.data?.checkout_url) {
        window.location.assign(response.data.checkout_url);
        return;
      }
      await fetchData();
      setTab('subscription');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Subscription request failed.');
    } finally { setBusy(null); }
  };

  const openPortal = async () => {
    try {
      setBusy('portal');
      setError(null);
      const response = await api.post<ApiResponse<PortalResult>>('/billing/portal', { body: { organization_id: orgId } });
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
      await api.put('/billing/subscription/cancel', { body: { organization_id: orgId, immediately: false } });
      await fetchData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Cancellation failed.');
    } finally { setBusy(null); }
  };

  const price = (plan: Plan) => billingCycle === 'yearly' ? plan.price_yearly_cents : plan.price_monthly_cents;
  const displayCycle = billingCycle === 'yearly' ? '/yr' : '/mo';
  const currentUsage = useMemo(() => Object.entries(usage), [usage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing & Subscription</h1>
          <p className="mt-1 text-sm text-zinc-400">Payments, cards and subscription changes are processed by Stripe.</p>
        </div>
        <button type="button" onClick={() => void openPortal()} disabled={busy === 'portal'} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50">
          {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          Manage billing
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white/[0.03] p-1">
        {([['plans', 'Plans', CreditCard], ['subscription', 'Subscription', Crown], ['invoices', 'Invoices', Receipt], ['usage', 'Usage', BarChart3]] as const).map(([key, label, Icon]) => (
          <button type="button" key={key} onClick={() => setTab(key)} className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${tab === key ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:text-white'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
        <button type="button" onClick={() => void fetchData()} className="ml-auto rounded-md p-2 text-zinc-400 hover:text-white" aria-label="Refresh billing">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div> : tab === 'plans' ? (
        <>
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1">
              {(['monthly', 'yearly'] as const).map((cycle) => (
                <button type="button" key={cycle} onClick={() => setBillingCycle(cycle)} className={`rounded-md px-4 py-2 text-sm capitalize ${billingCycle === cycle ? 'bg-brand-500 text-white' : 'text-zinc-400'}`}>
                  {cycle}{cycle === 'yearly' ? ' · save with annual pricing' : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const Icon = tierIcons[plan.tier] || Zap;
              const isCurrent = subscription?.plan_slug === plan.slug && subscription.billing_cycle === billingCycle;
              return (
                <article key={plan.id} className={`rounded-xl border p-6 ${isCurrent ? 'border-brand-500/50 bg-brand-500/5' : 'border-white/[0.06] bg-surface-100'}`}>
                  <div className="flex items-center gap-2"><Icon className={`h-5 w-5 ${tierColors[plan.tier] || 'text-zinc-400'}`} /><h3 className="text-lg font-bold text-white">{plan.name}</h3></div>
                  {plan.description && <p className="mt-1 text-xs text-zinc-500">{plan.description}</p>}
                  <div className="mt-4"><span className="text-3xl font-bold text-white">${(price(plan) / 100).toFixed(0)}</span><span className="text-sm text-zinc-400">{displayCycle}</span></div>
                  {plan.trial_days > 0 && <p className="mt-1 text-xs text-brand-400">{plan.trial_days}-day trial managed by Stripe</p>}
                  <ul className="mt-4 space-y-2">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-xs text-zinc-300"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />{feature}</li>)}</ul>
                  <button type="button" onClick={() => void handlePlan(plan.slug)} disabled={isCurrent || busy !== null} className={`mt-6 w-full rounded-lg py-2.5 text-sm font-semibold ${isCurrent ? 'cursor-default bg-white/[0.04] text-zinc-500' : 'bg-brand-500 text-white hover:bg-brand-400 disabled:opacity-50'}`}>
                    {busy === plan.slug ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : isCurrent ? 'Current plan' : subscription ? 'Change with Stripe' : price(plan) > 0 ? 'Continue to Stripe' : 'Activate free plan'}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      ) : tab === 'subscription' ? (
        !subscription ? <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center"><Crown className="mx-auto h-8 w-8 text-zinc-500" /><p className="mt-4 text-sm text-zinc-400">No subscription. Choose a plan to get started.</p></div> :
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-lg font-semibold text-white">{subscription.plan_name}</h3><p className="text-sm capitalize text-zinc-400">{subscription.billing_cycle} billing</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusColors[subscription.status] || 'bg-zinc-500/10 text-zinc-400'}`}>{subscription.status.replace(/_/g, ' ')}</span></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-zinc-500">Period end</p><p className="text-sm text-white">{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'Pending Stripe confirmation'}</p></div>{subscription.trial_end && <div><p className="text-xs text-zinc-500">Trial end</p><p className="text-sm text-white">{new Date(subscription.trial_end).toLocaleDateString()}</p></div>}<div><p className="text-xs text-zinc-500">Renewal</p><p className="text-sm text-white">{subscription.cancel_at_period_end ? 'Ends this period' : 'Automatic'}</p></div></div>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => void openPortal()} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white"><ArrowUpRight className="h-4 w-4" />Open Stripe portal</button>{['active', 'trialing'].includes(subscription.status) && !subscription.cancel_at_period_end && <button type="button" onClick={() => void handleCancel()} disabled={busy === 'cancel'} className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm font-medium text-red-400 disabled:opacity-50">{busy === 'cancel' ? 'Submitting…' : 'Cancel at period end'}</button>}</div>
        </div>
      ) : tab === 'invoices' ? (
        invoices.length === 0 ? <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center"><Receipt className="mx-auto h-8 w-8 text-zinc-500" /><p className="mt-4 text-sm text-zinc-400">No Stripe invoices yet.</p></div> :
        <div className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06] bg-surface-100">{invoices.map((invoice) => <div key={invoice.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-white">{invoice.invoice_number || invoice.description || 'Invoice'}</p><p className="text-xs text-zinc-500">{new Date(invoice.created_at).toLocaleDateString()}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold text-white">${(invoice.total_cents / 100).toFixed(2)}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${invoice.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{invoice.status}</span>{invoice.hosted_invoice_url && <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer" className="text-brand-400"><ExternalLink className="h-4 w-4" /></a>}</div></div>)}</div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6"><h2 className="mb-4 text-lg font-semibold text-white">Current usage</h2>{currentUsage.length === 0 ? <p className="text-sm text-zinc-400">No usage data for this period.</p> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{currentUsage.map(([metric, count]) => <div key={metric} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-xs capitalize text-zinc-500">{metric.replace(/_/g, ' ')}</p><p className="mt-1 text-2xl font-bold text-white">{count.toLocaleString()}</p></div>)}</div>}</div>
      )}
    </div>
  );
}
