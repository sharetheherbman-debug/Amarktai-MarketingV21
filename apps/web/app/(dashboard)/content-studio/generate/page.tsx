'use client';

import { useState } from 'react';
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
];

const platforms = [
  'web', 'facebook', 'instagram', 'linkedin', 'x', 'threads', 'pinterest', 'reddit', 'youtube', 'email',
];

export default function GenerateContentPage() {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    type: 'blog',
    platform: 'web',
    title: '',
    prompt: '',
    max_words: 1000,
    tone: 'professional',
  });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const handleGenerate = async () => {
    if (!form.prompt || !orgId) return;
    try {
      setGenerating(true);
      setError(null);
      const res = await api.post<ApiResponse<{ content: { id: string } }>>('/content-studio/generate', {
        body: { ...form, organization_id: orgId },
      });
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
          <h1 className="text-2xl font-bold text-white">AI Content Generator</h1>
          <p className="mt-1 text-sm text-zinc-400">Generate marketing content using your Brand DNA and Knowledge Base.</p>
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
              Content is generated using your Brand DNA, Knowledge Base, and Memory context for maximum relevance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
