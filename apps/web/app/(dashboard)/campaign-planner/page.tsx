'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Palette,
  FileStack,
  Edit3,
  Save,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface CampaignPlan {
  id: string; name: string; goal: string | null; status: string; budget_cents: number;
  ai_generated: boolean; created_at: string; strategy: Record<string, any>; channels: Record<string, any>;
  brief: Record<string, any>; creative_concept: Record<string, any>; messaging_plan: Record<string, any>;
  content_calendar: Array<Record<string, any>>; asset_requirements: Array<Record<string, any>>;
  constraints: Record<string, any>; optimization_plan: Record<string, any>;
  generation_credit_limit: number; version: number;
}
interface AssetRun { id: string; brief_id: string; variant_number: number; generation_kind: string; status: string; content_id?: string | null; studio_generation_id?: string | null; error_message?: string | null; }

const initialForm = {
  name: '', goal: '', objective_stage: 'conversion', target_audience: '', budget_cents: 0,
  products: '', location: '', duration_weeks: 4, offer: '', value_proposition: '',
  proof_points: '', calls_to_action: '', channels: ['social', 'email', 'content'],
  brand_restrictions: '', prohibited_claims: '', success_criteria: '',
  generation_credit_limit: 0, language: 'en-GB',
};

export default function CampaignPlannerPage() {
  const [plans, setPlans] = useState<CampaignPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editConcept, setEditConcept] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [productionByPlan, setProductionByPlan] = useState<Record<string, AssetRun[]>>({});
  const generationAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

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
      const payload = {
        ...form,
        proof_points: form.proof_points.split('\n').map(value => value.trim()).filter(Boolean),
        calls_to_action: form.calls_to_action.split('\n').map(value => value.trim()).filter(Boolean),
        brand_restrictions: form.brand_restrictions.split('\n').map(value => value.trim()).filter(Boolean),
        prohibited_claims: form.prohibited_claims.split('\n').map(value => value.trim()).filter(Boolean),
        success_criteria: form.success_criteria.split('\n').map(value => value.trim()).filter(Boolean),
        organization_id: orgId,
      };
      const fingerprint = JSON.stringify(payload);
      if (!generationAttempt.current || generationAttempt.current.fingerprint !== fingerprint) {
        generationAttempt.current = { fingerprint, key: crypto.randomUUID() };
      }
      await api.post('/campaign-ai/plans/generate', { body: {
        ...payload,
        idempotency_key: `campaign-plan:${generationAttempt.current.key}`,
      } });
      generationAttempt.current = null;
      setShowGenerate(false);
      setForm(initialForm);
      fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const approvePlan = async (planId: string) => {
    try {
      setSavingId(planId);
      setError(null);
      await api.put(`/campaign-ai/plans/${planId}/status`, { body: { organization_id: orgId, status: 'approved' } });
      await fetchPlans();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve the campaign strategy');
    } finally { setSavingId(null); }
  };

  const beginEdit = (plan: CampaignPlan) => {
    setExpandedId(plan.id); setEditingId(plan.id);
    setEditConcept(String(plan.creative_concept?.central_idea || plan.creative_concept?.narrative || ''));
    setEditMessage(String(plan.messaging_plan?.primary_message || plan.strategy?.overview || ''));
  };

  const savePlanEdits = async (plan: CampaignPlan) => {
    try {
      setSavingId(plan.id); setError(null);
      await api.put(`/campaign-ai/plans/${plan.id}`, { body: {
        organization_id: orgId,
        creative_concept: { ...plan.creative_concept, central_idea: editConcept },
        messaging_plan: { ...plan.messaging_plan, primary_message: editMessage },
        change_summary: 'Owner edited the central concept and primary message in Campaign Planner',
      } });
      setEditingId(null); await fetchPlans();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save strategy edits'); }
    finally { setSavingId(null); }
  };

  const loadProduction = async (planId: string) => {
    const response = await api.get<ApiResponse<AssetRun[]>>(`/campaign-ai/plans/${planId}/production`, { params: { organization_id: orgId } });
    setProductionByPlan(current => ({ ...current, [planId]: response.data }));
  };

  const queueProduction = async (planId: string) => {
    try {
      setSavingId(planId); setError(null);
      const response = await api.post<ApiResponse<AssetRun[]>>(`/campaign-ai/plans/${planId}/production`, { body: { organization_id: orgId } });
      setProductionByPlan(current => ({ ...current, [planId]: response.data }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not queue campaign production'); }
    finally { setSavingId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaign Planner</h1>
          <p className="mt-1 text-sm text-zinc-400">Turn a grounded business brief into one coordinated, owner-approved campaign.</p>
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
          <div className="mb-5 flex items-start justify-between gap-4">
            <div><h2 className="text-lg font-semibold text-white">Build the campaign brief</h2>
              <p className="mt-1 text-sm text-zinc-400">Supply facts and boundaries first. The strategy remains a draft until you approve it.</p></div>
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">Owner review required</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Campaign Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Spring confidence campaign"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Goal *</label>
              <input type="text" value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} placeholder="Generate qualified assessment bookings"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Journey stage</label>
              <select value={form.objective_stage} onChange={e => setForm({ ...form, objective_stage: e.target.value })}
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-surface-200 px-4 text-sm text-white outline-none focus:border-brand-500/50">
                {['awareness','consideration','conversion','retention','reactivation'].map(stage => <option key={stage} value={stage}>{stage[0].toUpperCase()+stage.slice(1)}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Target Audience</label>
              <input type="text" value={form.target_audience} onChange={e => setForm({ ...form, target_audience: e.target.value })} placeholder="Who they are, what they need and what may stop them"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Advertising budget (GBP)</label>
              <input type="number" min="0" value={form.budget_cents / 100} onChange={e => setForm({ ...form, budget_cents: Math.round(Number(e.target.value || 0) * 100) })} placeholder="500"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Products/Services</label>
              <input type="text" value={form.products} onChange={e => setForm({ ...form, products: e.target.value })} placeholder="Use exact approved product or service facts"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Location</label>
              <input type="text" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Global"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Offer</label>
              <input type="text" value={form.offer} onChange={e => setForm({ ...form, offer: e.target.value })} placeholder="The exact approved offer — leave blank if none"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Value proposition</label>
              <input type="text" value={form.value_proposition} onChange={e => setForm({ ...form, value_proposition: e.target.value })} placeholder="Why this matters to this audience"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Generation Credit limit</label>
              <input type="number" min="0" step="1" value={form.generation_credit_limit} onChange={e => setForm({ ...form, generation_credit_limit: Math.max(0, Number(e.target.value || 0)) })}
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50" /></div>
            {[
              ['proof_points','Approved proof points','One verified proof point per line'],
              ['calls_to_action','Approved calls to action','One owner-approved next step per line'],
              ['success_criteria','Success criteria','One measurable outcome per line'],
              ['prohibited_claims','Claims never to make','One prohibited claim per line'],
              ['brand_restrictions','Brand restrictions','One wording or visual restriction per line'],
            ].map(([key,label,placeholder]) => <div key={key}>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">{label}</label>
              <textarea rows={3} value={String(form[key as keyof typeof form])} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
                className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" />
            </div>)}
            <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm font-medium text-zinc-300">Channels to consider</legend>
              <div className="flex flex-wrap gap-2">{['social','email','content','seo','advertising'].map(channel => {
                const active=form.channels.includes(channel); return <button type="button" key={channel} aria-pressed={active}
                  onClick={()=>setForm({...form,channels:active?form.channels.filter(item=>item!==channel):[...form.channels,channel]})}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active?'border-brand-500/50 bg-brand-500/10 text-brand-300':'border-white/10 text-zinc-400'}`}>{channel}</button>;
              })}</div>
            </fieldset>
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
          {plans.map(plan => {
            const expanded = expandedId === plan.id;
            const missing = Array.isArray(plan.constraints?.missing_information) ? plan.constraints.missing_information : [];
            return (
            <div key={plan.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{plan.name}</h3>
                  {plan.goal && <p className="mt-0.5 text-xs text-zinc-500">{plan.goal}</p>}
                  <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                    {plan.budget_cents > 0 && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />£{(plan.budget_cents / 100).toLocaleString()}</span>}
                    <span>{new Date(plan.created_at).toLocaleDateString()}</span>
                    <span>Version {plan.version}</span>
                    <span>{plan.asset_requirements?.length || 0} asset briefs</span>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${plan.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-300'}`}>
                  {plan.status}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={()=>setExpandedId(expanded?null:plan.id)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.04]">
                  {expanded?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}Review strategy
                </button>
                {editingId===plan.id?<button onClick={()=>savePlanEdits(plan)} disabled={savingId===plan.id||!editConcept.trim()||!editMessage.trim()} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Save className="h-4 w-4"/>Save new version</button>:<button onClick={()=>beginEdit(plan)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300"><Edit3 className="h-4 w-4"/>Edit strategy</button>}
                {plan.status !== 'approved' && <button onClick={()=>approvePlan(plan.id)} disabled={savingId===plan.id || missing.length>0}
                  title={missing.length ? 'Resolve missing information before approval' : 'Approve this exact strategy version'}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">
                  {savingId===plan.id?<Loader2 className="h-4 w-4 animate-spin"/>:<ShieldCheck className="h-4 w-4"/>}Approve strategy
                </button>}
                {plan.status === 'approved' && <button onClick={()=>queueProduction(plan.id)} disabled={savingId===plan.id} className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-xs font-semibold text-purple-200 disabled:opacity-40">{savingId===plan.id?<Loader2 className="h-4 w-4 animate-spin"/>:<Sparkles className="h-4 w-4"/>}Generate campaign assets</button>}
                {productionByPlan[plan.id]?.length>0 && <button onClick={()=>loadProduction(plan.id)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300">Refresh production</button>}
              </div>
              {expanded && <div className="mt-5 grid gap-4 border-t border-white/[0.06] pt-5 md:grid-cols-2">
                <section className="rounded-lg bg-white/[0.025] p-4"><h4 className="flex items-center gap-2 text-sm font-semibold text-white"><Palette className="h-4 w-4 text-purple-300"/>Creative concept</h4>
                  <p className="mt-2 text-sm font-medium text-zinc-200">{plan.creative_concept?.name || 'Not supplied'}</p>{editingId===plan.id?<textarea aria-label="Central campaign idea" rows={4} value={editConcept} onChange={event=>setEditConcept(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/10 p-3 text-xs leading-relaxed text-white outline-none focus:border-brand-500/50"/>:<p className="mt-1 text-xs leading-relaxed text-zinc-400">{plan.creative_concept?.central_idea || plan.creative_concept?.narrative || ''}</p>}</section>
                <section className="rounded-lg bg-white/[0.025] p-4"><h4 className="flex items-center gap-2 text-sm font-semibold text-white"><Target className="h-4 w-4 text-brand-300"/>Audience and message</h4>
                  {editingId===plan.id?<textarea aria-label="Primary campaign message" rows={4} value={editMessage} onChange={event=>setEditMessage(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-black/10 p-3 text-xs leading-relaxed text-white outline-none focus:border-brand-500/50"/>:<p className="mt-2 text-xs leading-relaxed text-zinc-400">{plan.messaging_plan?.primary_message || plan.strategy?.overview || 'Review the complete strategy before approval.'}</p>}</section>
                <section className="rounded-lg bg-white/[0.025] p-4"><h4 className="flex items-center gap-2 text-sm font-semibold text-white"><FileStack className="h-4 w-4 text-blue-300"/>Production plan</h4>
                  <p className="mt-2 text-xs text-zinc-400">{plan.asset_requirements?.length || 0} asset briefs across {Object.keys(plan.channels || {}).length} channel groups; {plan.content_calendar?.length || 0} calendar entries.</p></section>
                <section className={`rounded-lg p-4 ${missing.length?'bg-amber-500/5':'bg-emerald-500/5'}`}><h4 className="flex items-center gap-2 text-sm font-semibold text-white"><CheckCircle2 className={`h-4 w-4 ${missing.length?'text-amber-300':'text-emerald-300'}`}/>Owner checks</h4>
                  {missing.length?<ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-200">{missing.map((item:string)=><li key={item}>{item}</li>)}</ul>:<p className="mt-2 text-xs text-emerald-200">No missing business facts were flagged. Confirm every claim before approval.</p>}</section>
                {productionByPlan[plan.id]?.length>0 && <section className="rounded-lg bg-white/[0.025] p-4 md:col-span-2"><h4 className="text-sm font-semibold text-white">Campaign production</h4><p className="mt-1 text-xs text-zinc-400">Every variation is isolated: a failed format can retry without replacing or recharging completed assets.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{productionByPlan[plan.id].map(run=><div key={run.id} className="rounded-lg border border-white/[0.06] p-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium text-zinc-200">{run.brief_id} · v{run.variant_number}</span><span className={`rounded-full px-2 py-0.5 text-[10px] ${run.status==='completed'?'bg-emerald-500/10 text-emerald-300':run.status==='failed'?'bg-red-500/10 text-red-300':'bg-amber-500/10 text-amber-200'}`}>{run.status.replaceAll('_',' ')}</span></div><p className="mt-1 text-[11px] text-zinc-500">{run.generation_kind}</p>{run.error_message&&<p className="mt-1 line-clamp-2 text-[11px] text-red-300">{run.error_message}</p>}</div>)}</div></section>}
              </div>}
            </div>
          );})}
        </div>
      )}
    </div>
  );
}
