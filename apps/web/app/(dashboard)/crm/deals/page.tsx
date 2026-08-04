'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Plus,
  Loader2,
  AlertCircle,
  X,
  DollarSign,
  Calendar,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Deal { id: string; name: string; stage: string; value_cents: number; probability: number; expected_close_date: string | null; status: string; ai_health_score: number; contact_id: string | null; created_at: string; }

const stages = ['qualification', 'discovery', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', value_cents: 0, stage: 'qualification', probability: 10, expected_close_date: '', contact_id: '' });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchDeals = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<Deal[]>>('/crm/deals', { params: { organization_id: orgId } });
      setDeals(res.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  const handleCreate = async () => {
    if (!form.name || !orgId) return;
    try {
      setCreating(true);
      await api.post('/crm/deals', { body: { ...form, organization_id: orgId } });
      setShowCreate(false);
      setForm({ name: '', value_cents: 0, stage: 'qualification', probability: 10, expected_close_date: '', contact_id: '' });
      fetchDeals();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create'); }
    finally { setCreating(false); }
  };

  const handleAnalyze = async (id: string) => {
    try {
      await api.post(`/crm/deals/${id}/analyze`, { body: { organization_id: orgId } });
      fetchDeals();
    } catch (err) { setError(err instanceof Error ? err.message : 'Analysis failed'); }
  };

  const stageColor = (stage: string) => {
    const colors: Record<string, string> = { qualification: 'bg-blue-500/10 text-blue-400', discovery: 'bg-amber-500/10 text-amber-400', proposal: 'bg-purple-500/10 text-purple-400', negotiation: 'bg-orange-500/10 text-orange-400', closed_won: 'bg-emerald-500/10 text-emerald-400', closed_lost: 'bg-red-500/10 text-red-400' };
    return colors[stage] || 'bg-zinc-500/10 text-zinc-400';
  };

  const healthColor = (score: number) => score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';

  const totalPipeline = deals.filter(d => d.status === 'open').reduce((sum, d) => sum + d.value_cents, 0);
  const weightedPipeline = deals.filter(d => d.status === 'open').reduce((sum, d) => sum + (d.value_cents * d.probability / 100), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sales Pipeline</h1>
          <p className="mt-1 text-sm text-zinc-400">Track deals with AI health scoring and forecasting.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
          <Plus className="h-4 w-4" />New Deal
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
          <p className="text-sm text-zinc-400">Total Pipeline</p>
          <p className="mt-2 text-2xl font-bold text-white">${(totalPipeline / 100).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
          <p className="text-sm text-zinc-400">Weighted Pipeline</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">${(weightedPipeline / 100).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
          <p className="text-sm text-zinc-400">Open Deals</p>
          <p className="mt-2 text-2xl font-bold text-white">{deals.filter(d => d.status === 'open').length}</p>
        </div>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">New Deal</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Deal Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Enterprise License"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Value ($)</label>
              <input type="number" value={form.value_cents / 100} onChange={e => setForm({ ...form, value_cents: parseInt(e.target.value) * 100 })} placeholder="50000"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Stage</label>
              <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50">
                {stages.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Expected Close</label>
              <input type="date" value={form.expected_close_date} onChange={e => setForm({ ...form, expected_close_date: e.target.value })}
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50" /></div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleCreate} disabled={creating || !form.name}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create Deal
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.04]">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : deals.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
          <Target className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No deals yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map(deal => (
            <div key={deal.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{deal.name}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                    <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />${(deal.value_cents / 100).toLocaleString()}</span>
                    <span>{deal.probability}% probability</span>
                    {deal.expected_close_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{deal.expected_close_date}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${stageColor(deal.stage)}`}>{deal.stage.replace('_', ' ')}</span>
                  {deal.ai_health_score > 0 && (
                    <span className={`text-xs font-semibold ${healthColor(deal.ai_health_score)}`}>Health: {deal.ai_health_score}</span>
                  )}
                  <button onClick={() => handleAnalyze(deal.id)} title="AI Analyze"
                    className="rounded-md p-1.5 text-zinc-500 hover:bg-brand-500/10 hover:text-brand-400"><Sparkles className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
