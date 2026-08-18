'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  Loader2,
  Megaphone,
  Plug,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

type Row = Record<string, any>;
type BrandDNA = {
  companyName?: string;
  description?: string;
  products?: string[];
  voiceDescription?: string;
  demographics?: string;
  psychographics?: string;
  goals?: string[];
};

type Summary = {
  control: Row;
  wallet: Row;
  campaigns: Row[];
  connections: Row[];
  content: Row[];
  knowledge: Row;
  brand: BrandDNA;
  director: Row;
};

const emptySummary: Summary = {
  control: {}, wallet: {}, campaigns: [], connections: [], content: [], knowledge: {}, brand: {}, director: {},
};

function rows(payload: any): Row[] {
  const value = payload?.data;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : '—';
}

function statusWord(value: unknown, fallback: string) {
  const text = String(value || '').trim();
  return text ? text.replaceAll('_', ' ') : fallback;
}

export default function DashboardPage() {
  const { user, currentOrganization } = useAuthStore();
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    const orgId = currentOrganization?.id;
    if (!orgId) { setLoading(false); return; }
    let active = true;

    const run = async () => {
      setLoading(true);
      const results = await Promise.allSettled([
        api.get<ApiResponse<Row>>('/relaunch-control'),
        api.get<ApiResponse<Row>>('/generation-credits/wallet'),
        api.get<ApiResponse<Row[]>>('/campaigns', { params: { limit: '100' } }),
        api.get<ApiResponse<Row[]>>('/integrations/connections'),
        api.get<ApiResponse<Row[]>>('/content-studio', { params: { organization_id: orgId } }),
        api.get<ApiResponse<Row>>('/knowledge/stats'),
        api.get<ApiResponse<BrandDNA>>('/brand-dna'),
        api.get<ApiResponse<Row>>('/growth-director/status'),
      ]);
      if (!active) return;
      const value = (index: number) => results[index].status === 'fulfilled'
        ? (results[index] as PromiseFulfilledResult<any>).value
        : undefined;

      setSummary({
        control: value(0)?.data || {},
        wallet: value(1)?.data || {},
        campaigns: rows(value(2)),
        connections: rows(value(3)),
        content: rows(value(4)),
        knowledge: value(5)?.data || {},
        brand: value(6)?.data || {},
        director: value(7)?.data || {},
      });
      setPartial(results.some((result) => result.status === 'rejected'));
      setLoading(false);
    };

    void run();
    return () => { active = false; };
  }, [currentOrganization]);

  const metrics = useMemo(() => {
    const activeCampaigns = summary.campaigns.filter((item) => ['active', 'running', 'production'].includes(String(item.status))).length;
    const draftCampaigns = summary.campaigns.filter((item) => ['draft', 'planning'].includes(String(item.status))).length;
    const approvals = summary.content.filter((item) => item.status === 'review').length;
    const drafts = summary.content.filter((item) => item.status === 'draft').length;
    const approved = summary.content.filter((item) => item.status === 'approved').length;
    const scheduled = summary.content.filter((item) => item.status === 'scheduled' || item.scheduled_at).length;
    const connected = summary.connections.filter((item) => item.status === 'active' || item.health_status === 'healthy').length;
    const connectionAlerts = summary.connections.filter((item) => item.status === 'error' || item.health_status === 'unhealthy').length;

    const brandChecks = [
      Boolean(summary.brand.companyName),
      Boolean(summary.brand.description),
      Boolean(summary.brand.products?.length),
      Boolean(summary.brand.voiceDescription),
      Boolean(summary.brand.demographics || summary.brand.psychographics),
      Boolean(summary.brand.goals?.length),
      Number(summary.knowledge.item_count ?? summary.knowledge.items ?? 0) > 0,
    ];
    const brainPercent = Math.round((brandChecks.filter(Boolean).length / brandChecks.length) * 100);

    return { activeCampaigns, draftCampaigns, approvals, drafts, approved, scheduled, connected, connectionAlerts, brainPercent };
  }, [summary]);

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--ep-blue)]" /></div>;

  const paused = summary.control.emergency_stop === true;
  const mode = statusWord(summary.control.operating_mode, 'unavailable');
  const availableCredits = summary.wallet.available_credits ?? summary.wallet.balance;
  const directorState = statusWord(
    summary.director.status ?? summary.director.state ?? summary.director.phase ?? summary.director.current_phase,
    'Ready to coordinate'
  );

  const quickActions = [
    { href: '/business-brain', title: 'Analyse website', description: 'Build or refresh the Business Brain.', icon: BrainCircuit },
    { href: '/campaigns/new', title: 'Plan campaign', description: 'Start with strategy, audience and objectives.', icon: Megaphone },
    { href: '/content-studio/generate', title: 'Create content', description: 'Generate governed written marketing content.', icon: Sparkles },
    { href: '/creative-studio', title: 'Creative Studio', description: 'Build visual, video and long-form assets.', icon: Sparkles },
    { href: '/approvals', title: 'Review approvals', description: `${metrics.approvals} item${metrics.approvals === 1 ? '' : 's'} waiting for owner review.`, icon: FileCheck2 },
    { href: '/connections', title: 'Connect channel', description: 'Connect publishing and measurement services.', icon: Plug },
  ];

  return (
    <div className="space-y-6">
      <header className="ep-panel overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="ep-section-label">Command Centre</p>
            <h1 className="ep-page-title mt-2">{user?.name ? `Good to see you, ${user.name.split(' ')[0]}.` : 'Your marketing operation at a glance.'}</h1>
            <p className="ep-page-copy mt-3 max-w-2xl text-sm leading-6 sm:text-base">Understand the business, plan campaigns, coordinate production, approve customer-facing work, publish through governed channels and learn from results.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/campaigns/new" className="ep-button-secondary px-4 py-2.5 text-sm"><Megaphone className="h-4 w-4" /> New campaign</Link>
            <Link href="/business-brain" className="ep-button-primary px-4 py-2.5 text-sm"><BrainCircuit className="h-4 w-4" /> Business Brain</Link>
          </div>
        </div>
      </header>

      {partial && <div className="ep-status-warning flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />Some Command Centre information could not be refreshed. Existing work was not changed.</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/business-brain" className="ep-card group p-5"><div className="flex items-center justify-between"><span className="text-sm font-bold text-[var(--ep-text-muted)]">Business Brain</span><BrainCircuit className="h-5 w-5 text-[var(--ep-blue)]" /></div><p className="mt-4 text-3xl font-extrabold text-[var(--ep-navy)]">{metrics.brainPercent}%</p><p className="mt-1 text-xs text-[var(--ep-text-soft)]">Core business signals ready</p></Link>
        <Link href="/campaigns" className="ep-card group p-5"><div className="flex items-center justify-between"><span className="text-sm font-bold text-[var(--ep-text-muted)]">Campaigns</span><Megaphone className="h-5 w-5 text-[var(--ep-blue)]" /></div><p className="mt-4 text-3xl font-extrabold text-[var(--ep-navy)]">{metrics.activeCampaigns}</p><p className="mt-1 text-xs text-[var(--ep-text-soft)]">Active · {metrics.draftCampaigns} planning/draft</p></Link>
        <Link href="/approvals" className="ep-card group p-5"><div className="flex items-center justify-between"><span className="text-sm font-bold text-[var(--ep-text-muted)]">Owner approvals</span><FileCheck2 className="h-5 w-5 text-[var(--ep-blue)]" /></div><p className="mt-4 text-3xl font-extrabold text-[var(--ep-navy)]">{metrics.approvals}</p><p className="mt-1 text-xs text-[var(--ep-text-soft)]">Exact content versions waiting</p></Link>
        <Link href="/usage-safety" className="ep-card group p-5"><div className="flex items-center justify-between"><span className="text-sm font-bold text-[var(--ep-text-muted)]">Generation Credits</span><CircleDollarSign className="h-5 w-5 text-[var(--ep-blue)]" /></div><p className="mt-4 text-3xl font-extrabold text-[var(--ep-navy)]">{number(availableCredits)}</p><p className="mt-1 text-xs text-[var(--ep-text-soft)]">Available balance</p></Link>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
        <div className="ep-card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><p className="ep-section-label">Do next</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Continue the marketing workflow</h2></div><ArrowRight className="h-5 w-5 text-[var(--ep-text-soft)]" /></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {quickActions.map(({ href, title, description, icon: Icon }) => (
              <Link key={href} href={href} className="group rounded-xl border border-[var(--ep-border)] bg-[var(--ep-surface)] p-4 transition hover:border-[#9fb4c8] hover:bg-[var(--ep-blue-soft)]">
                <Icon className="h-4 w-4 text-[var(--ep-blue)]" /><p className="mt-3 font-extrabold text-[var(--ep-navy)]">{title}</p><p className="mt-1 text-xs leading-5 text-[var(--ep-text-muted)]">{description}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="ep-card p-5 sm:p-6">
          <p className="ep-section-label">Marketing Director</p>
          <div className="mt-4 flex items-start gap-3"><div className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><UsersRound className="h-5 w-5" /></div><div><h2 className="font-extrabold capitalize text-[var(--ep-navy)]">{directorState}</h2><p className="mt-1 text-sm leading-5 text-[var(--ep-text-muted)]">Coordinates the existing specialist workforce around business context, campaigns and owner decisions.</p></div></div>
          <Link href="/marketing-team" className="mt-5 inline-flex items-center gap-1.5 text-sm font-extrabold text-[var(--ep-blue)]">Open Marketing Team <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="ep-card p-5">
          <div className="flex items-center justify-between"><p className="ep-section-label">Production</p><CalendarRange className="h-4 w-4 text-[var(--ep-blue)]" /></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-3"><p className="text-xl font-extrabold text-[var(--ep-navy)]">{metrics.drafts}</p><p className="mt-1 text-[10px] font-bold text-[var(--ep-text-muted)]">Draft</p></div><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-3"><p className="text-xl font-extrabold text-[var(--ep-navy)]">{metrics.approved}</p><p className="mt-1 text-[10px] font-bold text-[var(--ep-text-muted)]">Approved</p></div><div className="rounded-xl bg-[var(--ep-surface-subtle)] p-3"><p className="text-xl font-extrabold text-[var(--ep-navy)]">{metrics.scheduled}</p><p className="mt-1 text-[10px] font-bold text-[var(--ep-text-muted)]">Scheduled</p></div></div>
          <Link href="/content-studio" className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--ep-blue)]">Open Content Studio <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>

        <div className="ep-card p-5">
          <div className="flex items-center justify-between"><p className="ep-section-label">Channels</p><Send className="h-4 w-4 text-[var(--ep-blue)]" /></div>
          <p className="mt-4 text-2xl font-extrabold text-[var(--ep-navy)]">{metrics.connected} connected</p>
          <p className="mt-1 text-sm text-[var(--ep-text-muted)]">{metrics.connectionAlerts ? `${metrics.connectionAlerts} connection${metrics.connectionAlerts === 1 ? '' : 's'} need attention.` : 'No connection health alerts in the current data.'}</p>
          <Link href="/connections" className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--ep-blue)]">Manage connections <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>

        <div className="ep-card p-5">
          <div className="flex items-center justify-between"><p className="ep-section-label">Control Centre</p><ShieldCheck className="h-4 w-4 text-[var(--ep-blue)]" /></div>
          <p className="mt-4 text-2xl font-extrabold capitalize text-[var(--ep-navy)]">{paused ? 'Paused' : mode}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--ep-text-muted)]">{paused ? 'External generation and execution are blocked by Emergency Stop.' : `Operating mode is ${mode}; fresh policy decisions still apply.`}</p>
          <Link href="/usage-safety" className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--ep-blue)]">Review usage & safety <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </section>

      <section className="ep-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="ep-section-label">Measure & improve</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Performance should feed the next decision.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">Use analytics, conversions and bounded recommendations to understand what worked. The system should not silently change an approved offer or bypass owner/policy controls.</p></div><Link href="/analytics" className="ep-button-secondary shrink-0 px-4 py-2.5 text-sm"><BarChart3 className="h-4 w-4" /> Analytics & optimisation</Link></div>
      </section>
    </div>
  );
}
