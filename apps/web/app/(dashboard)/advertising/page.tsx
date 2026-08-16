'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Eye, Loader2, Megaphone, MousePointerClick, RefreshCw, Target, WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Connection { id: string; name: string; provider_name: string; health_status: string; last_sync_at: string | null; }
interface Campaign { id: string; connection_name: string; provider_name: string; name: string; status: string; objective: string | null; metrics: Record<string, number> | string; last_synced_at: string; }

function readMetrics(value: Campaign['metrics']): Record<string, number> {
  if (typeof value === 'string') { try { return JSON.parse(value) as Record<string, number>; } catch { return {}; } }
  return value || {};
}

export default function AdvertisingPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connectionsResponse, campaignsResponse] = await Promise.all([
        api.get<ApiResponse<Connection[]>>('/integrations/connections', { params: { category: 'advertising' } }),
        api.get<ApiResponse<Campaign[]>>('/integrations/advertising/campaigns'),
      ]);
      setConnections(connectionsResponse.data || []);
      setCampaigns(campaignsResponse.data || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Failed to load advertising data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sync = async (id: string) => {
    setBusyId(id);
    try { await api.post(`/integrations/advertising/connections/${id}/sync`, { body: {} }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Advertising sync failed.'); }
    finally { setBusyId(null); }
  };

  const totals = useMemo(() => campaigns.reduce((sum, campaign) => {
    const metric = readMetrics(campaign.metrics);
    sum.impressions += Number(metric.impressions || 0);
    sum.clicks += Number(metric.clicks || 0);
    sum.spend += Number(metric.spend_cents || 0);
    sum.conversions += Number(metric.conversions || 0);
    return sum;
  }, { impressions: 0, clicks: 0, spend: 0, conversions: 0 }), [campaigns]);

  const cards = [
    ['Impressions', totals.impressions, Eye],
    ['Clicks', totals.clicks, MousePointerClick],
    ['Spend', `$${(totals.spend / 100).toLocaleString()}`, WalletCards],
    ['Conversions', totals.conversions, Target],
  ] as const;

  return <div className="space-y-6">
    <header className="flex items-center justify-between"><div><h1 className="text-2xl font-bold text-white">Advertising</h1><p className="mt-1 text-sm text-zinc-400">Synchronized Meta Ads and Google Ads campaigns with real performance data.</p></div><button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-white"><RefreshCw className="h-4 w-4" />Refresh</button></header>
    {error && <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300"><AlertCircle className="h-4 w-4" />{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon]) => <article key={label} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><div className="flex justify-between"><p className="text-sm text-zinc-400">{label}</p><Icon className="h-4 w-4 text-brand-400" /></div><p className="mt-3 text-3xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p></article>)}</div>
    <section><h2 className="mb-3 text-sm font-semibold text-white">Connected ad accounts</h2><div className="grid gap-4 md:grid-cols-3">{connections.map((connection) => <article key={connection.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><h3 className="text-sm font-semibold text-white">{connection.name}</h3><p className="text-xs text-zinc-500">{connection.provider_name} · {connection.health_status}</p><p className="mt-2 text-xs text-zinc-500">{connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : 'Never synchronized'}</p><button type="button" onClick={() => void sync(connection.id)} className="mt-4 inline-flex items-center gap-2 rounded bg-brand-500 px-3 py-1.5 text-xs text-white">{busyId === connection.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Sync campaigns</button></article>)}</div>{connections.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">Add Meta Ads or Google Ads in Integrations.</p>}</section>
    <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-100"><div className="border-b border-white/[0.06] px-6 py-4"><h2 className="text-sm font-semibold text-white">Campaigns</h2></div>{loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-400" /></div> : campaigns.length === 0 ? <div className="py-16 text-center"><Megaphone className="mx-auto h-8 w-8 text-zinc-600" /><p className="mt-3 text-sm text-zinc-500">No synchronized campaigns yet.</p></div> : <div className="divide-y divide-white/[0.06]">{campaigns.map((campaign) => { const metric = readMetrics(campaign.metrics); return <article key={campaign.id} className="px-6 py-4"><div className="flex justify-between gap-3"><div><h3 className="text-sm font-medium text-white">{campaign.name}</h3><p className="text-xs text-zinc-500">{campaign.provider_name} · {campaign.connection_name} · {campaign.objective || 'No objective'}</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs capitalize text-zinc-300">{campaign.status}</span></div><div className="mt-3 flex flex-wrap gap-2">{Object.entries(metric).map(([name, value]) => <span key={name} className="rounded bg-white/5 px-2.5 py-1 text-xs text-zinc-300">{name.replaceAll('_', ' ')}: {name === 'spend_cents' ? `$${(Number(value) / 100).toLocaleString()}` : Number(value).toLocaleString()}</span>)}</div></article>; })}</div>}</section>
  </div>;
}
