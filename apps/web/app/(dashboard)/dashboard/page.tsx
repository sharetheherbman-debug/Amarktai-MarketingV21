'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Coins, FileText, Loader2, Megaphone, Plug, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/api') return '/api/v1';
  return trimmed;
}
const API_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
type RecordValue = Record<string, unknown>;
type Summary = { control?: RecordValue; wallet?: RecordValue; campaigns: RecordValue[]; connections: RecordValue[]; content: RecordValue[] };
function rows(payload: any): RecordValue[] { const value = payload?.data; if (Array.isArray(value)) return value; if (Array.isArray(value?.items)) return value.items; if (Array.isArray(value?.data)) return value.data; return []; }
function automationLabel(control: RecordValue): string { if (control.emergency_stop === true) return 'Paused for launch safety'; if (control.operating_mode === 'autonomous') return 'Active within limits'; if (control.operating_mode === 'approval') return 'Approval required'; if (control.operating_mode === 'manual') return 'Manual control'; return 'Status unavailable'; }

export default function DashboardPage() {
  const { user, token, currentOrganization } = useAuthStore();
  const [summary, setSummary] = useState<Summary>({ campaigns: [], connections: [], content: [] });
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    if (!token || !currentOrganization) { setLoading(false); return; }
    let active = true;
    const headers = { Authorization: `Bearer ${token}`, 'x-organization-id': currentOrganization.id };
    const get = async (path: string) => { const response = await fetch(`${API_URL}${path}`, { credentials: 'include', headers }); if (!response.ok) throw new Error('Dashboard information is temporarily unavailable.'); return response.json(); };
    void Promise.allSettled([get('/relaunch-control'), get('/generation-credits/wallet'), get('/campaigns?limit=100'), get('/integrations/connections'), get('/content-studio?limit=100')]).then((results) => {
      if (!active) return;
      const value = (index: number) => results[index].status === 'fulfilled' ? (results[index] as PromiseFulfilledResult<any>).value : undefined;
      setSummary({ control: value(0)?.data, wallet: value(1)?.data, campaigns: rows(value(2)), connections: rows(value(3)), content: rows(value(4)) });
      setPartial(results.some((item) => item.status === 'rejected')); setLoading(false);
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

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#2e6da4]" /></div>;
  const control = summary.control || {}; const wallet = summary.wallet || {}; const stopped = control.emergency_stop === true;

  return <div className="space-y-7">
    <section className="overflow-hidden rounded-[24px] border border-[#d9e1e7] bg-[linear-gradient(135deg,#ffffff_0%,#f3f8fb_62%,#eef6f3_100%)] p-6 shadow-[0_18px_50px_rgba(23,44,61,0.07)] sm:p-8">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl"><div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#2e6da4]"><span className="h-2 w-2 rounded-full bg-[#348d82]" /> Workspace overview</div><h1 className="font-serif text-3xl font-semibold tracking-tight text-[#172c3d] sm:text-4xl">Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#61727d] sm:text-base">Plan campaigns, create assets, review content and manage publishing from one controlled EquiProfile workspace.</p></div>
        <div className="flex flex-wrap gap-3"><Link href="/campaigns/new" className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cfd9e0] bg-white px-4 py-3 text-sm font-bold text-[#244459] shadow-sm transition hover:border-[#9fb7c8]"><Megaphone className="h-4 w-4" /> New campaign</Link><Link href="/creative-studio" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2e6da4] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#255d8e]"><Sparkles className="h-4 w-4" /> Open Studio</Link></div>
      </div>
    </section>
    {partial && <div className="rounded-xl border border-[#e2c785] bg-[#fff9ea] px-4 py-3 text-sm font-medium text-[#75531c]">Some live workspace details could not be refreshed. Existing work is unaffected.</div>}
    <section className={stopped ? 'rounded-2xl border border-[#ead39a] bg-[#fff9ea] p-5' : 'rounded-2xl border border-[#cfe2dd] bg-[#f1f8f6] p-5'}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className={stopped ? 'rounded-xl bg-[#f8e8bd] p-2.5 text-[#8b641e]' : 'rounded-xl bg-white p-2.5 text-[#348d82] shadow-sm'}>{stopped ? <AlertTriangle className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}</div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#75838b]">Automation & safety</p><h2 className="mt-1 text-lg font-bold text-[#172c3d]">{automationLabel(control)}</h2><p className="mt-1 text-sm leading-5 text-[#61727d]">{stopped ? 'Automated execution and generation remain safely paused while launch acceptance is in progress.' : 'Workspace approval and spending controls remain in force.'}</p></div></div><Link href="/relaunch-control" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#2e6da4] hover:text-[#1a3a5c]">Review controls <ArrowRight className="h-4 w-4" /></Link></div></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        { label:'Generation credits', value:wallet.available_credits == null ? '—' : Number(wallet.available_credits).toLocaleString(), detail:'Available balance', icon:Coins, tone:'text-[#a17e35] bg-[#fbf4e5]' },
        { label:'Campaigns', value:`${metrics.activeCampaigns} active`, detail:`${metrics.draftCampaigns} draft`, icon:Megaphone, tone:'text-[#2e6da4] bg-[#edf4f9]' },
        { label:'Content', value:`${metrics.review} to review`, detail:`${metrics.drafts} draft · ${metrics.approved} approved`, icon:FileText, tone:'text-[#348d82] bg-[#edf7f4]' },
        { label:'Connections', value:`${metrics.connected} connected`, detail:metrics.attention ? `${metrics.attention} need attention` : 'No connection alerts', icon:Plug, tone:'text-[#516f83] bg-[#eef3f6]' },
      ].map(({label,value,detail,icon:Icon,tone}) => <article key={label} className="ep-card min-w-0 p-5"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-[#61727d]">{label}</span><span className={`rounded-xl p-2 ${tone}`}><Icon className="h-4 w-4" /></span></div><p className="mt-4 truncate text-2xl font-bold text-[#172c3d]">{value}</p><p className="mt-1 truncate text-xs text-[#7c8991]">{detail}</p></article>)}
    </section>
    <section className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
      <div className="ep-card p-5 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a8992]">Workflow</p><h2 className="mt-1 text-lg font-bold text-[#172c3d]">Continue your marketing work</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{[
        { href:'/campaigns/new', title:'Plan a campaign', description:'Build a governed brief and campaign plan.', icon:Megaphone }, { href:'/creative-studio', title:'Create assets', description:'Use the clean Image and Video Studio.', icon:Sparkles }, { href:'/content-studio', title:'Review content', description:'Move drafts through owner review.', icon:CheckCircle2 }, { href:'/content-studio/calendar', title:'Open calendar', description:'See scheduled content and timing.', icon:CalendarDays },
      ].map(({href,title,description,icon:Icon}) => <Link key={href} href={href} className="group rounded-2xl border border-[#e4ded6] bg-[#fbfaf8] p-4 transition hover:border-[#a9c1d1] hover:bg-white"><div className="flex items-start gap-3"><span className="rounded-xl bg-white p-2 text-[#2e6da4] shadow-sm"><Icon className="h-4 w-4" /></span><div><p className="font-bold text-[#233e50]">{title}</p><p className="mt-1 text-sm leading-5 text-[#687983]">{description}</p></div></div></Link>)}</div></div>
      <div className="ep-card p-5 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a8992]">Workspace health</p><h2 className="mt-1 text-lg font-bold text-[#172c3d]">Launch controls are visible</h2><div className="mt-5 space-y-3"><div className="flex items-center justify-between rounded-xl bg-[#f5f8fa] px-4 py-3"><span className="text-sm font-medium text-[#526a79]">Safety state</span><span className="text-sm font-bold text-[#75531c]">{stopped ? 'Paused' : 'Active'}</span></div><div className="flex items-center justify-between rounded-xl bg-[#f5f8fa] px-4 py-3"><span className="text-sm font-medium text-[#526a79]">Connections</span><span className="text-sm font-bold text-[#233e50]">{metrics.connected}</span></div><div className="flex items-center justify-between rounded-xl bg-[#f5f8fa] px-4 py-3"><span className="text-sm font-medium text-[#526a79]">Items awaiting review</span><span className="text-sm font-bold text-[#233e50]">{metrics.review}</span></div></div><Link href="/connections" className="mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-[#2e6da4]">Manage connections <ArrowRight className="h-4 w-4" /></Link></div>
    </section>
  </div>;
}
