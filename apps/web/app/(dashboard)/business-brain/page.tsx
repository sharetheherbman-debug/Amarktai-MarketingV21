'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Coins,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

type Lifecycle = 'live' | 'coming_soon' | 'paused' | 'retired' | 'internal' | 'unknown';

type ProductProfile = {
  scope_key?: string;
  name?: string;
  lifecycle_status?: Lifecycle;
  description?: string | null;
  audiences?: string[];
  features?: string[];
  benefits?: string[];
  differentiators?: string[];
  pricing_facts?: string[];
  ctas?: string[];
  urls?: string[];
  sources?: string[];
};

type CompanyProfile = {
  company?: {
    name?: string | null;
    description?: string | null;
    industry?: string | null;
    mission?: string | null;
    positioning?: string | null;
    value_proposition?: string | null;
    geography?: string[];
    differentiators?: string[];
    brand_voice?: string | null;
    preferred_terms?: string[];
    prohibited_terms?: string[];
    sources?: string[];
    confidence?: number;
  };
  audiences?: Array<{ name?: string; needs?: string[]; pain_points?: string[]; use_cases?: string[]; geography?: string[]; sources?: string[] }>;
  products?: ProductProfile[];
  proof?: Array<{ type?: string; claim?: string; sources?: string[] }>;
  faq?: Array<{ question?: string; answer?: string; sources?: string[] }>;
  content_themes?: string[];
  marketing_constraints?: Array<{ rule?: string; reason?: string; product_scopes?: string[]; sources?: string[] }>;
  conflicts?: Array<{ topic?: string; details?: string; sources?: string[] }>;
  questions?: string[];
};

type WebEstateSite = {
  url: string;
  name?: string;
  relationship?: 'primary' | 'product' | 'service' | 'landing' | 'other';
  productScopes?: string[];
  lifecycleStatus?: Lifecycle;
  approved?: boolean;
  primary?: boolean;
};

type BrainState = {
  step?: number;
  completed?: boolean;
  company?: { name?: string; description?: string; market?: string; primaryWebsite?: string };
  webEstate?: WebEstateSite[];
  products?: Array<{ scopeKey: string; name: string; lifecycleStatus: Lifecycle; description?: string }>;
  goals?: string[];
  channels?: string[];
  audience?: string;
  brandNotes?: string;
  assetPreferences?: string;
  analysis?: Record<string, unknown>;
};

type WebsiteStatus = {
  id: string;
  name: string;
  url: string | null;
  status: string;
  error_message?: string | null;
  item_count?: number;
  last_synced_at?: string | null;
  config?: Record<string, unknown>;
};

type BrainResponse = {
  state: BrainState;
  profile: CompanyProfile;
  profile_status: 'approved' | 'needs_review' | 'not_analysed';
  websites: WebsiteStatus[];
};

type Discovery = {
  primary: string;
  candidates: Array<{ url: string; hostname: string; occurrences: number; relationship: 'subdomain' | 'linked_domain' }>;
  crawl: { pagesVisited: number; pagesAccepted: number; issues: number; sitemapUrls: number; bytesFetched: number };
};

type AnalysisEstimate = {
  provider: string;
  model: string;
  pages: number;
  sources: number;
  maximum_reserved_credits: number;
  maximum_output_tokens: number;
  requires_explicit_action: boolean;
  note: string;
};

const STEPS = [
  'Business', 'Web estate', 'Website learning', 'AI review', 'What we learned', 'Products',
  'Brand', 'Audience', 'Channels', 'Assets', 'Strategy', 'First campaign',
];

const LIFECYCLES: Array<{ value: Lifecycle; label: string }> = [
  { value: 'live', label: 'Live' },
  { value: 'coming_soon', label: 'Coming soon' },
  { value: 'paused', label: 'Paused' },
  { value: 'retired', label: 'Retired' },
  { value: 'internal', label: 'Internal / do not market' },
  { value: 'unknown', label: 'Needs confirmation' },
];

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (['active', 'completed', 'ready'].includes(normalized)) return 'ep-status-success';
  if (['error', 'failed'].includes(normalized)) return 'ep-status-danger';
  return 'ep-status-warning';
}

