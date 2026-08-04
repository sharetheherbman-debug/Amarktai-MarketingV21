'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Heart,
  Plus,
  Loader2,
  AlertCircle,
  X,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Customer { id: string; customer_type: string; health_score: number; churn_risk: number; nps_score: number | null; satisfaction_score: number | null; onboarding_status: string; onboarding_progress: number; renewal_date: string | null; lifetime_value_cents: number; status: string; ai_health_summary: string | null; created_at: string; }

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchCustomers = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const params: Record<string, string> = { organization_id: orgId };
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get<ApiResponse<Customer[]>>('/crm/customers', { params });
      setCustomers(res.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [orgId, statusFilter]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const handleAnalyze = async (id: string) => {
    try {
      await api.post(`/crm/customers/${id}/analyze`, { body: { organization_id: orgId } });
      fetchCustomers();
    } catch (err) { setError(err instanceof Error ? err.message : 'Analysis failed'); }
  };

  const healthColor = (score: number) => score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-red-400';
  const churnColor = (risk: number) => risk >= 70 ? 'text-red-400' : risk >= 40 ? 'text-amber-400' : 'text-emerald-400';
  const statusColors: Record<string, string> = { active: 'bg-emerald-500/10 text-emerald-400', at_risk: 'bg-red-500/10 text-red-400', churned: 'bg-zinc-500/10 text-zinc-400', expansion: 'bg-blue-500/10 text-blue-400' };

  const avgHealth = customers.length > 0 ? Math.round(customers.reduce((sum, c) => sum + c.health_score, 0) / customers.length) : 0;
  const atRisk = customers.filter(c => c.churn_risk >= 70).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Success</h1>
          <p className="mt-1 text-sm text-zinc-400">Monitor health scores and prevent churn.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
          <p className="text-sm text-zinc-400">Total Customers</p>
          <p className="mt-2 text-2xl font-bold text-white">{customers.length}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
          <p className="text-sm text-zinc-400">Avg Health Score</p>
          <p className={`mt-2 text-2xl font-bold ${healthColor(avgHealth)}`}>{avgHealth}%</p>
        </div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
          <p className="text-sm text-red-400">At Risk</p>
          <p className="mt-2 text-2xl font-bold text-red-400">{atRisk}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {['all', 'active', 'at_risk', 'churned', 'expansion'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === s ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : customers.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
          <Heart className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No customers yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map(c => (
            <div key={c.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white capitalize">{c.customer_type} Customer</h3>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColors[c.status] || 'bg-zinc-500/10 text-zinc-400'}`}>{c.status}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                    <span>Health: <span className={healthColor(c.health_score)}>{c.health_score}%</span></span>
                    <span>Churn Risk: <span className={churnColor(c.churn_risk)}>{c.churn_risk}%</span></span>
                    {c.nps_score !== null && <span>NPS: {c.nps_score}</span>}
                    <span>Onboarding: {c.onboarding_progress}%</span>
                    {c.renewal_date && <span>Renewal: {c.renewal_date}</span>}
                    <span>LTV: ${(c.lifetime_value_cents / 100).toLocaleString()}</span>
                  </div>
                  {c.ai_health_summary && <p className="mt-2 text-xs text-zinc-500">{c.ai_health_summary}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {c.churn_risk >= 70 && <AlertTriangle className="h-4 w-4 text-red-400" />}
                  <button onClick={() => handleAnalyze(c.id)} title="AI Analyze"
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
