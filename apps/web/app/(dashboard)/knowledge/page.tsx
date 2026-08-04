'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Globe,
  FileText,
  FileUp,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { KnowledgeSource, ApiResponse } from '@/types';

const sourceTypeOptions = [
  { value: 'website', label: 'Website', icon: Globe, description: 'Crawl and index website pages' },
  { value: 'document', label: 'Document', icon: FileText, description: 'Upload text documents' },
  { value: 'api', label: 'API Feed', icon: Globe, description: 'Connect to an API endpoint' },
  { value: 'manual', label: 'Manual', icon: FileUp, description: 'Add content manually' },
];

const statusConfig: Record<string, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
  active: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  completed: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  pending: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Clock },
  crawling: { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: RefreshCw },
  syncing: { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: RefreshCw },
  error: { color: 'text-red-400', bg: 'bg-red-500/10', icon: AlertCircle },
  failed: { color: 'text-red-400', bg: 'bg-red-500/10', icon: AlertCircle },
};

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const [newSource, setNewSource] = useState({ name: '', type: 'website', url: '' });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchSources = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const params: Record<string, string> = { organization_id: orgId };
      if (typeFilter !== 'all') params.type = typeFilter;
      const res = await api.get<ApiResponse<KnowledgeSource[]>>('/knowledge', { params });
      setSources(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }, [orgId, typeFilter]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleCreate = async () => {
    if (!newSource.name || !orgId) return;
    try {
      setCreating(true);
      await api.post('/knowledge', {
        body: { ...newSource, organization_id: orgId },
      });
      setShowCreate(false);
      setNewSource({ name: '', type: 'website', url: '' });
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source');
    } finally {
      setCreating(false);
    }
  };

  const handleSync = async (id: string) => {
    try {
      await api.post(`/knowledge/${id}/sync`, {
        body: { organization_id: orgId },
      });
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync source');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this source and all its items?')) return;
    try {
      await api.delete(`/knowledge/${id}`, {
        params: { organization_id: orgId },
      });
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete source');
    }
  };

  const filteredSources = sources.filter((s) =>
    search ? s.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Import and manage content for your AI agents to reference.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Add Source
        </button>
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

      {showCreate && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">Add Knowledge Source</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Name</label>
              <input
                type="text"
                value={newSource.name}
                onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                placeholder="My Website"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Type</label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {sourceTypeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewSource({ ...newSource, type: opt.value })}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                      newSource.type === opt.value
                        ? 'border-brand-500/50 bg-brand-500/10'
                        : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    <opt.icon className={`h-5 w-5 ${newSource.type === opt.value ? 'text-brand-400' : 'text-zinc-400'}`} />
                    <div>
                      <p className={`text-sm font-medium ${newSource.type === opt.value ? 'text-white' : 'text-zinc-300'}`}>{opt.label}</p>
                      <p className="text-[11px] text-zinc-500">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {(newSource.type === 'website' || newSource.type === 'api') && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">URL</label>
                <input
                  type="url"
                  value={newSource.url}
                  onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                  placeholder="https://example.com"
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreate}
                disabled={creating || !newSource.name}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Source
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search sources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          {['all', 'website', 'document', 'api', 'manual'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-brand-500/10 text-brand-400'
                  : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : filteredSources.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
              <BookOpen className="h-8 w-8 text-zinc-500" />
            </div>
            <h3 className="mt-6 text-lg font-semibold text-white">No knowledge sources</h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
              Add a website, document, or API feed to build your knowledge base.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
            >
              <Plus className="h-4 w-4" />
              Add your first source
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSources.map((source) => {
            const status = statusConfig[source.status] || statusConfig.pending;
            const StatusIcon = status.icon;
            return (
              <div
                key={source.id}
                className="group rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                      {source.type === 'website' ? (
                        <Globe className="h-5 w-5 text-brand-400" />
                      ) : source.type === 'document' ? (
                        <FileText className="h-5 w-5 text-purple-400" />
                      ) : (
                        <FileUp className="h-5 w-5 text-blue-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{source.name}</h3>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {source.type}
                        {source.url ? ` — ${source.url}` : ''}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                        <span>{source.item_count} items</span>
                        <span>{source.total_tokens.toLocaleString()} tokens</span>
                        {source.last_synced_at && (
                          <span>Last synced {new Date(source.last_synced_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.bg} ${status.color}`}>
                      <StatusIcon className={`h-3 w-3 ${source.status === 'crawling' || source.status === 'syncing' ? 'animate-spin' : ''}`} />
                      {source.status}
                    </span>
                    <button
                      onClick={() => handleSync(source.id)}
                      title="Sync"
                      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(source.id)}
                      title="Delete"
                      className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {source.error_message && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/5 px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                    <p className="text-xs text-red-300">{source.error_message}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
