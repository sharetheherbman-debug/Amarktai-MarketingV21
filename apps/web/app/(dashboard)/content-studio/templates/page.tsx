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
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');

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
          <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
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
                  <button className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-white"><Copy className="h-3.5 w-3.5" /></button>
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
