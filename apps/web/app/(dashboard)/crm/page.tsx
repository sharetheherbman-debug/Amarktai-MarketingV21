'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, BarChart3, Building2, CheckCircle2, Clock, DollarSign, Heart, Loader2, Target, UserPlus, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface DashboardStats {
  contacts: { total: number; new_leads: number; qualified: number };
  companies: { total: number };
  deals: { total: number; open: number; pipeline_value: string; won_value: string };
  customers: { total: number; avg_health: string; at_risk: number };
  tasks: { total: number; pending: number };
}

interface AiAction {
  id: string;
  entity_type: string;
  entity_name: string | null;
  title: string;
  description: string | null;
  priority: string;
  due_at: string | null;
}

export default function CrmDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [actions, setActions] = useState<AiAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsResponse, actionsResponse] = await Promise.all([
        api.get<ApiResponse<DashboardStats>>('/crm/dashboard'),
        api.get<ApiResponse<AiAction[]>>('/crm/ai-actions', { params: { status: 'open', limit: '50' } }),
      ]);
      setStats(statsResponse.data);
      setActions(actionsResponse.data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateAction = async (id: string, status: 'completed' | 'dismissed') => {
    setBusyId(id);
    try { await api.put(`/crm/ai-actions/${id}/status`, { body: { status } }); setActions((current) => current.filter((action) => action.id !== id)); }
    finally { setBusyId(null); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>;

  const cards = [
    { label: 'Contacts', value: stats?.contacts.total ?? 0, sub: `${stats?.contacts.new_leads ?? 0} new leads`, icon: Users, href: '/crm/contacts' },
    { label: 'Companies', value: stats?.companies.total ?? 0, sub: 'Tracked', icon: Building2, href: '/crm/contacts' },
    { label: 'Pipeline Value', value: `$${((Number(stats?.deals.pipeline_value || 0)) / 100).toLocaleString()}`, sub: `${stats?.deals.open ?? 0} open deals`, icon: DollarSign, href: '/crm/deals' },
    { label: 'Customers at Risk', value: stats?.customers.at_risk ?? 0, sub: `Avg health ${Math.round(Number(stats?.customers.avg_health || 0))}%`, icon: AlertTriangle, href: '/crm/customers' },
    { label: 'Pending Tasks', value: stats?.tasks.pending ?? 0, sub: `${stats?.tasks.total ?? 0} total`, icon: Clock, href: '/crm' },
    { label: 'AI Actions', value: actions.length, sub: 'Open recommendations', icon: BarChart3, href: '/crm' },
  ];

  const quickActions = [
    { label: 'Add Contact', icon: UserPlus, href: '/crm/contacts' },
    { label: 'View Pipeline', icon: Target, href: '/crm/deals' },
    { label: 'Customer Health', icon: Heart, href: '/crm/customers' },
  ];

  return <div className="space-y-8">
    <header><h1 className="text-2xl font-bold text-white">CRM Dashboard</h1><p className="mt-1 text-sm text-zinc-400">AI analysis that produces a prioritized, persistent action queue.</p></header>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((card) => <Link key={card.label} href={card.href} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 hover:border-brand-500/20"><div className="flex justify-between"><p className="text-sm text-zinc-400">{card.label}</p><card.icon className="h-4 w-4 text-brand-400" /></div><p className="mt-3 text-3xl font-bold text-white">{card.value}</p><p className="mt-1 text-xs text-zinc-500">{card.sub}</p></Link>)}</div>
    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
      <section><h2 className="mb-4 text-lg font-semibold text-white">Quick actions</h2><div className="space-y-3">{quickActions.map((action) => <Link key={action.label} href={action.href} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-100 p-4 hover:border-brand-500/20"><action.icon className="h-5 w-5 text-brand-400" /><span className="text-sm text-white">{action.label}</span><ArrowRight className="ml-auto h-4 w-4 text-zinc-500" /></Link>)}</div></section>
      <section><h2 className="mb-4 text-lg font-semibold text-white">AI recommended actions</h2><div className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-100">{actions.length === 0 ? <div className="py-16 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" /><p className="mt-3 text-sm text-zinc-500">No open AI actions. Analyze contacts, deals or customers to create recommendations.</p></div> : <div className="divide-y divide-white/[0.06]">{actions.map((action) => <article key={action.id} className="px-5 py-4"><div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${action.priority === 'urgent' ? 'bg-red-400' : action.priority === 'high' ? 'bg-orange-400' : action.priority === 'medium' ? 'bg-amber-400' : 'bg-blue-400'}`} /><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium text-white">{action.title}</h3><span className="rounded bg-white/5 px-2 py-0.5 text-[10px] uppercase text-zinc-400">{action.entity_type}</span></div><p className="mt-1 text-xs text-zinc-500">{action.entity_name || 'CRM record'}{action.due_at ? ` · due ${new Date(action.due_at).toLocaleDateString()}` : ''}</p>{action.description && <p className="mt-2 text-xs text-zinc-400">{action.description}</p>}</div><div className="flex gap-1"><button type="button" disabled={busyId === action.id} onClick={() => void updateAction(action.id, 'completed')} className="rounded p-1.5 text-zinc-400 hover:bg-emerald-500/10 hover:text-emerald-400"><CheckCircle2 className="h-4 w-4" /></button><button type="button" disabled={busyId === action.id} onClick={() => void updateAction(action.id, 'dismissed')} className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"><X className="h-4 w-4" /></button></div></div></article>)}</div>}</div></section>
    </div>
  </div>;
}
