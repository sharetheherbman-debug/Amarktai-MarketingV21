'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Coins,
  FileText,
  Loader2,
  Megaphone,
  Plug,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/api') return '/api/v1';
  return trimmed;
}

const API_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

type RecordValue = Record<string, unknown>;
type Summary = {
  control?: RecordValue;
  wallet?: RecordValue;
  campaigns: RecordValue[];
  connections: RecordValue[];
  content: RecordValue[];
};

function rows(payload: any): RecordValue[] {
  const value = payload?.data;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function automationLabel(control: RecordValue): string {
  if (control.emergency_stop === true) return 'Paused for safety';
  switch (control.operating_mode) {
    case 'autonomous': return 'Active within limits';
    case 'approval': return 'Approval required';
    case 'manual': return 'Manual';
    default: return 'Status unavailable';
  }
}

export default function DashboardPage() {
  const { user, token, currentOrganization } = useAuthStore();
  const [summary, setSummary] = useState<Summary>({ campaigns: [], connections: [], content: [] });
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    if (!token || !currentOrganization) {
      setLoading(false);
      return;
    }
    let active = true;
    const headers = { Authorization: `Bearer ${token}`, 'x-organization-id': currentOrganization.id };
    const get = async (path: string) => {
      const response = await fetch(`${API_URL}${path}`, { credentials: 'include', headers });
      if (!response.ok) throw new Error('Dashboard information is temporarily unavailable.');
      return response.json();
    };

    void Promise.allSettled([
      get('/relaunch-control'),
      get('/generation-credits/wallet'),
      get('/campaigns?limit=100'),
      get('/integrations/connections'),
      get('/content-studio?limit=100'),
    ]).then((results) => {
      if (!active) return;
      const value = (index: number) => results[index].status === 'fulfilled'
        ? (results[index] as PromiseFulfilledResult<any>).value
        : undefined;
      setSummary({
        control: value(0)?.data,
        wallet: value(1)?.data,
        campaigns: rows(value(2)),
        connections: rows(value(3)),
        content: rows(value(4)),
      });
      setPartial(results.some((item) => item.status === 'rejected'));
      setLoading(false);
    });
    return () => { active = false; };
  }, [token, currentOrganization]);

  const metrics = useMemo(() => {
    const activeCampaigns = summary.campaigns.filter((item) => item.status === 'active').length;
    const draftCampaigns = summary.campaigns.filter((item) => item.status === 'draft').length;
    const drafts = summary.content.filter((item) => item.status === 'draft').length;
    const review = summary.content.filter((item) => item.status === 'review').length;
    const approved = summary.content.filter((item) => item.status === 'approved').length;
    const connected = summary.connections.filter((item) => item.status === 'active' || item.health_status === 'healthy').length;
    const attention = summary.connections.filter((item) => item.health_status === 'unhealthy' || item.status === 'error').length;
    return { activeCampaigns, draftCampaigns, drafts, review, approved, connected, attention };
  }, [summary]);

  if (loading) {
    return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;
  }

  const control = summary.control || {};
  const wallet = summary.wallet || {};
  const automation = automationLabel(control);
  const stopped = control.emergency_stop === true;

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand-600">Overview</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-[#1a2e3e]">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-2 text-sm text-[#5f6f7a]">Your campaigns, content and connections in one clear view.</p>
        </div>
        <Link href="/creative-studio" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600">
          <Sparkles className="h-4 w-4" /> Create content
        </Link>
      </header>

      {partial && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Some dashboard details could not be refreshed. Your existing work is unaffected; try again shortly.
        </div>
      )}

      <section className={`rounded-2xl border p-5 shadow-sm ${stopped ? 'border-amber-300 bg-amber-50' : 'border-[#d9e6ee] bg-[#eef6fb]'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-xl p-2.5 ${stopped ? 'bg-amber-100 text-amber-700' : 'bg-white text-brand-600'}`}>
              {stopped ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#5f6f7a]">Automation & safety</p>
              <h2 className="mt-1 text-lg font-semibold text-[#1a2e3e]">{automation}</h2>
              <p className="mt-1 text-sm text-[#5f6f7a]">
                {stopped ? 'Automated execution is safely paused. You can still review drafts and plan work.' : 'Your approval and spending limits remain in force.'}
              </p>
            </div>
          </div>
          <Link href="/relaunch-control" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-800">
            Review controls <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-[#e0dbd3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm text-[#5f6f7a]">Generation credits</span><Coins className="h-5 w-5 text-[#c5a55a]" /></div>
          <p className="mt-3 text-3xl font-semibold text-[#1a2e3e]">{wallet.available_credits == null ? '—' : Number(wallet.available_credits).toLocaleString()}</p>
          <Link href="/billing" className="mt-3 inline-flex text-xs font-semibold text-brand-600">View balance</Link>
        </article>
        <article className="rounded-2xl border border-[#e0dbd3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm text-[#5f6f7a]">Campaigns</span><Megaphone className="h-5 w-5 text-brand-500" /></div>
          <p className="mt-3 text-3xl font-semibold text-[#1a2e3e]">{metrics.activeCampaigns} active</p>
          <p className="mt-1 text-xs text-[#788791]">{metrics.draftCampaigns} draft</p>
        </article>
        <article className="rounded-2xl border border-[#e0dbd3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm text-[#5f6f7a]">Content</span><FileText className="h-5 w-5 text-[#3a9d8f]" /></div>
          <p className="mt-3 text-3xl font-semibold text-[#1a2e3e]">{metrics.review} to review</p>
          <p className="mt-1 text-xs text-[#788791]">{metrics.drafts} draft · {metrics.approved} approved</p>
        </article>
        <article className="rounded-2xl border border-[#e0dbd3] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm text-[#5f6f7a]">Connections</span><Plug className="h-5 w-5 text-[#2d6a4f]" /></div>
          <p className="mt-3 text-3xl font-semibold text-[#1a2e3e]">{metrics.connected} connected</p>
          <p className="mt-1 text-xs text-[#788791]">{metrics.attention ? `${metrics.attention} needs attention` : 'Everything connected looks healthy'}</p>
        </article>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[#1a2e3e]">What would you like to do next?</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { href: '/campaigns/new', title: 'Plan a campaign', description: 'Create a governed campaign brief.', icon: Megaphone },
            { href: '/content-studio', title: 'Review content', description: 'Move drafts through owner approval.', icon: CheckCircle2 },
            { href: '/content-studio/calendar', title: 'Open calendar', description: 'See what is scheduled and when.', icon: CalendarDays },
            { href: '/connections', title: 'Check connections', description: 'Connect and test your marketing services.', icon: Plug },
          ].map(({ href, title, description, icon: Icon }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-[#e0dbd3] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
              <Icon className="h-5 w-5 text-brand-500" />
              <p className="mt-4 font-semibold text-[#1a2e3e]">{title}</p>
              <p className="mt-1 text-sm text-[#5f6f7a]">{description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
