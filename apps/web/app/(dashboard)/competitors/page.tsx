'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  Globe,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  X,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Competitor, CompetitorSnapshot, ApiResponse } from '@/types';

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [newCompetitor, setNewCompetitor] = useState({ name: '', url: '', description: '', industry: '' });
  const [recentChanges, setRecentChanges] = useState<{ competitor: Competitor; snapshot: CompetitorSnapshot }[]>([]);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchCompetitors = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<Competitor[]>>('/competitors', {
        params: { organization_id: orgId },
      });
      setCompetitors(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load competitors');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const fetchRecentChanges = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await api.get<ApiResponse<{ competitor: Competitor; snapshot: CompetitorSnapshot }[]>>('/competitors/recent-changes', {
        params: { organization_id: orgId, days: '7' },
      });
      setRecentChanges(res.data);
    } catch {
      // silently fail
    }
  }, [orgId]);

  useEffect(() => {
    fetchCompetitors();
    fetchRecentChanges();
  }, [fetchCompetitors, fetchRecentChanges]);

  const handleCreate = async () => {
    if (!newCompetitor.name || !orgId) return;
    try {
      setCreating(true);
      await api.post('/competitors', {
        body: { ...newCompetitor, organization_id: orgId },
      });
      setShowCreate(false);
      setNewCompetitor({ name: '', url: '', description: '', industry: '' });
      fetchCompetitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create competitor');
    } finally {
      setCreating(false);
    }
  };

  const handleCheck = async (id: string) => {
    try {
      setChecking(id);
      await api.post(`/competitors/${id}/check`, {
        body: { organization_id: orgId },
      });
      fetchCompetitors();
      fetchRecentChanges();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check competitor');
    } finally {
      setChecking(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this competitor and all snapshots?')) return;
    try {
      await api.delete(`/competitors/${id}`, {
        params: { organization_id: orgId },
      });
      fetchCompetitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete competitor');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Competitor Monitoring</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Track competitor websites and detect changes automatically.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Add Competitor
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
          <h2 className="text-lg font-semibold text-white">Add Competitor</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Name *</label>
              <input
                type="text"
                value={newCompetitor.name}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, name: e.target.value })}
                placeholder="Acme Corp"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Website URL</label>
              <input
                type="url"
                value={newCompetitor.url}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, url: e.target.value })}
                placeholder="https://acme.com"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Industry</label>
              <input
                type="text"
                value={newCompetitor.industry}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, industry: e.target.value })}
                placeholder="SaaS, E-commerce..."
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
              <input
                type="text"
                value={newCompetitor.description}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, description: e.target.value })}
                placeholder="Brief description..."
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={creating || !newCompetitor.name}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Competitor
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.04] hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {recentChanges.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-400">
            <TrendingUp className="h-4 w-4" />
            Recent Changes (Last 7 Days)
          </h2>
          <div className="mt-3 space-y-2">
            {recentChanges.map((change, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium text-white">{change.competitor.name}</p>
                  <p className="text-xs text-zinc-400">{change.snapshot.summary}</p>
                </div>
                <span className="text-[11px] text-zinc-500">
                  {new Date(change.snapshot.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : competitors.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
              <Eye className="h-8 w-8 text-zinc-500" />
            </div>
            <h3 className="mt-6 text-lg font-semibold text-white">No competitors tracked</h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
              Add competitors to monitor their websites for changes in pricing, content, and SEO.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
            >
              <Plus className="h-4 w-4" />
              Add your first competitor
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {competitors.map((comp) => (
            <div
              key={comp.id}
              className="group rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                    <Globe className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{comp.name}</h3>
                    {comp.url && (
                      <a
                        href={comp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
                      >
                        {comp.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                      {comp.industry && <span>{comp.industry}</span>}
                      {comp.last_checked_at && (
                        <span>Last checked {new Date(comp.last_checked_at).toLocaleDateString()}</span>
                      )}
                    </div>
                    {comp.description && (
                      <p className="mt-1.5 text-xs text-zinc-500">{comp.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    comp.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'
                  }`}>
                    {comp.status === 'active' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {comp.status}
                  </span>
                  <button
                    onClick={() => handleCheck(comp.id)}
                    disabled={checking === comp.id}
                    title="Run check"
                    className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
                  >
                    {checking === comp.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(comp.id)}
                    title="Delete"
                    className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
