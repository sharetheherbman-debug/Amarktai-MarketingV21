'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Building2,
  Users,
  Megaphone,
  DollarSign,
  Activity,
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  X,
  TrendingUp,
  Eye,
  Settings,
  BarChart3,
  Clock,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface AgencyStats {
  total_clients: number;
  total_team_members: number;
  active_campaigns: number;
  monthly_revenue_cents: number;
}

interface ClientHealth {
  assignment_id: string;
  client_organization_id: string;
  client_name: string;
  relationship_type: string;
  monthly_fee_cents: number;
  active_campaigns: number;
  recent_content: number;
  last_activity: string | null;
}

export default function AgencyDashboardPage() {
  const [stats, setStats] = useState<AgencyStats | null>(null);
  const [clientHealth, setClientHealth] = useState<ClientHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [statsRes, healthRes] = await Promise.all([
        api.get<ApiResponse<AgencyStats>>('/agency/stats', { params: { organization_id: orgId } }),
        api.get<ApiResponse<ClientHealth[]>>('/agency/client-health', { params: { organization_id: orgId } }),
      ]);
      setStats(statsRes.data);
      setClientHealth(healthRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agency data');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agency Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage your clients, campaigns, and team from one place.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/agency/clients"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Manage Clients
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Total Clients</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Building2 className="h-4 w-4 text-blue-400" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">{stats?.total_clients || 0}</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Team Members</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <Users className="h-4 w-4 text-purple-400" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">{stats?.total_team_members || 0}</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Active Campaigns</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Megaphone className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">{stats?.active_campaigns || 0}</p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-400">Monthly Revenue</p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10">
              <DollarSign className="h-4 w-4 text-amber-400" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            ${((stats?.monthly_revenue_cents || 0) / 100).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/agency/clients"
          className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-100 p-4 transition-all hover:border-brand-500/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <Building2 className="h-5 w-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Clients</p>
            <p className="text-xs text-zinc-500">Manage clients</p>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <Link
          href="/agency/white-label"
          className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-100 p-4 transition-all hover:border-brand-500/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
            <Settings className="h-5 w-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">White Label</p>
            <p className="text-xs text-zinc-500">Branding settings</p>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <Link
          href="/agency/templates"
          className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-100 p-4 transition-all hover:border-brand-500/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
            <FileText className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Templates</p>
            <p className="text-xs text-zinc-500">Reusable templates</p>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5" />
        </Link>

        <Link
          href="/agency/reports"
          className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-100 p-4 transition-all hover:border-brand-500/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <BarChart3 className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Reports</p>
            <p className="text-xs text-zinc-500">Client reports</p>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Client Health */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-100">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Client Health</h2>
          <Link href="/agency/clients" className="text-xs text-brand-400 hover:text-brand-300">
            View all
          </Link>
        </div>
        {clientHealth.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-8 w-8 text-zinc-500" />
            <p className="mt-3 text-sm text-zinc-400">No clients yet</p>
            <Link
              href="/agency/clients"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400"
            >
              <Plus className="h-4 w-4" />
              Add Client
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {clientHealth.slice(0, 5).map((client) => (
              <div key={client.assignment_id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                    <Building2 className="h-5 w-5 text-brand-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{client.client_name}</p>
                    <p className="text-xs text-zinc-500 capitalize">{client.relationship_type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm text-white">{client.active_campaigns}</p>
                    <p className="text-xs text-zinc-500">Campaigns</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">{client.recent_content}</p>
                    <p className="text-xs text-zinc-500">Content (30d)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">
                      ${(client.monthly_fee_cents / 100).toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-500">Monthly</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {client.last_activity ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Clock className="h-4 w-4 text-zinc-500" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
