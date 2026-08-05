'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Store,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  X,
  Download,
  Star,
  CheckCircle2,
  Package,
  Bot,
  FileText,
  GitBranch,
  Puzzle,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface MarketplaceItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  publisher_name: string;
  version: string;
  is_free: boolean;
  price_cents: number;
  install_count: number;
  rating_average: number;
  rating_count: number;
  tags: string[];
  status: string;
}

const categoryIcons: Record<string, typeof Bot> = {
  agent: Bot,
  prompt_pack: FileText,
  workflow: GitBranch,
  plugin: Puzzle,
  skill_pack: Sparkles,
};

const categoryLabels: Record<string, string> = {
  agent: 'AI Agents',
  prompt_pack: 'Prompt Packs',
  workflow: 'Workflows',
  plugin: 'Plugins',
  skill_pack: 'Skill Packs',
};

export default function MarketplacePage() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('popular');

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (categoryFilter !== 'all') params.category = categoryFilter;
      if (search) params.search = search;
      if (sortBy) params.sort = sortBy;
      const res = await api.get<ApiResponse<MarketplaceItem[]>>('/marketplace/items', { params });
      setItems(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, search, sortBy]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleInstall = async (itemId: string) => {
    if (!orgId) return;
    try {
      await api.post(`/marketplace/items/${itemId}/install`, {
        body: { organization_id: orgId },
      });
      fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install');
    }
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Marketplace</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Discover and install agents, prompts, workflows, and plugins.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search marketplace..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="popular">Most Popular</option>
            <option value="rating">Highest Rated</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.06] py-20">
          <Store className="h-12 w-12 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No items found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => {
            const CategoryIcon = categoryIcons[item.category] || Package;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                      <CategoryIcon className="h-5 w-5 text-brand-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{item.name}</h3>
                      <p className="text-xs text-zinc-500">{item.publisher_name}</p>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500">v{item.version}</span>
                </div>
                {item.description && (
                  <p className="mt-2 text-xs text-zinc-400 line-clamp-2">{item.description}</p>
                )}
                {item.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-xs text-zinc-400">
                        {item.rating_average.toFixed(1)} ({item.rating_count})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Download className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="text-xs text-zinc-400">{item.install_count}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleInstall(item.id)}
                    className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-400"
                  >
                    Install
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
