'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, Bookmark, BookmarkCheck, ExternalLink, Loader2, Plus, RefreshCw, Trash2, TrendingUp, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse, TrendItem, TrendMonitor } from '@/types';

const inputClass = 'ep-input min-h-11 px-3 py-2.5 text-sm';
type Tab = 'monitors' | 'alerts' | 'items';

export default function TrendsPage() {
  const [monitors, setMonitors] = useState<TrendMonitor[]>([]);
  const [items, setItems] = useState<TrendItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [tab, setTab] = useState<Tab>('monitors');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [form, setForm] = useState({ topic: '', description: '', keywords: '', sources: '' });
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true); setError(null);
    const [monitorResult, itemResult, unreadResult] = await Promise.allSettled([
      api.get<ApiResponse<TrendMonitor[]>>('/trends', { params: { organization_id: orgId } }),
      api.get<ApiResponse<TrendItem[]>>('/trends/alerts', { params: { organization_id: orgId } }),
      api.get<ApiResponse<{ count: number }>>('/trends/unread-count', { params: { organization_id: orgId } }),
    ]);
    if (monitorResult.status === 'fulfilled') setMonitors(monitorResult.value.data || []);
    else setError(monitorResult.reason instanceof Error ? monitorResult.reason.message : 'Trend monitors could not be loaded.');
    if (itemResult.status === 'fulfilled') setItems(itemResult.value.data || []);
    if (unreadResult.status === 'fulfilled') setUnreadCount(Number(unreadResult.value.data?.count || 0));
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!orgId || !form.topic.trim()) return;
    setCreating(true); setError(null);
    try {
      await api.post('/trends', { body: { organization_id: orgId, topic: form.topic.trim(), description: form.description.trim() || undefined, keywords: form.keywords.split(',').map((v) => v.trim()).filter(Boolean), sources: form.sources.split(',').map((v) => v.trim()).filter(Boolean) } });
      setForm({ topic: '', description: '', keywords: '', sources: '' }); setShowCreate(false); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Trend monitor could not be created.'); }
    finally { setCreating(false); }
  };

  const runCheck = async (id: string) => { setChecking(id); setError(null); try { await api.post(`/trends/${id}/check`, { body: { organization_id: orgId } }); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Trend check failed.'); } finally { setChecking(null); } };
  const remove = async (id: string) => { if (!confirm('Remove this monitor and its collected items?')) return; try { await api.delete(`/trends/${id}`, { params: { organization_id: orgId } }); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Trend monitor could not be removed.'); } };
  const markRead = async (id: string) => { try { await api.patch(`/trends/items/${id}/read`, { body: { organization_id: orgId } }); await load(); } catch { /* keep the current view truthful */ } };
  const toggleSave = async (id: string) => { try { await api.patch(`/trends/items/${id}/save`, { body: { organization_id: orgId } }); await load(); } catch { /* keep the current view truthful */ } };

  const shownItems = tab === 'alerts' ? items.filter((item) => !(item as any).is_read) : items;

  return <div className="space-y-6">
    <header className="ep-panel p-6 sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-3xl"><p className="ep-section-label">Research & Intelligence · Trends</p><h1 className="ep-page-title mt-2">Watch the topics and market signals that can change your plan.</h1><p className="ep-page-copy mt-3 text-sm leading-6 sm:text-base">Create focused monitors, review collected items and keep useful signals visible to the Marketing Director without pretending every mention is an opportunity.</p></div><button type="button" onClick={() => setShowCreate(true)} className="ep-button-primary shrink-0 px-4 py-2.5 text-sm"><Plus className="h-4 w-4" /> Add monitor</button></div></header>
    {error && <div className="ep-status-danger flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError(null)}><X className="h-4 w-4" /></button></div>}

    <div className="ep-card flex max-w-full gap-1 overflow-x-auto p-1.5">{(['monitors','alerts','items'] as Tab[]).map((value) => <button type="button" key={value} onClick={() => setTab(value)} className={tab === value ? 'shrink-0 rounded-lg bg-[var(--ep-navy)] px-4 py-2.5 text-sm font-extrabold capitalize text-white' : 'shrink-0 rounded-lg px-4 py-2.5 text-sm font-bold capitalize text-[var(--ep-text-muted)] hover:bg-[var(--ep-blue-soft)]'}>{value}{value === 'alerts' && unreadCount > 0 ? ` (${unreadCount})` : ''}</button>)}</div>

    {showCreate && <section className="ep-card p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="ep-section-label">New trend monitor</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Define what this workspace should watch</h2></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-[var(--ep-text-soft)] hover:bg-[var(--ep-surface-subtle)]"><X className="h-4 w-4" /></button></div><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Topic *"><input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Equestrian software, horse welfare…" className={inputClass} /></Field><Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Why this topic matters" className={inputClass} /></Field><Field label="Keywords"><input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="Comma-separated keywords" className={inputClass} /></Field><Field label="Sources"><input value={form.sources} onChange={(e) => setForm({ ...form, sources: e.target.value })} placeholder="Comma-separated public source URLs" className={inputClass} /></Field></div><div className="mt-5 flex gap-2"><button type="button" onClick={() => void create()} disabled={creating || !form.topic.trim()} className="ep-button-primary px-4 py-2.5 text-sm">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save monitor</button><button type="button" onClick={() => setShowCreate(false)} className="ep-button-secondary px-4 py-2.5 text-sm">Cancel</button></div></section>}

    {tab === 'monitors' ? <section><div className="mb-3 flex items-center justify-between"><div><p className="ep-section-label">Monitoring</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Active topics</h2></div><button type="button" onClick={() => void load()} className="ep-button-secondary px-3 py-2 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button></div>{loading ? <div className="ep-card flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[var(--ep-blue)]" /></div> : monitors.length === 0 ? <div className="ep-card py-14 text-center"><TrendingUp className="mx-auto h-8 w-8 text-[var(--ep-text-soft)]" /><p className="mt-3 text-sm font-semibold text-[var(--ep-text-muted)]">No trend monitors yet.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{monitors.map((monitor) => <article key={monitor.id} className="ep-card p-5"><div className="flex items-start gap-3"><span className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><TrendingUp className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h3 className="font-extrabold text-[var(--ep-navy)]">{monitor.topic}</h3>{monitor.description && <p className="mt-1 text-sm leading-5 text-[var(--ep-text-muted)]">{monitor.description}</p>}</div></div><div className="mt-4 flex flex-wrap gap-1.5">{(monitor.keywords || []).map((keyword) => <span key={keyword} className="rounded-full bg-[var(--ep-surface-subtle)] px-2.5 py-1 text-[10px] font-semibold text-[var(--ep-text-muted)]">{keyword}</span>)}</div><p className="mt-4 text-xs text-[var(--ep-text-soft)]">{monitor.last_checked_at ? `Last checked ${new Date(monitor.last_checked_at).toLocaleString()}` : 'Not checked yet'}</p><div className="mt-4 flex gap-2 border-t border-[var(--ep-border)] pt-3"><button type="button" onClick={() => void runCheck(monitor.id)} disabled={checking === monitor.id} className="ep-button-secondary px-3 py-2 text-xs">{checking === monitor.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check now</button><button type="button" onClick={() => void remove(monitor.id)} className="ml-auto rounded-lg p-2 text-[var(--ep-text-soft)] hover:bg-[var(--ep-danger-soft)] hover:text-[var(--ep-danger)]"><Trash2 className="h-4 w-4" /></button></div></article>)}</div>}</section> : <section><div className="mb-3"><p className="ep-section-label">{tab === 'alerts' ? 'Unread alerts' : 'Collected intelligence'}</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Trend items</h2></div>{shownItems.length === 0 ? <div className="ep-card py-14 text-center"><Bell className="mx-auto h-8 w-8 text-[var(--ep-text-soft)]" /><p className="mt-3 text-sm font-semibold text-[var(--ep-text-muted)]">Nothing in this view.</p></div> : <div className="space-y-3">{shownItems.map((item) => { const row = item as any; return <article key={item.id} className="ep-card p-5"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold text-[var(--ep-navy)]">{row.title || row.headline || row.topic || 'Trend item'}</h3>{row.sentiment && <span className="rounded-full bg-[var(--ep-surface-subtle)] px-2 py-0.5 text-[10px] font-bold capitalize text-[var(--ep-text-muted)]">{row.sentiment}</span>}</div><p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">{row.summary || row.description || row.content || 'A monitored signal was collected for review.'}</p>{row.source_url || row.url ? <a href={row.source_url || row.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--ep-blue)]">Open source <ExternalLink className="h-3.5 w-3.5" /></a> : null}</div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => void toggleSave(item.id)} className="rounded-lg p-2 text-[var(--ep-text-muted)] hover:bg-[var(--ep-blue-soft)] hover:text-[var(--ep-blue)]" aria-label="Save item">{row.is_saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}</button>{!row.is_read && <button type="button" onClick={() => void markRead(item.id)} className="ep-button-secondary px-2.5 py-1.5 text-xs">Mark read</button>}</div></div></article>; })}</div>}</section>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-[var(--ep-text-muted)]">{label}</span>{children}</label>; }
