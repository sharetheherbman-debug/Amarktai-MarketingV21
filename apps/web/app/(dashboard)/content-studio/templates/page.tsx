'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Copy,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  type: string;
  platform: string | null;
  usage_count: number;
  is_system: boolean;
  created_at: string;
  template_body?: string;
  prompt_template?: string | null;
  system_prompt?: string | null;
  variables?: Array<Record<string, unknown>>;
}

const emptyTemplate = {
  name: '', description: '', category: 'social', type: 'social', platform: '',
  template_body: '{{content}}', prompt_template: '', system_prompt: '',
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyTemplate);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchTemplates = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const params: Record<string, string> = { organization_id: orgId };
      if (categoryFilter !== 'all') params.category = categoryFilter;
      const res = await api.get<ApiResponse<Template[]>>('/templates', { params });
      setTemplates(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [orgId, categoryFilter]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleSeedDefaults = async () => {
    try {
      await api.post('/templates/seed', { body: { organization_id: orgId } });
      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed templates');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      await api.delete(`/templates/${id}`, { params: { organization_id: orgId } });
      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.template_body.trim()) return;
    try {
      setSaving(true); setError(null);
      await api.post('/templates', { body: {
        ...form,
        platform: form.platform || undefined,
        prompt_template: form.prompt_template || undefined,
        system_prompt: form.system_prompt || undefined,
        variables: [],
        organization_id: orgId,
      } });
      setForm(emptyTemplate); setShowCreate(false); await fetchTemplates();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create template'); }
    finally { setSaving(false); }
  };

  const handleCopy = async (id: string) => {
    try {
      setSaving(true); setError(null);
      const response = await api.get<ApiResponse<Template>>(`/templates/${id}`, { params: { organization_id: orgId } });
      const source = response.data;
      await api.post('/templates', { body: {
        organization_id: orgId,
        name: `${source.name} copy`, description: source.description,
        category: source.category, type: source.type, platform: source.platform,
        template_body: source.template_body || '{{content}}', variables: source.variables || [],
        prompt_template: source.prompt_template, system_prompt: source.system_prompt,
      } });
      await fetchTemplates();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to duplicate template'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates</h1>
          <p className="mt-1 text-sm text-zinc-400">Reusable content templates for consistent generation.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSeedDefaults}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06]">
            <Sparkles className="h-4 w-4" /> Seed Defaults
          </button>
          <button onClick={() => setShowCreate(value => !value)} aria-expanded={showCreate} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
            <Plus className="h-4 w-4" /> New Template
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {showCreate && <section aria-label="Create reusable template" className="rounded-xl border border-brand-500/20 bg-surface-100 p-5">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">Create reusable template</h2><p className="mt-1 text-xs text-zinc-400">Use placeholders such as {'{{topic}}'} and keep every factual claim owner-supplied.</p></div><button aria-label="Close template form" onClick={()=>setShowCreate(false)} className="rounded p-1 text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-zinc-300">Name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-white outline-none focus:border-brand-500/50" /></label>
          <label className="text-sm text-zinc-300">Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value,type:e.target.value})} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-surface-200 px-3 text-white">{['blog','social','email','landing_page','asset'].map(value=><option key={value} value={value}>{value.replace('_',' ')}</option>)}</select></label>
          <label className="text-sm text-zinc-300 sm:col-span-2">Description<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-white outline-none focus:border-brand-500/50" /></label>
          <label className="text-sm text-zinc-300 sm:col-span-2">Reusable structure<textarea rows={5} value={form.template_body} onChange={e=>setForm({...form,template_body:e.target.value})} className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-sm text-white outline-none focus:border-brand-500/50" /></label>
          <label className="text-sm text-zinc-300 sm:col-span-2">Generation instruction<textarea rows={3} value={form.prompt_template} onChange={e=>setForm({...form,prompt_template:e.target.value})} placeholder="Describe the desired output without adding unsupported facts." className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white outline-none focus:border-brand-500/50" /></label>
        </div>
        <button disabled={saving || !form.name.trim() || !form.template_body.trim()} onClick={handleCreate} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving&&<Loader2 className="h-4 w-4 animate-spin"/>}Save template</button>
      </section>}

      <div className="flex items-center gap-2">
        {['all', 'blog', 'social', 'email', 'landing_page', 'asset'].map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${categoryFilter === c ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>
            {c === 'all' ? 'All' : c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No templates yet. Seed defaults to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(template => (
            <div key={template.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{template.name}</h3>
                  <p className="mt-0.5 text-xs text-zinc-500">{template.category} — {template.type}</p>
                </div>
                {template.is_system && (
                  <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">System</span>
                )}
              </div>
              {template.description && <p className="mt-2 text-xs text-zinc-400">{template.description}</p>}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Used {template.usage_count} times</span>
                <div className="flex items-center gap-1">
                  <button aria-label={`Duplicate ${template.name}`} disabled={saving} onClick={() => handleCopy(template.id)} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-white disabled:opacity-40"><Copy className="h-3.5 w-3.5" /></button>
                  {!template.is_system && (
                    <button onClick={() => handleDelete(template.id)} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
