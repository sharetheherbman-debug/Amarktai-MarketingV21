'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Megaphone,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Sparkles,
  Calendar,
  DollarSign,
  Target,
  BarChart3,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface CampaignPlan { id: string; name: string; goal: string | null; status: string; budget_cents: number; ai_generated: boolean; created_at: string; strategy: Record<string, unknown>; channels: Record<string, unknown>; }

export default function CampaignPlannerPage() {
  const [plans, setPlans] = useState<CampaignPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', target_audience: '', budget_cents: 0, products: '', location: '', duration_weeks: 4 });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchPlans = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<CampaignPlan[]>>('/campaign-ai/plans', { params: { organization_id: orgId } });
      setPlans(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleGenerate = async () => {
    if (!form.name || !form.goal || !orgId) return;
    try {
      setGenerating(true);
      await api.post('/campaign-ai/plans/generate', { body: { ...form, organization_id: orgId } });
      setShowGenerate(false);
      setForm({ name: '', goal: '', target_audience: '', budget_cents: 0, products: '', location: '', duration_weeks: 4 });
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaign Planner</h1>
          <p className="mt-1 text-sm text-zinc-400">AI-powered multi-channel campaign planning.</p>
        </div>
        <button onClick={() => setShowGenerate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
          <Sparkles className="h-4 w-4" />AI Generate Plan
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {showGenerate && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Generate Campaign Plan</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Campaign Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Summer Sale 2024"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Goal *</label>
              <input type="text" value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} placeholder="Increase sales by 30%"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Target Audience</label>
              <input type="text" value={form.target_audience} onChange={e => setForm({ ...form, target_audience: e.target.value })} placeholder="Small business owners, 25-45"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Budget ($)</label>
              <input type="number" value={form.budget_cents / 100} onChange={e => setForm({ ...form, budget_cents: parseInt(e.target.value) * 100 })} placeholder="5000"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Products/Services</label>
              <input type="text" value={form.products} onChange={e => setForm({ ...form, products: e.target.value })} placeholder="AI Marketing Platform"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Location</label>
              <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Global"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleGenerate} disabled={generating || !form.name || !form.goal}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Generate Plan
            </button>
            <button onClick={() => setShowGenerate(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.04]">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No campaign plans yet. Generate one with AI.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => (
            <div key={plan.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{plan.name}</h3>
                  {plan.goal && <p className="mt-0.5 text-xs text-zinc-500">{plan.goal}</p>}
                  <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                    {plan.budget_cents > 0 && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />${(plan.budget_cents / 100).toLocaleString()}</span>}
                    <span>{new Date(plan.created_at).toLocaleDateString()}</span>
                    {plan.ai_generated && <span className="text-purple-400">AI Generated</span>}
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${plan.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                  {plan.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
