'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Play,
  Sparkles,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Workflow { id: string; name: string; description: string | null; trigger_type: string; status: string; run_count: number; last_run_at: string | null; is_template: boolean; steps: Array<{ type: string; name: string }>; }

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchWorkflows = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<Workflow[]>>('/amai/workflows', { params: { organization_id: orgId } });
      setWorkflows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchWorkflows(); }, [fetchWorkflows]);

  const handleSeedTemplates = async () => {
    try {
      setSeeding(true);
      await api.post('/amai/workflows/seed-templates', { body: { organization_id: orgId } });
      fetchWorkflows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed templates');
    } finally {
      setSeeding(false);
    }
  };

  const handleExecute = async (id: string) => {
    try {
      await api.post(`/amai/workflows/${id}/execute`, { body: { organization_id: orgId, input: {} } });
      fetchWorkflows();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Workflows</h1>
          <p className="mt-1 text-sm text-zinc-400">Build and execute marketing automation workflows.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSeedTemplates} disabled={seeding}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06] disabled:opacity-50">
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Seed Templates
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
            <Plus className="h-4 w-4" />New Workflow
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : workflows.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
          <GitBranch className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No workflows yet. Seed default templates to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map(wf => (
            <div key={wf.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">{wf.name}</h3>
                    {wf.is_template && <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-400">Template</span>}
                  </div>
                  {wf.description && <p className="mt-0.5 text-xs text-zinc-500">{wf.description}</p>}
                  <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                    <span className="flex items-center gap-1"><GitBranch className="h-3 w-3" />{wf.steps.length} steps</span>
                    <span className="flex items-center gap-1"><Play className="h-3 w-3" />{wf.run_count} runs</span>
                    {wf.last_run_at && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Last: {new Date(wf.last_run_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${wf.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                    {wf.status}
                  </span>
                  <button onClick={() => handleExecute(wf.id)} title="Execute"
                    className="rounded-md p-1.5 text-zinc-500 hover:bg-brand-500/10 hover:text-brand-400">
                    <Play className="h-4 w-4" />
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
