'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CircleDollarSign, FileCheck2, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

type Control = {
  emergency_stop?: boolean;
  operating_mode?: string;
  status?: string;
  daily_generation_credit_limit?: number | string | null;
  monthly_generation_credit_limit?: number | string | null;
};

type Wallet = {
  available_credits?: number | string;
  balance?: number | string;
  reserved_credits?: number | string;
  total_reserved?: number | string;
};

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—';
}

export default function UsageSafetyPage() {
  const [control, setControl] = useState<Control>({});
  const [wallet, setWallet] = useState<Wallet>({});
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [controlResult, walletResult] = await Promise.allSettled([
      api.get<ApiResponse<Control>>('/relaunch-control'),
      api.get<ApiResponse<Wallet>>('/generation-credits/wallet'),
    ]);
    if (controlResult.status === 'fulfilled') setControl(controlResult.value.data || {});
    if (walletResult.status === 'fulfilled') setWallet(walletResult.value.data || {});
    setPartial(controlResult.status === 'rejected' || walletResult.status === 'rejected');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--ep-blue)]" /></div>;

  const paused = control.emergency_stop === true;
  const available = wallet.available_credits ?? wallet.balance;
  const reserved = wallet.reserved_credits ?? wallet.total_reserved;
  const mode = String(control.operating_mode || 'unavailable');

  return (
    <div className="space-y-6">
      <header className="ep-panel p-6 sm:p-8">
        <p className="ep-section-label">Usage & Safety</p>
        <h1 className="ep-page-title mt-2">Know what can run, what needs approval and what it can spend.</h1>
        <p className="ep-page-copy mt-3 max-w-3xl text-sm leading-6 sm:text-base">This customer view reports the Control Centre and Generation Credit state without exposing dangerous operator or provider controls.</p>
      </header>

      {partial && <div className="ep-status-warning rounded-xl border px-4 py-3 text-sm">Some live usage information is unavailable. The workspace has not been changed.</div>}

      <section className={`${paused ? 'ep-status-warning' : 'ep-status-success'} rounded-2xl border p-5 sm:p-6`}>
        <div className="flex items-start gap-3"><div className="rounded-xl bg-white/70 p-2.5"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-xs font-extrabold uppercase tracking-wide">Control Centre</p><h2 className="mt-1 text-xl font-extrabold">{paused ? 'External execution is paused' : 'Execution is available within policy'}</h2><p className="mt-2 text-sm leading-6 opacity-80">Operating mode: <strong className="capitalize">{mode}</strong>. {paused ? 'Generation, rendering and outbound actions remain blocked by Emergency Stop.' : 'Fresh policy decisions, approvals and spending controls still apply before external actions.'}</p></div></div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="ep-card p-5"><CircleDollarSign className="h-5 w-5 text-[var(--ep-blue)]" /><p className="mt-4 text-xs font-bold text-[var(--ep-text-muted)]">Available Generation Credits</p><p className="mt-1 text-2xl font-extrabold text-[var(--ep-navy)]">{number(available)}</p></article>
        <article className="ep-card p-5"><CircleDollarSign className="h-5 w-5 text-[var(--ep-blue)]" /><p className="mt-4 text-xs font-bold text-[var(--ep-text-muted)]">Reserved</p><p className="mt-1 text-2xl font-extrabold text-[var(--ep-navy)]">{number(reserved)}</p></article>
        <article className="ep-card p-5"><ShieldCheck className="h-5 w-5 text-[var(--ep-blue)]" /><p className="mt-4 text-xs font-bold text-[var(--ep-text-muted)]">Mode</p><p className="mt-1 text-2xl font-extrabold capitalize text-[var(--ep-navy)]">{mode}</p></article>
        <article className="ep-card p-5"><TriangleAlert className="h-5 w-5 text-[var(--ep-blue)]" /><p className="mt-4 text-xs font-bold text-[var(--ep-text-muted)]">Emergency Stop</p><p className="mt-1 text-2xl font-extrabold text-[var(--ep-navy)]">{paused ? 'On' : 'Off'}</p></article>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link href="/approvals" className="ep-card group p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><FileCheck2 className="h-5 w-5" /></div><div><h2 className="font-extrabold text-[var(--ep-navy)]">Owner approvals</h2><p className="mt-1 text-sm leading-5 text-[var(--ep-text-muted)]">Review exact content versions before customer-facing use.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--ep-blue)]">Open approvals <ArrowRight className="h-3.5 w-3.5" /></span></div></div></Link>
        <div className="ep-card p-5"><h2 className="font-extrabold text-[var(--ep-navy)]">Spend is governed, not estimated away</h2><p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">Paid generation reserves credits before provider execution and settles against actual usage. Failed/cancelled work releases unused reservations through the existing accounting path.</p></div>
      </section>
    </div>
  );
}
