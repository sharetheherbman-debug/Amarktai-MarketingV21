'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  FileText,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse, KnowledgeSource } from '@/types';

type BrandDNA = {
  companyName?: string;
  description?: string;
  industry?: string;
  websiteUrl?: string;
  products?: string[];
  voiceDescription?: string;
  demographics?: string;
  psychographics?: string;
  goals?: string[];
  prohibitedPhrases?: string[];
  complianceRules?: string[];
  logoUrl?: string;
};

type KnowledgeStats = {
  source_count?: number;
  item_count?: number;
  total_tokens?: number;
  sources?: number;
  items?: number;
};

function statusTone(status: string | undefined) {
  const value = String(status || '').toLowerCase();
  if (['active', 'completed', 'ready'].includes(value)) return 'ep-status-success';
  if (['failed', 'error'].includes(value)) return 'ep-status-danger';
  return 'ep-status-warning';
}

export default function BusinessBrainPage() {
  const [brand, setBrand] = useState<BrandDNA>({});
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [stats, setStats] = useState<KnowledgeStats>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [website, setWebsite] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [brandResult, sourcesResult, statsResult] = await Promise.allSettled([
      api.get<ApiResponse<BrandDNA>>('/brand-dna'),
      api.get<ApiResponse<KnowledgeSource[]>>('/knowledge'),
      api.get<ApiResponse<KnowledgeStats>>('/knowledge/stats'),
    ]);

    if (brandResult.status === 'fulfilled') setBrand(brandResult.value.data || {});
    if (sourcesResult.status === 'fulfilled') setSources(sourcesResult.value.data || []);
    if (statsResult.status === 'fulfilled') setStats(statsResult.value.data || {});

    if ([brandResult, sourcesResult, statsResult].some((result) => result.status === 'rejected')) {
      setError('Some Business Brain information could not be refreshed. Existing business knowledge is unchanged.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const websiteSources = useMemo(
    () => sources.filter((source) => source.type === 'website'),
    [sources]
  );

  const readiness = useMemo(() => {
    const checks = [
      Boolean(brand.companyName),
      Boolean(brand.description),
      Boolean(brand.products?.length),
      Boolean(brand.voiceDescription),
      Boolean(brand.demographics || brand.psychographics),
      Boolean(brand.goals?.length),
      websiteSources.some((source) => ['active', 'completed'].includes(String(source.status).toLowerCase())),
    ];
    return {
      complete: checks.filter(Boolean).length,
      total: checks.length,
      percent: Math.round((checks.filter(Boolean).length / checks.length) * 100),
    };
  }, [brand, websiteSources]);

  const analyseWebsite = async () => {
    const url = website.trim();
    if (!url) return;
    setBusy('website');
    setError(null);
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      await api.post('/knowledge', {
        body: {
          name: `${host} website`,
          type: 'website',
          url,
          config: { max_pages: 25, max_depth: 3, follow_links: true },
          sync_now: true,
        },
      });
      setWebsite('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The website could not be analysed.');
    } finally {
      setBusy(null);
    }
  };

  const syncSource = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await api.post(`/knowledge/${id}/sync`, { body: {} });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The source could not be refreshed.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--ep-blue)]" /></div>;
  }

  const sourceCount = Number(stats.source_count ?? stats.sources ?? sources.length ?? 0);
  const itemCount = Number(stats.item_count ?? stats.items ?? sources.reduce((sum, source) => sum + Number(source.item_count || 0), 0));

  return (
    <div className="space-y-6">
      <header className="ep-panel overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="ep-section-label flex items-center gap-2"><BrainCircuit className="h-4 w-4" /> Business Brain</div>
            <h1 className="ep-page-title mt-2">Teach your marketing team how your business really works.</h1>
            <p className="ep-page-copy mt-3 max-w-2xl text-sm leading-6 sm:text-base">
              Analyse your website, add trusted business knowledge, define your brand and keep the information used for planning and content current.
            </p>
          </div>
          <div className="min-w-[220px] rounded-2xl border border-[var(--ep-border)] bg-[var(--ep-blue-soft)] p-4">
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-[var(--ep-text-muted)]">Readiness</span><span className="text-xl font-extrabold text-[var(--ep-navy)]">{readiness.percent}%</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[var(--ep-blue)]" style={{ width: `${readiness.percent}%` }} /></div>
            <p className="mt-2 text-xs text-[var(--ep-text-muted)]">{readiness.complete} of {readiness.total} core business signals are ready.</p>
          </div>
        </div>
      </header>

      {error && (
        <div className="ep-status-warning flex items-start gap-3 rounded-xl border px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <div className="ep-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><Globe2 className="h-5 w-5" /></div>
            <div>
              <h2 className="text-lg font-extrabold text-[var(--ep-navy)]">Analyse your website</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--ep-text-muted)]">The existing secure crawler follows your public site within bounded limits and stores useful business knowledge in this workspace.</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void analyseWebsite(); }}
              placeholder="https://yourbusiness.com"
              className="ep-input min-h-11 flex-1 px-3 py-2.5 text-sm"
            />
            <button type="button" onClick={() => void analyseWebsite()} disabled={!website.trim() || busy === 'website'} className="ep-button-primary min-h-11 px-5 text-sm">
              {busy === 'website' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Analyse website
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--ep-text-soft)]">Only public HTTP/HTTPS pages that pass the platform's safe-fetch rules are ingested. You can re-sync or remove sources later.</p>
        </div>

        <div className="ep-card p-5 sm:p-6">
          <p className="ep-section-label">Knowledge health</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--ep-surface-subtle)] p-4"><p className="text-2xl font-extrabold text-[var(--ep-navy)]">{sourceCount}</p><p className="mt-1 text-xs font-semibold text-[var(--ep-text-muted)]">Sources</p></div>
            <div className="rounded-xl bg-[var(--ep-surface-subtle)] p-4"><p className="text-2xl font-extrabold text-[var(--ep-navy)]">{itemCount}</p><p className="mt-1 text-xs font-semibold text-[var(--ep-text-muted)]">Knowledge items</p></div>
          </div>
          <Link href="/knowledge" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--ep-blue)]">Open complete Knowledge Base <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <article className="ep-card p-5">
          <Sparkles className="h-5 w-5 text-[var(--ep-blue)]" />
          <h2 className="mt-4 font-extrabold text-[var(--ep-navy)]">Business & brand</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">{brand.companyName ? `${brand.companyName}${brand.industry ? ` · ${brand.industry}` : ''}` : 'Add your company, products, audience, voice, goals, proof and restrictions.'}</p>
          <Link href="/brand-dna" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--ep-blue)]">Review Brand DNA <ArrowRight className="h-4 w-4" /></Link>
        </article>

        <article className="ep-card p-5">
          <FileText className="h-5 w-5 text-[var(--ep-blue)]" />
          <h2 className="mt-4 font-extrabold text-[var(--ep-navy)]">Products & offers</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">{brand.products?.length ? `${brand.products.length} product/service entries are available to campaign planning.` : 'No products or services have been confirmed yet.'}</p>
          <Link href="/brand-dna" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--ep-blue)]">Edit business facts <ArrowRight className="h-4 w-4" /></Link>
        </article>

        <article className="ep-card p-5">
          <BookOpenCheck className="h-5 w-5 text-[var(--ep-blue)]" />
          <h2 className="mt-4 font-extrabold text-[var(--ep-navy)]">Grounded knowledge</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">Website pages, documents, feeds and manual facts stay organisation-scoped and can be searched by the marketing workflow.</p>
          <Link href="/knowledge" className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--ep-blue)]">Manage knowledge <ArrowRight className="h-4 w-4" /></Link>
        </article>
      </section>

      <section className="ep-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-[var(--ep-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="ep-section-label">Website learning</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Connected website sources</h2></div>
          <button type="button" onClick={() => void load()} className="ep-button-secondary px-3 py-2 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
        </div>
        {websiteSources.length === 0 ? (
          <div className="px-5 py-12 text-center"><Globe2 className="mx-auto h-8 w-8 text-[var(--ep-text-soft)]" /><p className="mt-3 text-sm font-semibold text-[var(--ep-text-muted)]">No website has been analysed yet.</p></div>
        ) : (
          <div className="divide-y divide-[var(--ep-border)]">
            {websiteSources.map((source) => (
              <div key={source.id} className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="truncate font-bold text-[var(--ep-navy)]">{source.name}</p><span className={`${statusTone(source.status)} rounded-full border px-2.5 py-0.5 text-[11px] font-bold`}>{source.status}</span></div>
                  <p className="mt-1 break-all text-xs text-[var(--ep-text-muted)]">{source.url || 'Website source'} · {Number(source.item_count || 0)} knowledge chunks</p>
                  {source.error_message && <p className="mt-2 text-xs font-semibold text-[var(--ep-danger)]">{source.error_message}</p>}
                </div>
                <button type="button" onClick={() => void syncSource(source.id)} disabled={busy === source.id} className="ep-button-secondary shrink-0 px-3 py-2 text-xs">
                  {busy === source.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Re-crawl / sync
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ep-status-success flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Business Brain stays editable.</p><p className="mt-1 text-xs leading-5">Website learning is not a disposable first-run wizard. Re-sync sources and correct Brand DNA whenever the business changes.</p></div></div>
        <Link href="/campaigns" className="shrink-0 text-sm font-extrabold text-[var(--ep-blue)]">Use this in campaigns →</Link>
      </section>
    </div>
  );
}
