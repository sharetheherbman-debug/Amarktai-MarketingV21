'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Bot, CheckCircle2, Coins, Gauge, Loader2, PauseCircle,
  PlayCircle, RefreshCw, Save, ShieldAlert, ShieldCheck, WalletCards, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

type Mode = 'manual' | 'approval' | 'autonomous';
type Channel = 'content' | 'social' | 'email' | 'advertising' | 'seo' | 'analytics';

interface Policy {
  organization_id: string;
  operating_mode: Mode;
  emergency_stop: boolean;
  daily_generation_credit_limit: number;
  per_action_credit_limit: number;
  daily_ad_budget_pence: number;
  per_campaign_ad_limit_pence: number;
  approval_credit_threshold: number;
  approval_ad_threshold_pence: number;
  allowed_channels: Channel[];
  require_approval_for_new_channel: boolean;
  require_approval_for_new_audience: boolean;
  require_approval_for_price_claims: boolean;
  timezone: string;
  active_from: string | null;
  active_until: string | null;
  version: number;
}

interface Decision {
  id: string;
  action_type: string;
  channel: string;
  title: string;
  summary: string | null;
  status: string;
  requested_credits: number;
  requested_ad_spend_pence: number;
  requested_by: string;
  decision_reason: string | null;
  created_at: string;
  decided_at: string | null;
}

interface ControlCentre {
  policy: Policy;
  runtime: {
    state: string;
    can_execute_autonomously: boolean;
    in_active_window: boolean;
  };
  wallet: {
    available_credits: number;
    reserved_credits: number;
    lifetime_spent_credits: number;
    currency: 'GBP';
  };
  today: {
    generation_credits_used: number;
    generation_credits_remaining: number;
    daily_generation_credit_limit: number;
    daily_ad_budget_pence: number;
    recorded_ad_spend_pence: number;
  };
  connections: Array<{ category: string; total: number; active: number; healthy: number }>;
  conversion_events: Array<{ event_type: string; count: number; last_occurred_at: string }>;
  decisions: Decision[];
}

const channelOptions: Array<{ value: Channel; label: string }> = [
  { value: 'content', label: 'Content creation' },
  { value: 'social', label: 'Social publishing' },
  { value: 'email', label: 'Email marketing' },
  { value: 'advertising', label: 'Paid advertising' },
  { value: 'seo', label: 'SEO work' },
  { value: 'analytics', label: 'Analytics sync' },
];

function gbp(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((Number(pence) || 0) / 100);
}

function numberInput(value: number, onChange: (value: number) => void, suffix?: string) {
  return (
    <div className="relative">
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number.parseInt(event.target.value || '0', 10) || 0))}
        className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 pr-20 text-sm text-white outline-none focus:border-brand-500/50"
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-zinc-500">{suffix}</span>}
    </div>
  );
}

