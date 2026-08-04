'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  AlertCircle,
  Bell,
  X,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Eye,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { TrendMonitor, TrendItem, ApiResponse } from '@/types';

export default function TrendsPage() {
  const [monitors, setMonitors] = useState<TrendMonitor[]>([]);
  const [items, setItems] = useState<TrendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'monitors' | 'alerts' | 'items'>('monitors');
  const [unreadCount, setUnreadCount] = useState(0);
  const [newMonitor, setNewMonitor] = useState({
    topic: '',
    description: '',
    keywords: '',
    sources: '',
  });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchMonitors = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<TrendMonitor[]>>('/trends', {
        params: { organization_id: orgId },
      });
      setMonitors(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load monitors');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const fetchItems = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await api.get<ApiResponse<TrendItem[]>>('/trends/alerts', {
        params: { organization_id: orgId },
      });
      setItems(res.data);
    } catch {
      // silently fail
    }
  }, [orgId]);

  const fetchUnreadCount = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await api.get<ApiResponse<{ count: number }>>('/trends/unread-count', {
        params: { organization_id: orgId },
      });
      setUnreadCount(res.data.count);
    } catch {
      // silently fail
    }
  }, [orgId]);

  useEffect(() => {
    fetchMonitors();
    fetchItems();
    fetchUnreadCount();
  }, [fetchMonitors, fetchItems, fetchUnreadCount]);

  const handleCreate = async () => {
    if (!newMonitor.topic || !orgId) return;
    try {
      setCreating(true);
      const keywords = newMonitor.keywords.split(',').map((k) => k.trim()).filter(Boolean);
      const sources = newMonitor.sources.split(',').map((s) => s.trim()).filter(Boolean);
      await api.post('/trends', {
        body: {
          topic: newMonitor.topic,
          description: newMonitor.description || undefined,
          keywords,
          sources,
          organization_id: orgId,
        },
      });
      setShowCreate(false);
      setNewMonitor({ topic: '', description: '', keywords: '', sources: '' });
      fetchMonitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create monitor');
    } finally {
      setCreating(false);
    }
  };

  const handleCheck = async (id: string) => {
    try {
      setChecking(id);
      await api.post(`/trends/${id}/check`, {
        body: { organization_id: orgId },
      });
      fetchMonitors();
      fetchItems();
      fetchUnreadCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check trends');
    } finally {
      setChecking(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this monitor and all its items?')) return;
    try {
      await api.delete(`/trends/${id}`, {
        params: { organization_id: orgId },
      });
      fetchMonitors();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete monitor');
    }
  };

  const handleMarkRead = async (itemId: string) => {
    try {
      await api.patch(`/trends/items/${itemId}/read`, {
        body: { organization_id: orgId },
      });
      fetchItems();
      fetchUnreadCount();
    } catch {
      // silently fail
    }
  };

  const handleToggleSave = async (itemId: string) => {
    try {
      await api.patch(`/trends/items/${itemId}/save`, {
        body: { organization_id: orgId },
      });
      fetchItems();
    } catch {
      // silently fail
    }
  };

  const sentimentColor = (sentiment: string | null) => {
    switch (sentiment) {
      case 'positive': return 'text-emerald-400 bg-emerald-500/10';
      case 'negative': return 'text-red-400 bg-red-500/10';
      case 'mixed': return 'text-amber-400 bg-amber-500/10';
      default: return 'text-zinc-400 bg-zinc-500/10';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trend Monitoring</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Track industry trends and get alerts on relevant topics.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Add Monitor
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

      <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-1">
        {(['monitors', 'alerts', 'items'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-brand-500/10 text-brand-400'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'alerts' && unreadCount > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {showCreate && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">Add Trend Monitor</h2>
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Topic *</label>
                <input
                  type="text"
                  value={newMonitor.topic}
                  onChange={(e) => setNewMonitor({ ...newMonitor, topic: e.target.value })}
                  placeholder="AI Marketing"
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
                <input
                  type="text"
                  value={newMonitor.description}
                  onChange={(e) => setNewMonitor({ ...newMonitor, description: e.target.value })}
                  placeholder="Track AI trends in marketing..."
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Keywords (comma-separated)</label>
              <input
                type="text"
                value={newMonitor.keywords}
                onChange={(e) => setNewMonitor({ ...newMonitor, keywords: e.target.value })}
                placeholder="AI, marketing automation, LLM"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Sources (comma-separated URLs)</label>
              <input
                type="text"
                value={newMonitor.sources}
                onChange={(e) => setNewMonitor({ ...newMonitor, sources: e.target.value })}
                placeholder="https://techcrunch.com/feed, https://news.ycombinator.com"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCreate}
                disabled={creating || !newMonitor.topic}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 disabled:opacity-50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Monitor
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

      {activeTab === 'monitors' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
            </div>
          ) : monitors.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-surface-100">
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
                  <TrendingUp className="h-8 w-8 text-zinc-500" />
                </div>
                <h3 className="mt-6 text-lg font-semibold text-white">No trend monitors</h3>
                <p className="mt-2 max-w-sm text-sm text-zinc-500">
                  Create monitors to track industry trends and get alerts on relevant topics.
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
                >
                  <Plus className="h-4 w-4" />
                  Create your first monitor
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {monitors.map((monitor) => (
                <div
                  key={monitor.id}
                  className="group rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                        <TrendingUp className="h-5 w-5 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">{monitor.topic}</h3>
                        {monitor.description && (
                          <p className="mt-0.5 text-xs text-zinc-500">{monitor.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {monitor.keywords.map((kw, i) => (
                            <span key={i} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-400">
                              {kw}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                          <span className={`inline-flex items-center gap-1 ${monitor.is_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {monitor.is_active ? 'Active' : 'Paused'}
                          </span>
                          {monitor.last_checked_at && (
                            <span>Last checked {new Date(monitor.last_checked_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCheck(monitor.id)}
                        disabled={checking === monitor.id}
                        title="Run check"
                        className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
                      >
                        {checking === monitor.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(monitor.id)}
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
        </>
      )}

      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
              <Bell className="mx-auto h-8 w-8 text-zinc-500" />
              <p className="mt-4 text-sm text-zinc-400">No unread alerts</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-5 transition-all ${
                  item.is_read
                    ? 'border-white/[0.06] bg-surface-100'
                    : 'border-amber-500/20 bg-amber-500/5'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                    {item.summary && <p className="mt-1 text-xs text-zinc-400">{item.summary}</p>}
                    <div className="mt-2 flex items-center gap-3">
                      {item.sentiment && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sentimentColor(item.sentiment)}`}>
                          {item.sentiment}
                        </span>
                      )}
                      <span className="text-[11px] text-zinc-500">
                        Score: {(item.relevance_score * 100).toFixed(0)}%
                      </span>
                      {item.source && <span className="text-[11px] text-zinc-500">{item.source}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-white"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      onClick={() => handleToggleSave(item.id)}
                      title={item.is_saved ? 'Unsave' : 'Save'}
                      className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-amber-400"
                    >
                      {item.is_saved ? <BookmarkCheck className="h-4 w-4 text-amber-400" /> : <Bookmark className="h-4 w-4" />}
                    </button>
                    {!item.is_read && (
                      <button
                        onClick={() => handleMarkRead(item.id)}
                        title="Mark as read"
                        className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-white"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'items' && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">
            Select a monitor to view its trend items, or check the Alerts tab for high-relevance items.
          </p>
        </div>
      )}
    </div>
  );
}
