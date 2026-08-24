'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Eye, Globe2, Loader2, Plus, RefreshCw, Trash2, TrendingUp, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse, Competitor, CompetitorSnapshot } from '@/types';

const inputClass = 'ep-input min-h-11 px-3 py-2.5 text-sm';

export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [recentChanges, setRecentChanges] = useState<Array<{ competitor: Competitor; snapshot: CompetitorSnapshot }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', url: '', description: '', industry: '' });
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true); setError(null);
    const [competitorResult, changeResult] = await Promise.allSettled([
      api.get<ApiResponse<Competitor[]>>('/competitors', { params: { organization_id: orgId } }),
      api.get<ApiResponse<Array<{ competitor: Competitor; snapshot: CompetitorSnapshot }>>>('/competitors/recent-changes', { params: { organization_id: orgId, days: '7' } }),
    ]);
    if (competitorResult.status === 'fulfilled') setCompetitors(competitorResult.value.data || []);
    else setError(competitorResult.reason instanceof Error ? competitorResult.reason.message : 'Competitors could not be loaded.');
    if (changeResult.status === 'fulfilled') setRecentChanges(changeResult.value.data || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!orgId || !form.name.trim()) return;
    setCreating(true); setError(null);
    try {
      await api.post('/competitors', { body: { ...form, name: form.name.trim(), organization_id: orgId } });
      setForm({ name: '', url: '', description: '', industry: '' }); setShowCreate(false); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Competitor could not be added.'); }
    finally { setCreating(false); }
  };

  const runCheck = async (id: string) => {
    setChecking(id); setError(null);
    try { await api.post(`/competitors/${id}/check`, { body: { organization_id: orgId } }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Competitor check failed.'); }
    finally { setChecking(null); }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this competitor and its monitoring snapshots?')) return;
    try { await api.delete(`/competitors/${id}`, { params: { organization_id: orgId } }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Competitor could not be removed.'); }
  };

  return <div className="space-y-6">
    <header className="ep-panel p-6 sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-3xl"><p className="ep-section-label">Research & Intelligence · Competitors</p><h1 className="ep-page-title mt-2">Track the competitors that matter to your strategy.</h1><p className="ep-page-copy mt-3 text-sm leading-6 sm:text-base">Monitor public competitor websites, keep detected changes visible and use verified observations as input to planning rather than inventing market claims.</p></div><button type="button" onClick={() => setShowCreate(true)} className="ep-button-primary shrink-0 px-4 py-2.5 text-sm"><Plus className="h-4 w-4" /> Add competitor</button></div></header>

    {error && <div className="ep-status-danger flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss"><X className="h-4 w-4" /></button></div>}

    {showCreate && <section className="ep-card p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><p className="ep-section-label">New competitor</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Add a public business to monitor</h2></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-[var(--ep-text-soft)] hover:bg-[var(--ep-surface-subtle)]"><X className="h-4 w-4" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Competitor name" className={inputClass} /></Field><Field label="Website"><input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" className={inputClass} /></Field><Field label="Industry"><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Industry or category" className={inputClass} /></Field><Field label="Notes"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Why this competitor matters" className={inputClass} /></Field></div><div className="mt-5 flex gap-2"><button type="button" onClick={() => void create()} disabled={creating || !form.name.trim()} className="ep-button-primary px-4 py-2.5 text-sm">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Save competitor</button><button type="button" onClick={() => setShowCreate(false)} className="ep-button-secondary px-4 py-2.5 text-sm">Cancel</button></div></section>}

    {recentChanges.length > 0 && <section className="ep-card p-5 sm:p-6"><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-[var(--ep-blue)]" /><div><p className="ep-section-label">Last 7 days</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Recent detected changes</h2></div></div><div className="mt-4 divide-y divide-[var(--ep-border)]">{recentChanges.map((change, index) => <article key={`${change.competitor.id}-${index}`} className="py-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-extrabold text-[var(--ep-navy)]">{change.competitor.name}</h3><span className="text-xs text-[var(--ep-text-soft)]">{new Date(change.snapshot.created_at).toLocaleDateString('en-ZA')}</span></div><p className="mt-1 text-sm leading-6 text-[var(--ep-text-muted)]">{change.snapshot.summary || 'A monitored change was detected.'}</p></article>)}</div></section>}

    <section><div className="mb-3 flex items-center justify-between"><div><p className="ep-section-label">Monitoring</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Tracked competitors</h2></div><button type="button" onClick={() => void load()} className="ep-button-secondary px-3 py-2 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button></div>{loading ? <div className="ep-card flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[var(--ep-blue)]" /></div> : competitors.length === 0 ? <div className="ep-card py-14 text-center"><Eye className="mx-auto h-8 w-8 text-[var(--ep-text-soft)]" /><h3 className="mt-4 font-extrabold text-[var(--ep-navy)]">No competitors tracked yet.</h3><p className="mx-auto mt-2 max-w-md text-sm text-[var(--ep-text-muted)]">Add only businesses relevant to the market you want this workspace to understand.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{competitors.map((competitor) => { const active = competitor.status === 'active'; return <article key={competitor.id} className="ep-card p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><Globe2 className="h-5 w-5" /></span><div className="min-w-0"><h3 className="truncate font-extrabold text-[var(--ep-navy)]">{competitor.name}</h3>{competitor.industry && <p className="mt-1 text-xs text-[var(--ep-text-muted)]">{competitor.industry}</p>}</div></div><span className={`${active ? 'ep-status-success' : 'ep-status-warning'} inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-extrabold uppercase`}>{active && <CheckCircle2 className="h-3 w-3" />}{competitor.status}</span></div>{competitor.description && <p className="mt-4 text-sm leading-5 text-[var(--ep-text-muted)]">{competitor.description}</p>}{competitor.url && <a href={competitor.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--ep-blue)]">Open website <ExternalLink className="h-3.5 w-3.5" /></a>}<p className="mt-4 text-xs text-[var(--ep-text-soft)]">{competitor.last_checked_at ? `Last checked ${new Date(competitor.last_checked_at).toLocaleString()}` : 'Not checked yet'}</p><div className="mt-4 flex gap-2 border-t border-[var(--ep-border)] pt-3"><button type="button" disabled={checking === competitor.id} onClick={() => void runCheck(competitor.id)} className="ep-button-secondary px-3 py-2 text-xs">{checking === competitor.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check now</button><button type="button" onClick={() => void remove(competitor.id)} className="ml-auto rounded-lg p-2 text-[var(--ep-text-soft)] hover:bg-[var(--ep-danger-soft)] hover:text-[var(--ep-danger)]" aria-label={`Remove ${competitor.name}`}><Trash2 className="h-4 w-4" /></button></div></article>; })}</div>}</section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-[var(--ep-text-muted)]">{label}</span>{children}</label>; }
