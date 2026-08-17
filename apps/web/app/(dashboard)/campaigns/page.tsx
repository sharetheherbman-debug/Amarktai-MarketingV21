'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Filter, Loader2, Megaphone, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const statuses = ['all', 'draft', 'active', 'paused', 'completed'];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<ApiResponse<Campaign[]>>('/campaigns', { params: { limit: '100' } });
      setCampaigns(response.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Campaigns could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => campaigns.filter((campaign) => {
    const matchesStatus = statusFilter === 'all' || campaign.status === statusFilter;
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || campaign.name.toLowerCase().includes(needle) || campaign.description?.toLowerCase().includes(needle);
    return matchesStatus && matchesSearch;
  }), [campaigns, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="mt-1 text-sm text-zinc-400">Plan and track coordinated marketing work across your channels.</p>
        </div>
        <Link href="/campaigns/new" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600">
          <Plus className="h-4 w-4" /> Create campaign
        </Link>
      </div>

      {error && <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}<button type="button" onClick={() => void load()} className="ml-auto font-semibold">Try again</button></div>}

      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-surface-100 p-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search campaigns</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search campaigns" className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] pl-10 pr-4 text-sm text-white" />
        </label>
        <div className="flex flex-wrap items-center gap-2"><Filter className="h-4 w-4 text-zinc-500" />{statuses.map((status) => <button type="button" key={status} onClick={() => setStatusFilter(status)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${statusFilter === status ? 'bg-brand-500/10 text-brand-600' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>{status}</button>)}</div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-surface-100 px-6 py-16 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10"><Megaphone className="h-7 w-7 text-brand-500" /></div>
          <h2 className="mt-5 text-lg font-semibold text-white">{campaigns.length ? 'No campaigns match these filters' : 'No campaigns yet'}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">{campaigns.length ? 'Try a different search or status.' : 'Create a campaign brief to organise your goals, channels and content.'}</p>
          {!campaigns.length && <Link href="/campaigns/new" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Create your first campaign</Link>}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((campaign) => <article key={campaign.id} className="rounded-2xl border border-white/[0.06] bg-surface-100 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-500">{campaign.type}</p><h2 className="mt-1 text-base font-semibold text-white">{campaign.name}</h2></div><span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-semibold capitalize text-brand-600">{campaign.status}</span></div>
            <p className="mt-3 line-clamp-3 min-h-[3.75rem] text-sm text-zinc-400">{campaign.description || 'No description has been added.'}</p>
            <p className="mt-4 text-xs text-zinc-500">Updated {new Date(campaign.updated_at || campaign.created_at).toLocaleDateString('en-GB')}</p>
          </article>)}
        </div>
      )}
    </div>
  );
}
