'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, FileText, Globe, Loader2, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { KnowledgeSource, ApiResponse } from '@/types';

interface SearchResult { id: string; title: string | null; content: string; url?: string | null; score?: number; match_type?: string; }
const types = ['website', 'api', 'rss', 'document', 'manual'];

export default function KnowledgePage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'website', url: '', content: '', headers: '', max_pages: '10' });
  const [queryText, setQueryText] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<ApiResponse<KnowledgeSource[]>>('/knowledge');
      setSources(response.data || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Failed to load knowledge sources.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) return;
    setBusyId('create');
    setError(null);
    try {
      let headers: Record<string, string> = {};
      if (form.headers.trim()) headers = JSON.parse(form.headers) as Record<string, string>;
      await api.post('/knowledge', {
        body: {
          name: form.name.trim(), type: form.type, url: form.url.trim() || undefined,
          content: form.content.trim() || undefined,
          config: { headers, max_pages: Number(form.max_pages || 10) },
          sync_now: true,
        },
      });
      setForm({ name: '', type: 'website', url: '', content: '', headers: '', max_pages: '10' });
      setShowCreate(false);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Source ingestion failed.'); }
    finally { setBusyId(null); }
  };

  const sync = async (id: string) => {
    setBusyId(id);
    try { await api.post(`/knowledge/${id}/sync`, { body: {} }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Sync failed.'); }
    finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this source and all indexed content?')) return;
    setBusyId(id);
    try { await api.delete(`/knowledge/${id}`); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Delete failed.'); }
    finally { setBusyId(null); }
  };

  const search = async () => {
    if (!queryText.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const response = await api.get<ApiResponse<SearchResult[]>>('/knowledge/search', { params: { q: queryText.trim(), limit: '20' } });
      setResults(response.data || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Search failed.'); }
    finally { setSearching(false); }
  };

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-white">Knowledge Base</h1><p className="mt-1 text-sm text-zinc-400">Crawl, ingest, embed and search organization knowledge used by AI agents.</p></div><button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add source</button></header>
    {error && <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3"><AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p><button type="button" onClick={() => setError(null)} className="ml-auto text-red-400"><X className="h-4 w-4" /></button></div>}

    {showCreate && <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6"><h2 className="text-lg font-semibold text-white">Create and ingest source</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><label className="space-y-1.5 text-sm text-zinc-300"><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label><label className="space-y-1.5 text-sm text-zinc-300"><span>Type</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white">{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>{['website', 'api', 'rss'].includes(form.type) && <label className="space-y-1.5 text-sm text-zinc-300 md:col-span-2"><span>URL</span><input type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://example.com" className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>}{form.type === 'website' && <label className="space-y-1.5 text-sm text-zinc-300"><span>Maximum pages</span><input type="number" min="1" max="50" value={form.max_pages} onChange={(event) => setForm({ ...form, max_pages: event.target.value })} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>}{form.type === 'api' && <label className="space-y-1.5 text-sm text-zinc-300"><span>Request headers JSON</span><textarea rows={4} value={form.headers} onChange={(event) => setForm({ ...form, headers: event.target.value })} placeholder='{"Authorization":"Bearer ..."}' className="w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-white" /></label>}{['manual', 'document'].includes(form.type) && <label className="space-y-1.5 text-sm text-zinc-300 md:col-span-2"><span>Content</span><textarea rows={10} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="Paste the complete document or knowledge text." className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-white" /></label>}</div><div className="mt-4 flex gap-2"><button type="button" disabled={busyId === 'create' || !form.name.trim()} onClick={() => void create()} className="inline-flex items-center gap-2 rounded bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busyId === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create and ingest</button><button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-zinc-400">Cancel</button></div></section>}

    <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input value={queryText} onChange={(event) => setQueryText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} placeholder="Search indexed knowledge semantically and by keyword" className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-10 pr-3 text-sm text-white" /></div><button type="button" onClick={() => void search()} disabled={searching || !queryText.trim()} className="rounded bg-brand-500 px-4 text-sm text-white disabled:opacity-50">{searching ? 'Searching…' : 'Search'}</button></div>{results.length > 0 && <div className="mt-4 divide-y divide-white/[0.06]">{results.map((result) => <article key={result.id} className="py-4"><div className="flex justify-between gap-3"><h3 className="text-sm font-medium text-white">{result.title || 'Untitled knowledge chunk'}</h3><span className="text-xs text-zinc-500">{result.match_type || 'match'}{result.score !== undefined ? ` · ${Number(result.score).toFixed(3)}` : ''}</span></div><p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs text-zinc-400">{result.content}</p>{result.url && <a href={result.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brand-400">Open source</a>}</article>)}</div>}</section>

    {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div> : sources.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 py-16 text-center"><BookOpen className="mx-auto h-8 w-8 text-zinc-600" /><p className="mt-3 text-sm text-zinc-500">No knowledge sources yet.</p></div> : <div className="space-y-3">{sources.map((source) => <article key={source.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><div className="flex items-start justify-between gap-4"><div className="flex gap-3">{source.type === 'website' || source.type === 'api' || source.type === 'rss' ? <Globe className="h-5 w-5 text-brand-400" /> : <FileText className="h-5 w-5 text-purple-400" />}<div><h3 className="text-sm font-semibold text-white">{source.name}</h3><p className="text-xs text-zinc-500">{source.type}{source.url ? ` · ${source.url}` : ''}</p><p className="mt-2 text-xs text-zinc-400">{source.item_count} chunks · {source.total_tokens.toLocaleString()} estimated tokens</p>{source.error_message && <p className="mt-2 text-xs text-red-400">{source.error_message}</p>}</div></div><div className="flex items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${source.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : source.status === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>{source.status === 'active' && <CheckCircle2 className="h-3 w-3" />}{source.status}</span><button type="button" onClick={() => void sync(source.id)} className="rounded p-1.5 text-zinc-400 hover:bg-white/5">{busyId === source.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button><button type="button" onClick={() => void remove(source.id)} className="rounded p-1.5 text-zinc-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></div></article>)}</div>}
  </div>;
}