export default function RelaunchControlPage() {
  const [data, setData] = useState<ControlCentre | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<ApiResponse<ControlCentre>>('/relaunch-control');
      if (!response.data) throw new Error('Relaunch control data is unavailable.');
      setData(response.data);
      setDraft(response.data.policy);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the Relaunch Control Centre.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pending = useMemo(() => data?.decisions.filter((decision) => decision.status === 'pending') || [], [data]);
  const connectedTotal = useMemo(() => data?.connections.reduce((sum, row) => sum + row.active, 0) || 0, [data]);
  const healthyTotal = useMemo(() => data?.connections.reduce((sum, row) => sum + row.healthy, 0) || 0, [data]);

  const updateDraft = <K extends keyof Policy>(key: K, value: Policy[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const savePolicy = async () => {
    if (!draft) return;
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      await api.put<ApiResponse<Policy>>('/relaunch-control/policy', {
        body: {
          operating_mode: draft.operating_mode,
          emergency_stop: draft.emergency_stop,
          daily_generation_credit_limit: draft.daily_generation_credit_limit,
          per_action_credit_limit: draft.per_action_credit_limit,
          daily_ad_budget_pence: draft.daily_ad_budget_pence,
          per_campaign_ad_limit_pence: draft.per_campaign_ad_limit_pence,
          approval_credit_threshold: draft.approval_credit_threshold,
          approval_ad_threshold_pence: draft.approval_ad_threshold_pence,
          allowed_channels: draft.allowed_channels,
          require_approval_for_new_channel: draft.require_approval_for_new_channel,
          require_approval_for_new_audience: draft.require_approval_for_new_audience,
          require_approval_for_price_claims: draft.require_approval_for_price_claims,
          timezone: draft.timezone,
          active_from: draft.active_from,
          active_until: draft.active_until,
          reason: 'Updated through Relaunch Control Centre',
        },
      });
      setNotice('Relaunch policy saved and added to the immutable audit trail.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the relaunch policy.');
    } finally {
      setSaving(false);
    }
  };

  const setStop = async (stopped: boolean) => {
    const reason = window.prompt(stopped ? 'Why are you stopping all autonomous activity?' : 'Why is it safe to resume activity?');
    if (!reason?.trim()) return;
    try {
      setBusyAction('stop');
      setError(null);
      await api.post('/relaunch-control/emergency-stop', { body: { stopped, reason: reason.trim() } });
      setNotice(stopped ? 'Emergency stop activated.' : 'Emergency stop released. Policy limits still apply.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the emergency stop.');
    } finally {
      setBusyAction(null);
    }
  };

  const decide = async (decision: Decision, nextStatus: 'approved' | 'rejected') => {
    const reason = window.prompt(`${nextStatus === 'approved' ? 'Approval' : 'Rejection'} reason for “${decision.title}”:`);
    if (!reason?.trim()) return;
    try {
      setBusyAction(decision.id);
      setError(null);
      await api.post(`/relaunch-control/actions/${decision.id}/decision`, {
        body: { decision: nextStatus, reason: reason.trim() },
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not record the decision.');
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && !data) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>;
  }

  if (!draft || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-red-300">
        <AlertCircle className="mb-3 h-6 w-6" />{error || 'Relaunch Control Centre is unavailable.'}
      </div>
    );
  }

  const stopped = data.policy.emergency_stop;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-400">
            <ShieldCheck className="h-4 w-4" /> Safety and autonomy
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">Relaunch Control Centre</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">
            Control what the Marketing machine may do, how much it may spend in pounds, and which actions require human approval.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
          {stopped ? (
            <button type="button" onClick={() => void setStop(false)} disabled={busyAction === 'stop'} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
              {busyAction === 'stop' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}Release emergency stop
            </button>
          ) : (
            <button type="button" onClick={() => void setStop(true)} disabled={busyAction === 'stop'} className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busyAction === 'stop' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}Emergency stop
            </button>
          )}
        </div>
      </div>

      {error && <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300"><AlertCircle className="h-4 w-4" />{error}</div>}
      {notice && <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />{notice}</div>}

      <div className={`rounded-xl border p-5 ${stopped ? 'border-red-500/30 bg-red-500/5' : data.runtime.can_execute_autonomously ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {stopped ? <ShieldAlert className="h-7 w-7 text-red-400" /> : data.runtime.can_execute_autonomously ? <Bot className="h-7 w-7 text-emerald-400" /> : <Gauge className="h-7 w-7 text-amber-400" />}
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Runtime state</p>
              <p className="mt-0.5 text-xl font-bold capitalize text-white">{data.runtime.state.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <p className="max-w-xl text-sm text-zinc-400">
            {stopped
              ? 'All autonomous actions are blocked. Drafting and reporting may continue only when explicitly run by a user.'
              : data.runtime.can_execute_autonomously
                ? 'Approved channels may operate automatically inside the configured credit and GBP limits.'
                : 'The workspace is operating manually or requires approvals before execution.'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><Coins className="h-5 w-5 text-brand-400" /><p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">Credits available</p><p className="mt-1 text-2xl font-bold text-white">{data.wallet.available_credits.toLocaleString('en-GB')}</p><p className="mt-1 text-xs text-zinc-500">{data.wallet.reserved_credits.toLocaleString('en-GB')} reserved</p></article>
        <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><Gauge className="h-5 w-5 text-brand-400" /><p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">Credits used today</p><p className="mt-1 text-2xl font-bold text-white">{data.today.generation_credits_used.toLocaleString('en-GB')}</p><p className="mt-1 text-xs text-zinc-500">Limit {data.today.daily_generation_credit_limit.toLocaleString('en-GB')}</p></article>
        <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><WalletCards className="h-5 w-5 text-brand-400" /><p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">Daily ad budget</p><p className="mt-1 text-2xl font-bold text-white">{gbp(data.today.daily_ad_budget_pence)}</p><p className="mt-1 text-xs text-zinc-500">Recorded spend {gbp(data.today.recorded_ad_spend_pence)}</p></article>
        <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><ShieldCheck className="h-5 w-5 text-brand-400" /><p className="mt-4 text-xs uppercase tracking-wide text-zinc-500">Connections</p><p className="mt-1 text-2xl font-bold text-white">{healthyTotal}/{connectedTotal}</p><p className="mt-1 text-xs text-zinc-500">Healthy active connections</p></article>
      </div>

      <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-lg font-semibold text-white">Operating policy</h2><p className="mt-1 text-sm text-zinc-500">Policy version {data.policy.version}. Changes are written to an immutable audit trail.</p></div>
          <button type="button" onClick={() => void savePolicy()} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save policy
          </button>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="space-y-5">
            <div><label className="mb-2 block text-sm font-medium text-zinc-300">Operating mode</label><div className="grid grid-cols-3 gap-2">{(['manual', 'approval', 'autonomous'] as Mode[]).map((mode) => <button type="button" key={mode} onClick={() => updateDraft('operating_mode', mode)} className={`rounded-lg border px-3 py-3 text-sm font-semibold capitalize ${draft.operating_mode === mode ? 'border-brand-500 bg-brand-500/10 text-brand-300' : 'border-white/10 text-zinc-400 hover:bg-white/5'}`}>{mode}</button>)}</div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-zinc-300">Daily Generation Credit limit{numberInput(draft.daily_generation_credit_limit, (value) => updateDraft('daily_generation_credit_limit', value), 'credits')}</label>
              <label className="text-sm text-zinc-300">Per-action credit limit{numberInput(draft.per_action_credit_limit, (value) => updateDraft('per_action_credit_limit', value), 'credits')}</label>
              <label className="text-sm text-zinc-300">Daily advertising budget{numberInput(draft.daily_ad_budget_pence, (value) => updateDraft('daily_ad_budget_pence', value), 'pence')}</label>
              <label className="text-sm text-zinc-300">Per-campaign ad limit{numberInput(draft.per_campaign_ad_limit_pence, (value) => updateDraft('per_campaign_ad_limit_pence', value), 'pence')}</label>
              <label className="text-sm text-zinc-300">Credit approval threshold{numberInput(draft.approval_credit_threshold, (value) => updateDraft('approval_credit_threshold', value), 'credits')}</label>
              <label className="text-sm text-zinc-300">Ad approval threshold{numberInput(draft.approval_ad_threshold_pence, (value) => updateDraft('approval_ad_threshold_pence', value), 'pence')}</label>
            </div>
          </div>

          <div className="space-y-5">
            <div><label className="mb-2 block text-sm font-medium text-zinc-300">Allowed autonomous channels</label><div className="grid gap-2 sm:grid-cols-2">{channelOptions.map((channel) => { const enabled = draft.allowed_channels.includes(channel.value); return <button type="button" key={channel.value} onClick={() => updateDraft('allowed_channels', enabled ? draft.allowed_channels.filter((value) => value !== channel.value) : [...draft.allowed_channels, channel.value])} className={`flex items-center justify-between rounded-lg border px-3 py-3 text-left text-sm ${enabled ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300' : 'border-white/10 text-zinc-400'}`}><span>{channel.label}</span>{enabled ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}</button>; })}</div></div>
            <div className="space-y-2">{[
              ['require_approval_for_new_channel', 'Approve every newly connected channel'],
              ['require_approval_for_new_audience', 'Approve every new audience or targeting group'],
              ['require_approval_for_price_claims', 'Approve content containing price or savings claims'],
            ].map(([key, label]) => { const value = draft[key as keyof Policy] as boolean; return <button type="button" key={key} onClick={() => updateDraft(key as keyof Policy, !value as never)} className="flex w-full items-center justify-between rounded-lg border border-white/10 px-4 py-3 text-left text-sm text-zinc-300"><span>{label}</span><span className={`relative h-6 w-11 rounded-full ${value ? 'bg-brand-500' : 'bg-zinc-700'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} /></span></button>; })}</div>
            <label className="block text-sm text-zinc-300">Policy timezone<input value={draft.timezone} onChange={(event) => updateDraft('timezone', event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-brand-500/50" /></label>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Approval queue</h2><p className="mt-1 text-sm text-zinc-500">Actions that exceed policy or need human judgement.</p></div><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">{pending.length} pending</span></div>
          <div className="mt-5 space-y-3">{pending.length === 0 ? <div className="rounded-lg border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">No actions are awaiting approval.</div> : pending.map((decision) => <article key={decision.id} className="rounded-lg border border-white/10 bg-black/10 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-white">{decision.title}</p><p className="mt-1 text-xs capitalize text-zinc-500">{decision.channel} · {decision.action_type.replace(/_/g, ' ')}</p>{decision.summary && <p className="mt-2 text-sm text-zinc-400">{decision.summary}</p>}</div><div className="text-right text-xs text-zinc-400"><p>{decision.requested_credits.toLocaleString('en-GB')} credits</p><p>{gbp(decision.requested_ad_spend_pence)} ad spend</p></div></div><div className="mt-4 flex gap-2"><button type="button" onClick={() => void decide(decision, 'approved')} disabled={busyAction === decision.id} className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">Approve</button><button type="button" onClick={() => void decide(decision, 'rejected')} disabled={busyAction === decision.id} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 disabled:opacity-50">Reject</button></div></article>)}</div>
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">Connection readiness</h2><p className="mt-1 text-sm text-zinc-500">Autonomy can only act through healthy, authorised accounts.</p>
          <div className="mt-5 space-y-3">{data.connections.length === 0 ? <div className="rounded-lg border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">No social, advertising, analytics or email accounts are connected yet.</div> : data.connections.map((connection) => <div key={connection.category} className="flex items-center justify-between rounded-lg border border-white/10 px-4 py-3"><div><p className="text-sm font-medium capitalize text-white">{connection.category}</p><p className="text-xs text-zinc-500">{connection.active} active of {connection.total}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${connection.healthy === connection.active && connection.active > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{connection.healthy} healthy</span></div>)}</div>
        </section>
      </div>

      <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="text-lg font-semibold text-white">Recent conversion signals</h2><p className="mt-1 text-sm text-zinc-500">Consent-safe events received from connected applications such as EquiProfile.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.conversion_events.length === 0 ? <div className="col-span-full rounded-lg border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">No conversion events have been received yet.</div> : data.conversion_events.map((event) => <div key={event.event_type} className="rounded-lg border border-white/10 p-4"><p className="text-sm font-medium text-white">{event.event_type.replace(/_/g, ' ')}</p><p className="mt-2 text-2xl font-bold text-brand-300">{Number(event.count).toLocaleString('en-GB')}</p><p className="mt-1 text-xs text-zinc-500">Last {new Date(event.last_occurred_at).toLocaleString('en-GB')}</p></div>)}</div>
      </section>
    </div>
  );
}
