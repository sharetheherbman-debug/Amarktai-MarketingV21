'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BarChart3, Loader2, RefreshCw, TrendingUp, Users, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface AnalyticsSource {
  id: string;
  connection_id: string;
  connection_name: string;
  provider_name: string;
  period_start: string;
  period_end: string;
  metrics: Record<string, number> | string;
  collected_at: string;
}

interface AnalyticsSummary {
  totals: Record<string, number>;
  sources: AnalyticsSource[];
}

interface Connection {
  id: string;
  name: string;
  provider_name: string;
  health_status: string;
  last_sync_at: string | null;
}

function metrics(value: Record<string, number> | string): Record<string, number> {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, number>; } catch { return {}; }
  }
  return value || {};
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary>({ totals: {}, sources: [] });
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResponse, connectionResponse] = await Promise.all([
        api.get<ApiResponse<AnalyticsSummary>>('/integrations/analytics/summary'),
        api.get<ApiResponse<Connection[]>>('/integrations/connections', { params: { category: 'analytics' } }),
      ]);
      setSummary(summaryResponse.data || { totals: {}, sources: [] });
      setConnections(connectionResponse.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sync = async (id: string) => {
    setBusyId(id);
    setError(null);
    try { await api.post(`/integrations/analytics/connections/${id}/sync`, { body: {} }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Analytics sync failed.'); }
    finally { setBusyId(null); }
  };

  const cards = [
    { label: 'Users / Visitors', value: summary.totals.users ?? summary.totals.visitors ?? 0, icon: Users },
    { label: 'Sessions', value: summary.totals.sessions ?? 0, icon: TrendingUp },
    { label: 'Pageviews', value: summary.totals.pageviews ?? 0, icon: BarChart3 },
    { label: 'Conversions', value: summary.totals.conversions ?? 0, icon: Zap },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-white">External Analytics</h1><p className="mt-1 text-sm text-zinc-400">Synchronized GA4, Plausible and authenticated JSON metrics.</p></div><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white"><RefreshCw className="h-4 w-4" />Refresh</button></div>
      {error && <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300"><AlertCircle className="h-4 w-4" />{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map((card) => <article key={card.label} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><div className="flex items-center justify-between"><p className="text-sm text-zinc-400">{card.label}</p><card.icon className="h-4 w-4 text-brand-400" /></div><p className="mt-3 text-3xl font-bold text-white">{Number(card.value).toLocaleString()}</p></article>)}</div>

      <section><h2 className="mb-3 text-sm font-semibold text-white">Analytics connections</h2><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{connections.map((connection) => <article key={connection.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><h3 className="text-sm font-semibold text-white">{connection.name}</h3><p className="text-xs text-zinc-500">{connection.provider_name} · {connection.health_status}</p><p className="mt-2 text-xs text-zinc-500">{connection.last_sync_at ? `Last sync ${new Date(connection.last_sync_at).toLocaleString()}` : 'Never synchronized'}</p><button type="button" onClick={() => void sync(connection.id)} className="mt-4 inline-flex items-center gap-2 rounded bg-brand-500 px-3 py-1.5 text-xs text-white">{busyId === connection.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Sync 30 days</button></article>)}</div>{connections.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">Add an analytics provider from Integrations.</p>}</section>

      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-100"><div className="border-b border-white/[0.06] px-6 py-4"><h2 className="text-sm font-semibold text-white">Latest source snapshots</h2></div>{loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-400" /></div> : summary.sources.length === 0 ? <div className="py-16 text-center text-sm text-zinc-500">No analytics snapshots yet.</div> : <div className="divide-y divide-white/[0.06]">{summary.sources.map((source) => { const sourceMetrics = metrics(source.metrics); return <article key={source.id} className="px-6 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-medium text-white">{source.connection_name}</h3><p className="text-xs text-zinc-500">{source.provider_name} · {source.period_start} to {source.period_end}</p></div><p className="text-xs text-zinc-500">Collected {new Date(source.collected_at).toLocaleString()}</p></div><div className="mt-3 flex flex-wrap gap-2">{Object.entries(sourceMetrics).map(([name, value]) => <span key={name} className="rounded bg-white/5 px-2.5 py-1 text-xs text-zinc-300">{name.replaceAll('_', ' ')}: {Number(value).toLocaleString()}</span>)}</div></article>; })}</div>}</section>
    </div>
  );
}