function commaList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export default function BusinessBrainPage() {
  const [brain, setBrain] = useState<BrainResponse | null>(null);
  const [state, setState] = useState<BrainState>({ step: 1 });
  const [profile, setProfile] = useState<CompanyProfile>({});
  const [sites, setSites] = useState<WebEstateSite[]>([]);
  const [estimate, setEstimate] = useState<AnalysisEstimate | null>(null);
  const [busy, setBusy] = useState<string | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy((value) => value || 'load');
    setError(null);
    try {
      const result = await api.get<ApiResponse<BrainResponse>>('/knowledge/business-brain');
      setBrain(result.data);
      setState(result.data.state || { step: 1 });
      setProfile(result.data.profile || {});
      setSites(result.data.state?.webEstate || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Business Brain could not be loaded.');
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const step = Math.max(1, Math.min(Number(state.step || 1), 12));
  const company = state.company || {};
  const products = profile.products || [];
  const websiteReady = (brain?.websites || []).some((source) => ['active', 'completed'].includes(String(source.status).toLowerCase()));
  const readySignals = useMemo(() => [
    Boolean(company.name || profile.company?.name),
    sites.some((site) => site.approved !== false),
    websiteReady,
    brain?.profile_status !== 'not_analysed',
    brain?.profile_status === 'approved',
    products.length > 0,
  ], [brain?.profile_status, company.name, products.length, sites, websiteReady]);
  const readiness = Math.round((readySignals.filter(Boolean).length / readySignals.length) * 100);

  const saveState = async (patch: Partial<BrainState>, message = 'Progress saved.') => {
    setBusy('save');
    setError(null);
    try {
      const next = { ...state, ...patch };
      const result = await api.put<ApiResponse<BrainState>>('/knowledge/business-brain/state', { body: { state: next } });
      setState(result.data);
      setNotice(message);
      return result.data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Progress could not be saved.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const changeStep = async (next: number) => {
    setNotice(null);
    await saveState({ step: Math.max(1, Math.min(next, 12)) }, 'Progress saved.');
  };

  const discover = async () => {
    const url = String(company.primaryWebsite || '').trim();
    if (!url) return;
    setBusy('discover');
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<ApiResponse<Discovery>>('/knowledge/business-brain/discover', { body: { url } });
      const rootHost = new URL(result.data.primary).hostname;
      const discovered: WebEstateSite[] = [
        { url: result.data.primary, name: company.name || rootHost, relationship: 'primary', productScopes: [], lifecycleStatus: 'live', approved: true, primary: true },
        ...result.data.candidates.map((candidate) => ({
          url: candidate.url,
          name: candidate.hostname,
          relationship: candidate.relationship === 'subdomain' ? 'product' as const : 'other' as const,
          productScopes: [],
          lifecycleStatus: 'unknown' as Lifecycle,
          approved: false,
          primary: false,
        })),
      ];
      setSites(discovered);
      await saveState({ webEstate: discovered, step: 2 }, `Website discovery complete: ${result.data.crawl.pagesAccepted} page(s) inspected. Confirm the sites we may learn from.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Related websites could not be discovered.');
    } finally {
      setBusy(null);
    }
  };

  const updateSite = (index: number, patch: Partial<WebEstateSite>) => {
    setSites((current) => current.map((site, itemIndex) => itemIndex === index ? { ...site, ...patch } : site));
  };

  const saveAndCrawl = async () => {
    const approved = sites.filter((site) => site.approved !== false);
    if (approved.length === 0) { setError('Approve at least one public website first.'); return; }
    setBusy('crawl');
    setError(null);
    setNotice(null);
    try {
      const derivedProducts = approved.flatMap((site) => (site.productScopes || []).map((scope) => ({
        scopeKey: slug(scope),
        name: site.name || scope,
        lifecycleStatus: site.lifecycleStatus || 'unknown' as Lifecycle,
      }))).filter((product) => product.scopeKey);
      await api.put('/knowledge/business-brain/state', { body: { state: { ...state, webEstate: approved, products: derivedProducts, step: 3 } } });
      const result = await api.post<ApiResponse<{ sync: Array<{ success: boolean; error?: string }> }>>('/knowledge/business-brain/web-estate', {
        body: { sites: approved, sync_now: true },
      });
      const failures = result.data.sync.filter((item) => !item.success);
      setNotice(failures.length ? `${approved.length - failures.length} website(s) learned successfully; ${failures.length} need attention.` : `${approved.length} approved website(s) learned successfully.`);
      await load();
      setState((current) => ({ ...current, step: 4 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Website learning failed. Existing knowledge was left intact.');
    } finally {
      setBusy(null);
    }
  };

  const getEstimate = async () => {
    setBusy('estimate');
    setError(null);
    try {
      const result = await api.get<ApiResponse<AnalysisEstimate>>('/knowledge/business-brain/analysis-estimate');
      setEstimate(result.data);
      setNotice('The crawl is complete. GenX analysis remains a separate, explicit credit action.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The GenX analysis estimate could not be prepared.');
    } finally {
      setBusy(null);
    }
  };

  const analyse = async () => {
    setBusy('analyse');
    setError(null);
    setNotice(null);
    try {
      const result = await api.post<ApiResponse<{ profile: CompanyProfile; reused: boolean }>>('/knowledge/business-brain/analyse', {
        headers: { 'X-Idempotency-Key': `company-review-${Date.now()}` }, body: {},
      });
      setProfile(result.data.profile || {});
      setNotice(result.data.reused ? 'Nothing changed, so the existing Company Profile was reused without another GenX analysis.' : 'GenX Company Review is ready. Confirm or correct the facts before Marketing treats them as approved.');
      await load();
      setState((current) => ({ ...current, step: 5 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'GenX Company Review failed. No Company Brain changes were saved.');
    } finally {
      setBusy(null);
    }
  };

  const approveProfile = async () => {
    setBusy('approve');
    setError(null);
    try {
      await api.post('/knowledge/business-brain/approve', { body: { profile } });
      setNotice('Company knowledge approved. These corrections now outrank website inference.');
      await load();
      setState((current) => ({ ...current, step: 6 }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Company Profile could not be approved.');
    } finally {
      setBusy(null);
    }
  };

  const updateCompanyProfile = (patch: Partial<NonNullable<CompanyProfile['company']>>) => {
    setProfile((current) => ({ ...current, company: { ...(current.company || {}), ...patch } }));
  };

  const updateProduct = (index: number, patch: Partial<ProductProfile>) => {
    setProfile((current) => ({ ...current, products: (current.products || []).map((product, productIndex) => productIndex === index ? { ...product, ...patch } : product) }));
  };

  if (busy === 'load' && !brain) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--ep-blue)]" /></div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <header className="ep-panel overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="ep-section-label flex items-center gap-2"><BrainCircuit className="h-4 w-4" /> Company Brain</div>
            <h1 className="ep-page-title mt-2">Teach Marketing your whole business — once.</h1>
            <p className="ep-page-copy mt-3 max-w-2xl text-sm leading-6 sm:text-base">
              Connect every approved company, product and service site, let the secure crawler collect first-party facts, then optionally use GenX credits to turn those facts into a source-grounded marketing profile.
            </p>
          </div>
          <div className="min-w-[230px] rounded-2xl border border-[var(--ep-border)] bg-[var(--ep-blue-soft)] p-4">
            <div className="flex items-center justify-between"><span className="text-sm font-bold text-[var(--ep-text-muted)]">Company Brain readiness</span><span className="text-xl font-extrabold text-[var(--ep-navy)]">{readiness}%</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[var(--ep-blue)]" style={{ width: `${readiness}%` }} /></div>
            <p className="mt-2 text-xs text-[var(--ep-text-muted)]">{brain?.profile_status === 'approved' ? 'Approved knowledge is ready for campaigns.' : 'Complete the important steps; optional details can be refined later.'}</p>
          </div>
        </div>
      </header>

      <div className="ep-card overflow-hidden">
        <div className="overflow-x-auto px-4 py-4">
          <div className="flex min-w-max gap-2">
            {STEPS.map((label, index) => {
              const number = index + 1;
              const active = number === step;
              const complete = number < step;
              return <button key={label} type="button" onClick={() => void changeStep(number)} className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold ${active ? 'border-[var(--ep-blue)] bg-[var(--ep-blue-soft)] text-[var(--ep-blue)]' : 'border-[var(--ep-border)] bg-white text-[var(--ep-text-muted)]'}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full ${complete ? 'bg-[var(--ep-blue)] text-white' : 'bg-[var(--ep-surface-subtle)]'}`}>{complete ? <Check className="h-3 w-3" /> : number}</span>{label}
              </button>;
            })}
          </div>
        </div>
      </div>

      {error && <div className="ep-status-danger flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      {notice && <div className="ep-status-success flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span></div>}

      {step === 1 && <section className="ep-card p-5 sm:p-7">
        <p className="ep-section-label">Step 1 · Welcome</p><h2 className="mt-2 text-xl font-extrabold text-[var(--ep-navy)]">Tell us where to start.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ep-text-muted)]">We use this only to orient the Company Brain. The crawler will not automatically roam onto unrelated domains.</p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-[var(--ep-navy)]">Business name<input className="ep-input mt-2 w-full px-3 py-2.5 font-normal" value={company.name || ''} onChange={(event) => setState((current) => ({ ...current, company: { ...(current.company || {}), name: event.target.value } }))} /></label>
          <label className="text-sm font-bold text-[var(--ep-navy)]">Primary website<input type="url" className="ep-input mt-2 w-full px-3 py-2.5 font-normal" placeholder="https://yourbusiness.com" value={company.primaryWebsite || ''} onChange={(event) => setState((current) => ({ ...current, company: { ...(current.company || {}), primaryWebsite: event.target.value } }))} /></label>
          <label className="text-sm font-bold text-[var(--ep-navy)] md:col-span-2">In your own words<textarea className="ep-input mt-2 min-h-28 w-full px-3 py-2.5 font-normal" placeholder="What does your business do?" value={company.description || ''} onChange={(event) => setState((current) => ({ ...current, company: { ...(current.company || {}), description: event.target.value } }))} /></label>
          <label className="text-sm font-bold text-[var(--ep-navy)]">Country / market<input className="ep-input mt-2 w-full px-3 py-2.5 font-normal" value={company.market || ''} onChange={(event) => setState((current) => ({ ...current, company: { ...(current.company || {}), market: event.target.value } }))} /></label>
        </div>
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={!company.primaryWebsite || busy !== null} onClick={() => void (async () => { await saveState({ company, step: 2 }, 'Business details saved.'); await discover(); })()} className="ep-button-primary px-5 py-2.5"><Search className="h-4 w-4" /> Find my company websites</button><button type="button" onClick={() => void saveState({ company })} className="ep-button-secondary px-4 py-2.5">Save & continue later</button></div>
      </section>}

      {step === 2 && <section className="ep-card p-5 sm:p-7">
        <p className="ep-section-label">Step 2 · Company web estate</p><h2 className="mt-2 text-xl font-extrabold text-[var(--ep-navy)]">Confirm what belongs to your business.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">Discovered domains are suggestions only. Marketing will crawl only the sites you explicitly approve below.</p>
        {sites.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[var(--ep-border)] p-8 text-center"><Globe2 className="mx-auto h-7 w-7 text-[var(--ep-text-soft)]" /><p className="mt-3 text-sm text-[var(--ep-text-muted)]">No sites discovered yet.</p><button type="button" className="ep-button-primary mt-4 px-4 py-2" onClick={() => void changeStep(1)}>Add primary website</button></div> : <div className="mt-6 space-y-3">
          {sites.map((site, index) => <article key={`${site.url}-${index}`} className={`rounded-2xl border p-4 ${site.approved !== false ? 'border-[var(--ep-blue)] bg-[var(--ep-blue-soft)]/30' : 'border-[var(--ep-border)] bg-white'}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
              <label className="flex min-w-0 flex-1 items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4" checked={site.approved !== false} disabled={site.primary} onChange={(event) => updateSite(index, { approved: event.target.checked })} /><span className="min-w-0"><span className="block font-extrabold text-[var(--ep-navy)]">{site.primary ? 'Primary website' : site.name || 'Related website'}</span><span className="mt-1 block break-all text-xs text-[var(--ep-text-muted)]">{site.url}</span></span></label>
              {site.approved !== false && <div className="grid flex-[1.4] gap-3 sm:grid-cols-3">
                <input className="ep-input px-3 py-2 text-sm" value={site.name || ''} placeholder="Product / site name" onChange={(event) => updateSite(index, { name: event.target.value })} />
                <input className="ep-input px-3 py-2 text-sm" value={(site.productScopes || []).join(', ')} placeholder="Scope e.g. academy" onChange={(event) => updateSite(index, { productScopes: commaList(event.target.value).map(slug) })} />
                <select className="ep-input px-3 py-2 text-sm" value={site.lifecycleStatus || 'unknown'} onChange={(event) => updateSite(index, { lifecycleStatus: event.target.value as Lifecycle })}>{LIFECYCLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              </div>}
            </div>
          </article>)}
        </div>}
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={busy !== null || sites.filter((site) => site.approved !== false).length === 0} onClick={() => void saveAndCrawl()} className="ep-button-primary px-5 py-2.5">{busy === 'crawl' ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />} Approve & learn from these sites</button><button type="button" onClick={() => void saveState({ webEstate: sites })} className="ep-button-secondary px-4 py-2.5">Save choices</button></div>
      </section>}

      {step === 3 && <section className="ep-card p-5 sm:p-7">
        <p className="ep-section-label">Step 3 · Website learning</p><h2 className="mt-2 text-xl font-extrabold text-[var(--ep-navy)]">Your first-party knowledge sources.</h2>
        <div className="mt-5 space-y-3">{(brain?.websites || []).map((source) => <div key={source.id} className="flex flex-col gap-3 rounded-xl border border-[var(--ep-border)] p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold text-[var(--ep-navy)]">{source.name}</p><span className={`${statusClass(source.status)} rounded-full border px-2 py-0.5 text-[11px] font-bold`}>{source.status}</span></div><p className="mt-1 break-all text-xs text-[var(--ep-text-muted)]">{source.url} · {Number(source.item_count || 0)} knowledge chunks</p>{source.error_message && <p className="mt-2 text-xs font-bold text-[var(--ep-danger)]">{source.error_message}</p>}</div><button type="button" className="ep-button-secondary px-3 py-2 text-xs" disabled={busy !== null} onClick={async () => { setBusy(`sync-${source.id}`); try { await api.post(`/knowledge/${source.id}/sync`, { body: {} }); await load(); } finally { setBusy(null); } }}><RefreshCw className={`h-3.5 w-3.5 ${busy === `sync-${source.id}` ? 'animate-spin' : ''}`} /> Re-crawl</button></div>)}</div>
        <div className="mt-6 rounded-2xl bg-[var(--ep-surface-subtle)] p-4 text-sm leading-6 text-[var(--ep-text-muted)]"><strong className="text-[var(--ep-navy)]">Re-crawl and AI review are separate.</strong> A normal crawl checks public pages and change hashes. Unchanged pages are reused rather than rebuilt, and GenX is not invoked merely because a scheduled crawl ran.</div>
        <button type="button" disabled={!websiteReady} onClick={() => void changeStep(4)} className="ep-button-primary mt-5 px-5 py-2.5">Continue to AI Company Review <ChevronRight className="h-4 w-4" /></button>
      </section>}

      {step === 4 && <section className="ep-card p-5 sm:p-7">
        <p className="ep-section-label">Step 4 · AI Company Review</p><h2 className="mt-2 text-xl font-extrabold text-[var(--ep-navy)]">Turn crawled facts into understandable marketing knowledge.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">This is optional and explicit because it uses GenX generation credits. The system sends a bounded, deduplicated evidence set—not every page blindly—and reuses the existing analysis when the source fingerprint has not changed.</p>
        {!estimate ? <button type="button" className="ep-button-secondary mt-6 px-5 py-2.5" disabled={busy !== null} onClick={() => void getEstimate()}>{busy === 'estimate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />} Show GenX credit estimate</button> : <div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-4"><p className="text-xl font-extrabold text-[var(--ep-navy)]">{estimate.sources}</p><p className="text-xs text-[var(--ep-text-muted)]">Approved sites</p></div><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-4"><p className="text-xl font-extrabold text-[var(--ep-navy)]">{estimate.pages}</p><p className="text-xs text-[var(--ep-text-muted)]">Evidence pages</p></div><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-4"><p className="text-xl font-extrabold text-[var(--ep-navy)]">≤ {estimate.maximum_reserved_credits}</p><p className="text-xs text-[var(--ep-text-muted)]">Maximum reserved credits</p></div><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-4"><p className="text-xl font-extrabold text-[var(--ep-navy)]">GenX</p><p className="text-xs text-[var(--ep-text-muted)]">Only remote AI provider</p></div></div>}
        {estimate && <button type="button" className="ep-button-primary mt-5 px-5 py-2.5" disabled={busy !== null} onClick={() => void analyse()}>{busy === 'analyse' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Analyse with GenX</button>}
      </section>}

      {step === 5 && <section className="space-y-5">
        <div className="ep-card p-5 sm:p-7"><p className="ep-section-label">Step 5 · What we learned</p><h2 className="mt-2 text-xl font-extrabold text-[var(--ep-navy)]">Confirm the facts before Marketing relies on them.</h2><p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">Edit anything that is wrong. Your approved corrections become owner knowledge and outrank later website inference.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold text-[var(--ep-navy)]">Company name<input className="ep-input mt-2 w-full px-3 py-2.5 font-normal" value={profile.company?.name || ''} onChange={(event) => updateCompanyProfile({ name: event.target.value })} /></label><label className="text-sm font-bold text-[var(--ep-navy)]">Industry<input className="ep-input mt-2 w-full px-3 py-2.5 font-normal" value={profile.company?.industry || ''} onChange={(event) => updateCompanyProfile({ industry: event.target.value })} /></label><label className="text-sm font-bold text-[var(--ep-navy)] md:col-span-2">Company description<textarea className="ep-input mt-2 min-h-28 w-full px-3 py-2.5 font-normal" value={profile.company?.description || ''} onChange={(event) => updateCompanyProfile({ description: event.target.value })} /></label></div>
          {(profile.conflicts?.length || profile.questions?.length) ? <div className="ep-status-warning mt-5 rounded-xl border p-4"><p className="font-extrabold">Needs your confirmation</p>{profile.conflicts?.map((item, index) => <p key={`conflict-${index}`} className="mt-2 text-sm">{item.topic}: {item.details}</p>)}{profile.questions?.map((question, index) => <p key={`question-${index}`} className="mt-2 text-sm">• {question}</p>)}</div> : null}
          <button type="button" className="ep-button-primary mt-6 px-5 py-2.5" disabled={busy !== null} onClick={() => void approveProfile()}>{busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve Company Profile</button>
        </div>
      </section>}

      {step === 6 && <section className="ep-card p-5 sm:p-7">
        <p className="ep-section-label">Step 6 · Products & services</p><h2 className="mt-2 text-xl font-extrabold text-[var(--ep-navy)]">Keep each offering distinct.</h2><p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">Lifecycle status travels into campaign context and quality checks. A coming-soon product can build awareness, but it cannot pass “buy now” or “available now” content.</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">{products.map((product, index) => <article key={`${product.scope_key}-${index}`} className="rounded-2xl border border-[var(--ep-border)] p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-[var(--ep-text-muted)]">Product / service<input className="ep-input mt-1.5 w-full px-3 py-2 text-sm font-normal" value={product.name || ''} onChange={(event) => updateProduct(index, { name: event.target.value })} /></label><label className="text-xs font-bold text-[var(--ep-text-muted)]">Lifecycle<select className="ep-input mt-1.5 w-full px-3 py-2 text-sm font-normal" value={product.lifecycle_status || 'unknown'} onChange={(event) => updateProduct(index, { lifecycle_status: event.target.value as Lifecycle })}>{LIFECYCLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div><label className="mt-3 block text-xs font-bold text-[var(--ep-text-muted)]">Description<textarea className="ep-input mt-1.5 min-h-20 w-full px-3 py-2 text-sm font-normal" value={product.description || ''} onChange={(event) => updateProduct(index, { description: event.target.value })} /></label><p className="mt-3 text-xs text-[var(--ep-text-soft)]">Scope: {product.scope_key || 'company-wide'} · {product.sources?.length || 0} source reference(s)</p></article>)}</div>
        <div className="mt-6 flex gap-3"><button type="button" className="ep-button-primary px-5 py-2.5" onClick={() => void approveProfile()}>Save product knowledge</button><button type="button" className="ep-button-secondary px-4 py-2.5" onClick={() => void changeStep(7)}>Continue</button></div>
      </section>}

      {step >= 7 && step <= 10 && <section className="ep-card p-5 sm:p-7">
        <p className="ep-section-label">Step {step} · {STEPS[step - 1]}</p><h2 className="mt-2 text-xl font-extrabold text-[var(--ep-navy)]">Add useful direction without repeating what we already learned.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">These details are editable at any time. Leave optional fields blank when the Company Brain already has the answer.</p>
        {step === 7 && <label className="mt-6 block text-sm font-bold text-[var(--ep-navy)]">Brand notes, tone or restrictions<textarea className="ep-input mt-2 min-h-32 w-full px-3 py-2.5 font-normal" value={state.brandNotes || ''} onChange={(event) => setState((current) => ({ ...current, brandNotes: event.target.value }))} /></label>}
        {step === 8 && <label className="mt-6 block text-sm font-bold text-[var(--ep-navy)]">Priority audience or market<textarea className="ep-input mt-2 min-h-32 w-full px-3 py-2.5 font-normal" value={state.audience || ''} onChange={(event) => setState((current) => ({ ...current, audience: event.target.value }))} /></label>}
        {step === 9 && <label className="mt-6 block text-sm font-bold text-[var(--ep-navy)]">Organic channels you want to use<input className="ep-input mt-2 w-full px-3 py-2.5 font-normal" placeholder="Facebook, Instagram, LinkedIn…" value={(state.channels || []).join(', ')} onChange={(event) => setState((current) => ({ ...current, channels: commaList(event.target.value) }))} /></label>}
        {step === 10 && <label className="mt-6 block text-sm font-bold text-[var(--ep-navy)]">Asset preferences<textarea className="ep-input mt-2 min-h-32 w-full px-3 py-2.5 font-normal" placeholder="Use our library first, preferred image style, video preferences…" value={state.assetPreferences || ''} onChange={(event) => setState((current) => ({ ...current, assetPreferences: event.target.value }))} /></label>}
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" className="ep-button-primary px-5 py-2.5" onClick={() => void saveState({ ...state, step: step + 1 }, 'Saved. You can edit this later from Company Brain.')}>Save & continue <ChevronRight className="h-4 w-4" /></button><button type="button" className="ep-button-secondary px-4 py-2.5" onClick={() => void changeStep(step + 1)}>Skip optional step</button></div>
      </section>}

      {step === 11 && <section className="ep-card p-5 sm:p-7"><p className="ep-section-label">Step 11 · Initial strategy</p><h2 className="mt-2 text-xl font-extrabold text-[var(--ep-navy)]">Your Campaign Planner now has the full Company Brain.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">Campaigns use approved owner facts first, current structured knowledge next, and website inference only where it is not contradicted. Product scopes and lifecycle remain attached so campaigns can intentionally cover one offering or several without mixing their facts.</p><div className="mt-6 grid gap-3 md:grid-cols-3"><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-4"><p className="font-extrabold text-[var(--ep-navy)]">{products.length}</p><p className="text-xs text-[var(--ep-text-muted)]">Products / services understood</p></div><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-4"><p className="font-extrabold text-[var(--ep-navy)]">{brain?.websites?.length || 0}</p><p className="text-xs text-[var(--ep-text-muted)]">Website sources</p></div><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-4"><p className="font-extrabold text-[var(--ep-navy)]">{brain?.profile_status === 'approved' ? 'Approved' : 'Review needed'}</p><p className="text-xs text-[var(--ep-text-muted)]">Company knowledge status</p></div></div><button type="button" className="ep-button-primary mt-6 px-5 py-2.5" onClick={() => void changeStep(12)}>Create the first campaign <ArrowRight className="h-4 w-4" /></button></section>}

      {step === 12 && <section className="ep-card p-5 sm:p-7"><p className="ep-section-label">Step 12 · First campaign</p><h2 className="mt-2 text-xl font-extrabold text-[var(--ep-navy)]">Company Brain is ready to work.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">Open Campaigns, choose the product/service scopes and objective, then generate the first strategy and content batch as a draft. Nothing is published merely because onboarding is complete; the existing exact-version approval and autonomy controls still apply.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/campaigns?from=business-brain" className="ep-button-primary px-5 py-2.5"><Sparkles className="h-4 w-4" /> Build first campaign</Link><button type="button" className="ep-button-secondary px-4 py-2.5" onClick={() => void saveState({ completed: true, step: 12 }, 'Business onboarding complete. Company Brain remains editable.')}>Mark onboarding complete</button></div></section>}

      <footer className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" disabled={step <= 1} onClick={() => void changeStep(step - 1)} className="ep-button-secondary w-fit px-4 py-2 text-sm"><ChevronLeft className="h-4 w-4" /> Previous</button><div className="flex gap-4 text-sm font-bold"><Link href="/knowledge" className="text-[var(--ep-blue)]">Knowledge Base</Link><Link href="/brand-dna" className="text-[var(--ep-blue)]">Brand DNA</Link><Link href="/campaigns" className="text-[var(--ep-blue)]">Campaigns</Link></div></footer>
    </div>
  );
}
