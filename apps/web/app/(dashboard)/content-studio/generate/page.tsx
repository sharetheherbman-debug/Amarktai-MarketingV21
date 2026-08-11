'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Loader2,
  ArrowLeft,
  FileText,
  Globe,
  Mail,
  Megaphone,
  AlertCircle,
  X,
  ShieldCheck,
  Target,
  Palette,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

const contentTypes = [
  { value: 'blog', label: 'Blog Post', icon: FileText, description: 'Long-form blog article' },
  { value: 'article', label: 'Article', icon: FileText, description: 'In-depth article' },
  { value: 'landing_page', label: 'Landing Page', icon: Globe, description: 'Conversion-focused page' },
  { value: 'sales_page', label: 'Sales Page', icon: Megaphone, description: 'Sales copy' },
  { value: 'email', label: 'Email', icon: Mail, description: 'Email campaign' },
  { value: 'newsletter', label: 'Newsletter', icon: Mail, description: 'Newsletter content' },
  { value: 'social', label: 'Social Post', icon: Globe, description: 'Social media post' },
  { value: 'product_desc', label: 'Product Description', icon: FileText, description: 'Product copy' },
  { value: 'press_release', label: 'Press Release', icon: FileText, description: 'Press release' },
  { value: 'case_study', label: 'Case Study', icon: FileText, description: 'Customer case study' },
  { value: 'faq', label: 'FAQ', icon: FileText, description: 'FAQ content' },
  { value: 'ad', label: 'Advertisement', icon: Megaphone, description: 'Platform-specific ad copy' },
  { value: 'image', label: 'Image Brief', icon: FileText, description: 'Visual concept, prompt and alt text' },
  { value: 'video', label: 'Video Script', icon: FileText, description: 'Scenes, narration and production notes' },
];

const platforms = [
  'web', 'facebook', 'instagram', 'linkedin', 'x', 'threads', 'pinterest', 'reddit', 'youtube', 'email',
];

