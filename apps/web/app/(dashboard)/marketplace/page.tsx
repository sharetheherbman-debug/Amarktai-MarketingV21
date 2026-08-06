'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, Download, FileText, Filter, GitBranch, Loader2, Package, Puzzle, Search, Sparkles, Star, Store, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface MarketplaceItem { id: string; name: string; description: string | null; category: string; publisher_name: string; version: string; is_free: boolean; price_cents: number; install_count: number; rating_average: number; rating_count: number; tags: string[]; }
interface Installation { id: string; item_id: string; item_name: string; installed_version: string; current_version: string; health_status: string; installed_entities: Record<string, string[]> | string; }

const icons: Record<string, typeof Bot> = { agent: Bot, prompt_pack: FileText, workflow: GitBranch, plugin: Puzzle, skill_pack: Sparkles };
const labels: Record<string, string> = { agent: 'AI Agents', prompt_pack: 'Prompt Packs', workflow: 'Workflows', plugin: 'Plugins', skill_pack: 'Skill Packs' };

export default function MarketplacePage() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('popular');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { sort };
      if (category !== 'all') params.category = category;
      if (search.trim()) params.search = search.trim();
      const [itemsResponse, installationsResponse] = await Promise.all([
        api.get<ApiResponse<MarketplaceItem[]>>('/marketplace/items', { params }),
        api.get<ApiResponse<Installation[]>>('/marketplace/installations'),
      ]);
      setItems(itemsResponse.data || []);
      setInstallations(installationsResponse.data || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Failed to load marketplace.'); }
    finally { setLoading(false); }
  }, [category, search, sort]);

  useEffect(() => { void load(); }, [load]);
  const installedByItem = useMemo(() => new Map(installations.map((installation) => [installation.item_id, installation])), [installations]);

  const install = async (itemId: string) => {
    setBusyId(itemId);
    setError(null);
    try { await api.post(`/marketplace/items/${itemId}/install`, { body: { config: {} } }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Installation failed.'); }
    finally { setBusyId(null); }
  };

  const uninstall = async (itemId: string) => {
    if (!confirm('Uninstall this item and remove the agents, prompts, workflows and tools it added?')) return;
    setBusyId(itemId);
    try { await api.delete(`/marketplace/items/${itemId}/install`); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Uninstall failed.'); }
    finally { setBusyId(null); }
  };

  return <div className="space-y-6">
    <header><h1 className="text-2xl font-bold text-white">Marketplace</h1><p className="mt-1 text-sm text-zinc-400">Install versioned packages that create real agents, prompts, workflows and tools in your organization.</p></header>
    {error && <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3"><AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p><button type="button" onClick={() => setError(null)} className="ml-auto text-red-400"><X className="h-4 w-4" /></button></div>}
    <div className="flex flex-col gap-4 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search marketplace" className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-10 pr-3 text-sm text-white" /></div><div className="flex gap-2"><Filter className="mt-3 h-4 w-4 text-zinc-500" /><select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"><option value="all">All categories</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white"><option value="popular">Most popular</option><option value="rating">Highest rated</option><option value="newest">Newest</option></select></div></div>
    {installations.length > 0 && <section><h2 className="mb-3 text-sm font-semibold text-white">Installed packages</h2><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{installations.map((installation) => <article key={installation.id} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"><div className="flex items-start justify-between"><div><h3 className="text-sm font-medium text-white">{installation.item_name}</h3><p className="text-xs text-zinc-500">Installed v{installation.installed_version}{installation.current_version !== installation.installed_version ? ` · update v${installation.current_version}` : ''}</p></div><CheckCircle2 className="h-4 w-4 text-emerald-400" /></div><button type="button" onClick={() => void uninstall(installation.item_id)} className="mt-3 inline-flex items-center gap-1 text-xs text-red-400"><Trash2 className="h-3.5 w-3.5" />Uninstall assets</button></article>)}</div></section>}
    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div> : items.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 py-20 text-center"><Store className="mx-auto h-10 w-10 text-zinc-600" /><p className="mt-3 text-sm text-zinc-500">No published packages match the filters.</p></div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => { const Icon = icons[item.category] || Package; const installed = installedByItem.get(item.id); return <article key={item.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><div className="flex items-start justify-between"><div className="flex gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10"><Icon className="h-5 w-5 text-brand-400" /></div><div><h3 className="text-sm font-semibold text-white">{item.name}</h3><p className="text-xs text-zinc-500">{item.publisher_name} · v{item.version}</p></div></div>{installed && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}</div><p className="mt-3 line-clamp-3 text-xs text-zinc-400">{item.description}</p><div className="mt-3 flex flex-wrap gap-1">{item.tags?.slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-500">{tag}</span>)}</div><div className="mt-4 flex items-center justify-between"><div className="flex gap-3 text-xs text-zinc-400"><span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-400" />{Number(item.rating_average || 0).toFixed(1)}</span><span className="flex items-center gap-1"><Download className="h-3.5 w-3.5" />{item.install_count}</span></div>{installed ? <button type="button" onClick={() => void uninstall(item.id)} className="rounded border border-red-500/20 px-3 py-1.5 text-xs text-red-400">Uninstall</button> : <button type="button" disabled={busyId === item.id} onClick={() => void install(item.id)} className="rounded bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{busyId === item.id ? 'Installing…' : item.is_free ? 'Install' : `$${(item.price_cents / 100).toFixed(2)}`}</button>}</div></article>; })}</div>}
  </div>;
}
