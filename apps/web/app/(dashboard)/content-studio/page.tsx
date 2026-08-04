'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText,
  Plus,
  Search,
  Filter,
  Loader2,
  AlertCircle,
  X,
  Globe,
  Mail,
  Megaphone,
  BarChart3,
  Clock,
  CheckCircle2,
  Eye,
  Edit3,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface ContentItem {
  id: string;
  title: string;
  type: string;
  platform: string | null;
  status: string;
  word_count: number;
  quality_score: number;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

const typeLabels: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  blog: { label: 'Blog Post', icon: FileText, color: 'text-blue-400' },
  article: { label: 'Article', icon: FileText, color: 'text-blue-400' },
  landing_page: { label: 'Landing Page', icon: Globe, color: 'text-purple-400' },
  sales_page: { label: 'Sales Page', icon: Megaphone, color: 'text-green-400' },
  email: { label: 'Email', icon: Mail, color: 'text-amber-400' },
  newsletter: { label: 'Newsletter', icon: Mail, color: 'text-amber-400' },
  social: { label: 'Social Post', icon: Globe, color: 'text-pink-400' },
  product_desc: { label: 'Product', icon: FileText, color: 'text-emerald-400' },
  press_release: { label: 'Press Release', icon: FileText, color: 'text-red-400' },
};

const statusConfig: Record<string, { color: string; bg: string }> = {
  draft: { color: 'text-zinc-400', bg: 'bg-zinc-500/10' },
  review: { color: 'text-amber-400', bg: 'bg-amber-500/10' },
  approved: { color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  published: { color: 'text-blue-400', bg: 'bg-blue-500/10' },
  rejected: { color: 'text-red-400', bg: 'bg-red-500/10' },
  archived: { color: 'text-zinc-500', bg: 'bg-zinc-500/10' },
};

export default function ContentStudioPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchItems = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const params: Record<string, string> = { organization_id: orgId };
      if (typeFilter !== 'all') params.type = typeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get<ApiResponse<ContentItem[]>>('/content-studio', { params });
      setItems(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [orgId, typeFilter, statusFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this content?')) return;
    try {
      await api.delete(`/content-studio/${id}`, { params: { organization_id: orgId } });
      fetchItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const filtered = items.filter(i => search ? i.title.toLowerCase().includes(search.toLowerCase()) : true);

  const stats = {
    total: items.length,
    drafts: items.filter(i => i.status === 'draft').length,
    published: items.filter(i => i.status === 'published').length,
    aiGenerated: items.filter(i => i.ai_generated).length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Content Studio</h1>
          <p className="mt-1 text-sm text-zinc-400">Create, manage, and publish AI-powered marketing content.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/content-studio/generate"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
          >
            <Sparkles className="h-4 w-4" />
            AI Generate
          </Link>
          <Link
            href="/content-studio/new"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-white/[0.06]"
          >
            <Plus className="h-4 w-4" />
            New Content
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Content', value: stats.total, icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Drafts', value: stats.drafts, icon: Edit3, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Published', value: stats.published, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'AI Generated', value: stats.aiGenerated, icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">{stat.label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </div>
            <p className="mt-3 text-3xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search content..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          {['all', 'draft', 'review', 'published'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === s ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]"><FileText className="h-8 w-8 text-zinc-500" /></div>
            <h3 className="mt-6 text-lg font-semibold text-white">No content yet</h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">Create your first piece of content or use AI to generate it.</p>
            <Link href="/content-studio/generate" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
              <Sparkles className="h-4 w-4" /> Generate with AI
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const typeInfo = typeLabels[item.type] || { label: item.type, icon: FileText, color: 'text-zinc-400' };
            const status = statusConfig[item.status] || statusConfig.draft;
            const TypeIcon = typeInfo.icon;
            return (
              <div key={item.id} className="group rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                      <TypeIcon className={`h-5 w-5 ${typeInfo.color}`} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                      <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                        <span>{typeInfo.label}</span>
                        {item.platform && <span>{item.platform}</span>}
                        <span>{item.word_count} words</span>
                        {item.ai_generated && <span className="text-purple-400">AI</span>}
                        <span>{new Date(item.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.bg} ${status.color}`}>
                      {item.status}
                    </span>
                    {item.quality_score > 0 && (
                      <span className="text-xs text-zinc-400">{Math.round(item.quality_score)}%</span>
                    )}
                    <Link href={`/content-studio/${item.id}`} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-white">
                      <Eye className="h-4 w-4" />
                    </Link>
                    <button onClick={() => handleDelete(item.id)} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