export default function GenerateContentPage() {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [campaignPlans, setCampaignPlans] = useState<Array<{ id: string; name: string; creative_concept?: { name?: string } }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [form, setForm] = useState({
    type: 'blog',
    platform: 'web',
    title: '',
    prompt: '',
    max_words: 1000,
    tone: 'professional',
    campaign_plan_id: '',
    audience: '',
    objective: '',
    offer: '',
    calls_to_action: '',
    creative_direction: '',
    required_terms: '',
    prohibited_claims: '',
    alt_text: '',
    template_id: '',
  });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  useEffect(() => {
    if (!orgId) return;
    api.get<ApiResponse<Array<{ id: string; name: string; status: string; creative_concept?: { name?: string } }>>>('/campaign-ai/plans', { params: { organization_id: orgId } })
      .then((response) => setCampaignPlans(response.data.filter((plan) => plan.status === 'approved')))
      .catch(() => setCampaignPlans([]));
    api.get<ApiResponse<Array<{ id: string; name: string; type: string }>>>('/templates', { params: { organization_id: orgId } })
      .then((response) => setTemplates(response.data))
      .catch(() => setTemplates([]));
  }, [orgId]);

  const handleGenerate = async () => {
    if (!form.prompt || !orgId) return;
    try {
      setGenerating(true);
      setError(null);
      const payload = {
        ...form,
        campaign_plan_id: form.campaign_plan_id || undefined,
        template_id: form.template_id || undefined,
        calls_to_action: form.calls_to_action.split('\n').map(value => value.trim()).filter(Boolean),
        required_terms: form.required_terms.split('\n').map(value => value.trim()).filter(Boolean),
        prohibited_claims: form.prohibited_claims.split('\n').map(value => value.trim()).filter(Boolean),
        organization_id: orgId,
      };
      const fingerprint = JSON.stringify(payload);
      if (!generationAttempt.current || generationAttempt.current.fingerprint !== fingerprint) {
        generationAttempt.current = { fingerprint, key: crypto.randomUUID() };
      }
      const res = await api.post<ApiResponse<{ content: { id: string } }>>('/content-studio/generate', {
        body: {
          ...payload,
          idempotency_key: `content:${generationAttempt.current.key}`,
        },
      });
      generationAttempt.current = null;
      router.push(`/content-studio/${res.data.content.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.04] hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Create a campaign asset</h1>
          <p className="mt-1 text-sm text-zinc-400">Generate focused, brand-aware content from an approved strategy and factual brief.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-300" />
              <div className="flex-1"><h2 className="text-sm font-semibold text-white">Approved campaign strategy</h2>
                <p className="mt-1 text-xs text-zinc-400">Optional for standalone assets; required for coordinated campaign production.</p>
                <select value={form.campaign_plan_id} onChange={e => setForm({ ...form, campaign_plan_id: e.target.value })}
                  className="mt-3 h-10 w-full rounded-lg border border-white/[0.08] bg-surface-200 px-3 text-sm text-white outline-none focus:border-brand-500/50">
                  <option value="">Standalone content</option>
                  {campaignPlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}{plan.creative_concept?.name ? ` — ${plan.creative_concept.name}` : ''}</option>)}
                </select>
                {campaignPlans.length === 0 && <p className="mt-2 text-xs text-amber-300">No approved strategies yet. Review and approve one in Campaign Planner first.</p>}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Content Type</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {contentTypes.map(ct => (
                <button key={ct.value} onClick={() => setForm({ ...form, type: ct.value })}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    form.type === ct.value ? 'border-brand-500/50 bg-brand-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}>
                  <ct.icon className={`h-5 w-5 ${form.type === ct.value ? 'text-brand-400' : 'text-zinc-400'}`} />
                  <div>
                    <p className={`text-sm font-medium ${form.type === ct.value ? 'text-white' : 'text-zinc-300'}`}>{ct.label}</p>
                    <p className="text-[11px] text-zinc-500">{ct.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white"><Target className="h-5 w-5 text-brand-300" />Audience, offer and outcome</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-1.5 block text-sm font-medium text-zinc-300">Audience</label><input value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})} placeholder="Specific audience, need and objection" className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-zinc-300">Objective</label><input value={form.objective} onChange={e=>setForm({...form,objective:e.target.value})} placeholder="The action or change this asset should create" className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-zinc-300">Approved offer</label><input value={form.offer} onChange={e=>setForm({...form,offer:e.target.value})} placeholder="Exact offer; leave blank rather than inventing one" className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-zinc-300">Calls to action</label><textarea rows={2} value={form.calls_to_action} onChange={e=>setForm({...form,calls_to_action:e.target.value})} placeholder="One approved CTA per line" className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white"><Palette className="h-5 w-5 text-purple-300" />Creative and factual guardrails</h2>
            <div className="space-y-4">
              <div><label className="mb-1.5 block text-sm font-medium text-zinc-300">Creative direction</label><textarea rows={3} value={form.creative_direction} onChange={e=>setForm({...form,creative_direction:e.target.value})} placeholder="Hook, emotional direction, visual or narrative treatment" className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="mb-1.5 block text-sm font-medium text-zinc-300">Required factual terms</label><textarea rows={3} value={form.required_terms} onChange={e=>setForm({...form,required_terms:e.target.value})} placeholder="One required term per line" className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
                <div><label className="mb-1.5 block text-sm font-medium text-zinc-300">Prohibited claims</label><textarea rows={3} value={form.prohibited_claims} onChange={e=>setForm({...form,prohibited_claims:e.target.value})} placeholder="One claim or phrase per line" className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
              </div>
              {['image','video','asset'].includes(form.type) && <div><label className="mb-1.5 block text-sm font-medium text-zinc-300">Accessibility text</label><input value={form.alt_text} onChange={e=>setForm({...form,alt_text:e.target.value})} placeholder="Describe the essential visual meaning" className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Prompt</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Title (optional)</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="Content title..."
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Prompt *</label>
                <textarea value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })}
                  placeholder="Describe what you want to generate. Be specific about the topic, key points, target audience, and desired outcome..."
                  rows={6}
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Reusable template</label>
                <select value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })}
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-surface-200 px-4 text-sm text-white outline-none focus:border-brand-500/50">
                  <option value="">No template</option>
                  {templates.filter(template => template.type === form.type || form.type === 'asset').map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Platform</label>
                <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50">
                  {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Tone</label>
                <select value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })}
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50">
                  {['professional', 'casual', 'friendly', 'formal', 'persuasive', 'informative', 'humorous'].map(t =>
                    <option key={t} value={t}>{t}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Max Words</label>
                <input type="number" value={form.max_words} onChange={e => setForm({ ...form, max_words: parseInt(e.target.value) })}
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50" />
              </div>
            </div>
          </div>

          <button onClick={handleGenerate} disabled={generating || !form.prompt}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-400 disabled:opacity-50">
            {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {generating ? 'Generating...' : 'Generate Content'}
          </button>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-xs text-amber-300">
              Outputs are checked for campaign alignment, unsupported claims, platform fit, repetition, calls to action and accessibility before review.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
