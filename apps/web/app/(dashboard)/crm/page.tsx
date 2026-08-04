'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  Building2,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  BarChart3,
  UserPlus,
  Target,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface DashboardStats {
  contacts: { total: number; new_leads: number; qualified: number };
  companies: { total: number };
  deals: { total: number; open: number; pipeline_value: string; won_value: string };
  customers: { total: number; avg_health: string; at_risk: number };
  tasks: { total: number; pending: number };
}

export default function CrmDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchStats = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<DashboardStats>>('/crm/dashboard', { params: { organization_id: orgId } });
      setStats(res.data);
    } catch {} finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>;

  const cards = [
    { label: 'Contacts', value: stats?.contacts.total ?? 0, sub: `${stats?.contacts.new_leads ?? 0} new leads`, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/crm/contacts' },
    { label: 'Companies', value: stats?.companies.total ?? 0, sub: 'Tracked', icon: Building2, color: 'text-purple-400', bg: 'bg-purple-500/10', href: '/crm/contacts' },
    { label: 'Pipeline Value', value: `$${((parseInt(stats?.deals.pipeline_value ?? '0') || 0) / 100).toLocaleString()}`, sub: `${stats?.deals.open ?? 0} open deals`, icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/10', href: '/crm/deals' },
    { label: 'Customers at Risk', value: stats?.customers.at_risk ?? 0, sub: `Avg health: ${Math.round(parseFloat(stats?.customers.avg_health ?? '0'))}%`, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', href: '/crm/customers' },
    { label: 'Pending Tasks', value: stats?.tasks.pending ?? 0, sub: `${stats?.tasks.total ?? 0} total`, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', href: '/crm' },
    { label: 'Won Revenue', value: `$${((parseInt(stats?.deals.won_value ?? '0') || 0) / 100).toLocaleString()}`, sub: `${stats?.deals.total ?? 0} total deals`, icon: TrendingUp, color: 'text-brand-400', bg: 'bg-brand-500/10', href: '/crm/deals' },
  ];

  const quickActions = [
    { label: 'Add Contact', icon: UserPlus, href: '/crm/contacts', description: 'Create a new contact' },
    { label: 'View Pipeline', icon: Target, href: '/crm/deals', description: 'Sales pipeline view' },
    { label: 'Customer Health', icon: BarChart3, href: '/crm/customers', description: 'Customer success dashboard' },
    { label: 'All Companies', icon: Building2, href: '/crm/contacts', description: 'Company management' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">CRM Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">AI-powered customer relationship management.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(card => (
          <Link key={card.label} href={card.href}
            className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">{card.label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.bg}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="mt-3 text-3xl font-bold text-white">{card.value}</p>
            <p className="mt-1 text-xs text-zinc-500">{card.sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {quickActions.map(action => (
              <Link key={action.label} href={action.href}
                className="group flex items-start gap-4 rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/30 hover:bg-surface-200">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400">
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{action.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-400" />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{action.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">AI Insights</h2>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/10">
                <BarChart3 className="h-6 w-6 text-brand-400" />
              </div>
              <p className="mt-4 text-sm font-medium text-zinc-300">AI insights appear here</p>
              <p className="mt-1 text-xs text-zinc-500">Lead scores, deal forecasts, and churn predictions will show as you add data.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
