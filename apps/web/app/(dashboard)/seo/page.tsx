'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Globe,
  BarChart3,
  Loader2,
  AlertCircle,
  X,
  Plus,
  Sparkles,
  Link2,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface SeoKeyword { id: string; keyword: string; search_volume: number; difficulty: number; intent: string | null; }
interface SeoAudit { id: string; url: string; score: number; issues: Array<{ type: string; severity: string; message: string }>; suggestions: string[]; created_at: string; }

export default function SeoPage() {
  const [tab, setTab] = useState<'keywords' | 'audit' | 'meta'>('keywords');
  const [keywords, setKeywords] = useState<SeoKeyword[]>([]);
  const [audits, setAudits] = useState<SeoAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [researchSeed, setResearchSeed] = useState('');
  const [researching, setResearching] = useState(false);
  const [researchResults, setResearchResults] = useState<Array<{ keyword: string; search_volume: number; difficulty: number; intent: string }>>([]);
  const [auditUrl, setAuditUrl] = useState('');
  const [auditing, setAuditing] = useState(false);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [kwRes, auditRes] = await Promise.all([
        api.get<ApiResponse<SeoKeyword[]>>('/seo/keywords', { params: { organization_id: orgId } }),
        api.get<ApiResponse<SeoAudit[]>>('/seo/audits', { params: { organization_id: orgId } }),
      ]);
      setKeywords(kwRes.data);
      setAudits(auditRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SEO data');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleResearch = async () => {
    if (!researchSeed || !orgId) return;
    try {
      setResearching(true);
      const res = await api.post<ApiResponse<Array<{ keyword: string; search_volume: number; difficulty: number; intent: string }>>>('/seo/keywords/research', {
        body: { organization_id: orgId, seed: researchSeed, count: 15 },
      });
      setResearchResults(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Research failed');
    } finally {
      setResearching(false);
    }
  };

  const handleSaveKeywords = async () => {
    if (!orgId || researchResults.length === 0) return;
    try {
      await api.post('/seo/keywords/save', { body: { organization_id: orgId, keywords: researchResults } });
      setResearchResults([]);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleAudit = async () => {
    if (!auditUrl || !orgId) return;
    try {
      setAuditing(true);
      await api.post('/seo/audit', { body: { organization_id: orgId, url: auditUrl } });
      setAuditUrl('');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed');
    } finally {
      setAuditing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">SEO Intelligence</h1>
        <p className="mt-1 text-sm text-zinc-400">Keyword research, site audits, and content optimization.</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-1">
        {([['keywords', 'Keywords', Search], ['audit', 'Site Audit', Globe], ['meta', 'Meta Generator', FileText]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as typeof tab)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:text-white'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'keywords' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">AI Keyword Research</h2>
            <div className="flex gap-3">
              <input type="text" value={researchSeed} onChange={e => setResearchSeed(e.target.value)} placeholder="Enter a seed keyword..."
                className="flex-1 h-10 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" />
              <button onClick={handleResearch} disabled={researching || !researchSeed}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
                {researching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Research
              </button>
            </div>
            {researchResults.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-300">Found {researchResults.length} keywords</p>
                  <button onClick={handleSaveKeywords} className="text-sm font-medium text-brand-400 hover:text-brand-300">Save All</button>
                </div>
                {researchResults.map((kw, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-4 py-2.5">
                    <span className="text-sm text-white">{kw.keyword}</span>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span>{kw.search_volume}/mo</span>
                      <span>Diff: {kw.difficulty}</span>
                      <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-brand-300">{kw.intent}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-surface-100">
            <div className="border-b border-white/[0.06] px-6 py-4">
              <h2 className="text-sm font-semibold text-white">Saved Keywords ({keywords.length})</h2>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-400" /></div>
            ) : keywords.length === 0 ? (
              <div className="py-12 text-center text-sm text-zinc-500">No keywords saved yet.</div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {keywords.map(kw => (
                  <div key={kw.id} className="flex items-center justify-between px-6 py-3">
                    <span className="text-sm text-white">{kw.keyword}</span>
                    <div className="flex items-center gap-4 text-xs text-zinc-400">
                      <span>{kw.search_volume}/mo</span>
                      <span>Diff: {Math.round(kw.difficulty)}</span>
                      {kw.intent && <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-brand-300">{kw.intent}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Site Audit</h2>
            <div className="flex gap-3">
              <input type="url" value={auditUrl} onChange={e => setAuditUrl(e.target.value)} placeholder="https://example.com"
                className="flex-1 h-10 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" />
              <button onClick={handleAudit} disabled={auditing || !auditUrl}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
                {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}Audit
              </button>
            </div>
          </div>

          {audits.map(audit => (
            <div key={audit.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">{audit.url}</h3>
                  <p className="text-xs text-zinc-500">{new Date(audit.created_at).toLocaleDateString()}</p>
                </div>
                <div className={`text-2xl font-bold ${audit.score >= 80 ? 'text-emerald-400' : audit.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                  {Math.round(audit.score)}
                </div>
              </div>
              {audit.issues.length > 0 && (
                <div className="space-y-2">
                  {audit.issues.slice(0, 5).map((issue, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`h-2 w-2 rounded-full ${issue.severity === 'error' ? 'bg-red-400' : issue.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                      <span className="text-zinc-300">{issue.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'meta' && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">Meta title and description generator coming soon. Use the API endpoint directly.</p>
        </div>
      )}
    </div>
  );
}
