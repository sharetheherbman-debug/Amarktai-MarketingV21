'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Loader2,
  AlertCircle,
  X,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface ImportExportJob { id: string; type: string; entity_type: string; format: string; file_name: string | null; status: string; total_rows: number; processed_rows: number; success_rows: number; error_rows: number; created_at: string; completed_at: string | null; }

const entityTypes = ['contacts', 'companies', 'deals', 'content', 'campaigns', 'knowledge'];
const formats = ['csv', 'excel', 'json'];

export default function ImportExportPage() {
  const [jobs, setJobs] = useState<ImportExportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ type: 'import', entity_type: 'contacts', format: 'csv', file_name: '' });
  const [creating, setCreating] = useState(false);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchJobs = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<ImportExportJob[]>>('/integrations/import-export', { params: { organization_id: orgId } });
      setJobs(res.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleCreate = async () => {
    if (!orgId) return;
    try {
      setCreating(true);
      await api.post('/integrations/import-export', { body: { ...form, organization_id: orgId } });
      setShowCreate(false);
      fetchJobs();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setCreating(false); }
  };

  const statusConfig: Record<string, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
    completed: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
    processing: { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Loader2 },
    pending: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Clock },
    failed: { color: 'text-red-400', bg: 'bg-red-500/10', icon: AlertTriangle },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Import / Export</h1>
          <p className="mt-1 text-sm text-zinc-400">Import and export data across your CRM and content.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
          <Upload className="h-4 w-4" />New Job
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {showCreate && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">New Import/Export Job</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50">
                <option value="import">Import</option>
                <option value="export">Export</option>
              </select></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Entity</label>
              <select value={form.entity_type} onChange={e => setForm({ ...form, entity_type: e.target.value })}
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50">
                {entityTypes.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Format</label>
              <select value={form.format} onChange={e => setForm({ ...form, format: e.target.value })}
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50">
                {formats.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">File Name</label>
              <input type="text" value={form.file_name} onChange={e => setForm({ ...form, file_name: e.target.value })} placeholder="data.csv"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleCreate} disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Create Job
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.04]">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-500" /><p className="mt-4 text-sm text-zinc-400">No import/export jobs yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const status = statusConfig[job.status] || statusConfig.pending;
            const StatusIcon = status.icon;
            return (
              <div key={job.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {job.type === 'import' ? <Upload className="h-4 w-4 text-blue-400" /> : <Download className="h-4 w-4 text-emerald-400" />}
                      <h3 className="text-sm font-semibold text-white capitalize">{job.type} — {job.entity_type}</h3>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                      <span className="uppercase">{job.format}</span>
                      {job.file_name && <span>{job.file_name}</span>}
                      <span>{new Date(job.created_at).toLocaleDateString()}</span>
                    </div>
                    {job.status === 'processing' && job.total_rows > 0 && (
                      <div className="mt-2">
                        <div className="h-1.5 w-48 rounded-full bg-white/[0.06]">
                          <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(job.processed_rows / job.total_rows) * 100}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-500">{job.processed_rows}/{job.total_rows} rows</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.bg} ${status.color}`}>
                      <StatusIcon className={`h-3 w-3 ${job.status === 'processing' ? 'animate-spin' : ''}`} />{job.status}
                    </span>
                    {job.success_rows > 0 && <span className="text-xs text-emerald-400">{job.success_rows} ok</span>}
                    {job.error_rows > 0 && <span className="text-xs text-red-400">{job.error_rows} err</span>}
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
