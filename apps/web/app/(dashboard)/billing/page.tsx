'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Loader2,
  AlertCircle,
  X,
  CheckCircle2,
  Crown,
  Zap,
  Building2,
  Star,
  Receipt,
  BarChart3,
  Settings,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Plan { id: string; slug: string; name: string; description: string | null; tier: string; price_monthly_cents: number; price_yearly_cents: number; features: string[]; limits: Record<string, number>; trial_days: number; }
interface Subscription { id: string; plan_name: string; plan_slug: string; status: string; billing_cycle: string; current_period_end: string | null; trial_end: string | null; cancel_at_period_end: boolean; }
interface Invoice { id: string; invoice_number: string | null; status: string; total_cents: number; description: string | null; created_at: string; }

const tierIcons: Record<string, typeof Crown> = { free: Zap, starter: Star, professional: Crown, enterprise: Building2 };
const tierColors: Record<string, string> = { free: 'text-zinc-400', starter: 'text-blue-400', professional: 'text-brand-400', enterprise: 'text-amber-400' };
const statusColors: Record<string, string> = { active: 'bg-emerald-500/10 text-emerald-400', trialing: 'bg-blue-500/10 text-blue-400', past_due: 'bg-red-500/10 text-red-400', canceled: 'bg-zinc-500/10 text-zinc-400' };

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'plans' | 'subscription' | 'invoices' | 'usage'>('plans');

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [plansRes, subRes, invRes, usageRes] = await Promise.all([
        api.get<ApiResponse<Plan[]>>('/billing/plans'),
        api.get<ApiResponse<Subscription | null>>('/billing/subscription', { params: { organization_id: orgId } }),
        api.get<ApiResponse<Invoice[]>>('/billing/invoices', { params: { organization_id: orgId } }),
        api.get<ApiResponse<Record<string, number>>>('/billing/usage', { params: { organization_id: orgId } }),
      ]);
      setPlans(plansRes.data);
      setSubscription(subRes.data);
      setInvoices(invRes.data);
      setUsage(usageRes.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubscribe = async (planSlug: string) => {
    try {
      await api.post('/billing/subscription', { body: { organization_id: orgId, plan_slug: planSlug, billing_cycle: 'monthly' } });
      fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Subscribe failed'); }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel your subscription?')) return;
    try {
      await api.put('/billing/subscription/cancel', { body: { organization_id: orgId } });
      fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Cancel failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing & Subscription</h1>
          <p className="mt-1 text-sm text-zinc-400">Manage your plan, payments, and usage.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-1">
        {([['plans', 'Plans', CreditCard], ['subscription', 'Subscription', Crown], ['invoices', 'Invoices', Receipt], ['usage', 'Usage', BarChart3]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as typeof tab)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:text-white'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : tab === 'plans' ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map(plan => {
            const Icon = tierIcons[plan.tier] || Zap;
            const isCurrent = subscription?.plan_slug === plan.slug;
            return (
              <div key={plan.id} className={`rounded-xl border p-6 transition-all ${isCurrent ? 'border-brand-500/50 bg-brand-500/5' : 'border-white/[0.06] bg-surface-100 hover:border-brand-500/20'}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${tierColors[plan.tier] || 'text-zinc-400'}`} />
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                </div>
                {plan.description && <p className="mt-1 text-xs text-zinc-500">{plan.description}</p>}
                <div className="mt-4">
                  <span className="text-3xl font-bold text-white">${plan.price_monthly_cents / 100}</span>
                  <span className="text-sm text-zinc-400">/mo</span>
                </div>
                {plan.trial_days > 0 && <p className="mt-1 text-xs text-brand-400">{plan.trial_days}-day free trial</p>}
                <ul className="mt-4 space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />{f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => handleSubscribe(plan.slug)} disabled={isCurrent}
                  className={`mt-6 w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${isCurrent ? 'bg-white/[0.04] text-zinc-500 cursor-default' : 'bg-brand-500 text-white hover:bg-brand-400'}`}>
                  {isCurrent ? 'Current Plan' : subscription ? 'Switch Plan' : 'Get Started'}
                </button>
              </div>
            );
          })}
        </div>
      ) : tab === 'subscription' ? (
        !subscription ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
            <Crown className="mx-auto h-8 w-8 text-zinc-500" />
            <p className="mt-4 text-sm text-zinc-400">No active subscription. Choose a plan to get started.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{subscription.plan_name}</h3>
                  <p className="text-sm text-zinc-400 capitalize">{subscription.billing_cycle} billing</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[subscription.status] || 'bg-zinc-500/10 text-zinc-400'}`}>
                  {subscription.status}
                </span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div><p className="text-xs text-zinc-500">Period End</p><p className="text-sm text-white">{subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString() : 'N/A'}</p></div>
                {subscription.trial_end && <div><p className="text-xs text-zinc-500">Trial End</p><p className="text-sm text-white">{new Date(subscription.trial_end).toLocaleDateString()}</p></div>}
                <div><p className="text-xs text-zinc-500">Auto-Renew</p><p className="text-sm text-white">{subscription.cancel_at_period_end ? 'No' : 'Yes'}</p></div>
              </div>
              {subscription.status === 'active' && !subscription.cancel_at_period_end && (
                <button onClick={handleCancel} className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10">
                  Cancel Subscription
                </button>
              )}
            </div>
          </div>
        )
      ) : tab === 'invoices' ? (
        invoices.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
            <Receipt className="mx-auto h-8 w-8 text-zinc-500" /><p className="mt-4 text-sm text-zinc-400">No invoices yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100">
            <div className="divide-y divide-white/[0.06]">
              {invoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-white">{inv.invoice_number || inv.description}</p>
                    <p className="text-xs text-zinc-500">{new Date(inv.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">${(inv.total_cents / 100).toFixed(2)}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{inv.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Current Usage</h2>
          {Object.keys(usage).length === 0 ? (
            <p className="text-sm text-zinc-400">No usage data for this period.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(usage).map(([metric, count]) => (
                <div key={metric} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="text-xs text-zinc-500 capitalize">{metric.replace(/_/g, ' ')}</p>
                  <p className="mt-1 text-2xl font-bold text-white">{count.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
