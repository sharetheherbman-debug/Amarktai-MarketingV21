'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Server,
  Database,
  Users,
  Building2,
  CreditCard,
  Cpu,
  Loader2,
  AlertCircle,
  X,
  CheckCircle2,
  Clock,
  BarChart3,
  Flag,
  Bell,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface SystemHealth {
  status: string;
  timestamp: string;
  services: {
    database: { status: string; latency_ms: number };
    redis: { status: string; latency_ms: number };
    queue: { status: string; latency_ms: number };
    storage: { status: string; latency_ms: number };
  };
  metrics: {
    total_organizations: number;
    total_users: number;
    active_subscriptions: number;
    total_content: number;
    total_campaigns: number;
  };
}

interface ProviderStatus {
  name: string;
  status: string;
  last_check: string | null;
}

interface FeatureFlag {
  key: string;
  name: string;
  is_enabled: boolean;
  enabled_for_plans: string[];
}

const statusColors: Record<string, string> = {
  healthy: 'text-emerald-400',
  degraded: 'text-amber-400',
  unhealthy: 'text-red-400',
  unknown: 'text-zinc-400',
};

const statusIcons: Record<string, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  degraded: AlertCircle,
  unhealthy: AlertCircle,
  unknown: Clock,
};

export default function AdminConsolePage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [healthRes, providersRes, flagsRes] = await Promise.all([
        api.get<ApiResponse<SystemHealth>>('/admin/health'),
        api.get<ApiResponse<ProviderStatus[]>>('/admin/providers/status'),
        api.get<ApiResponse<FeatureFlag[]>>('/admin/feature-flags'),
      ]);
      setHealth(healthRes.data);
      setProviders(providersRes.data);
      setFlags(flagsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggleFlag = async (key: string, currentState: boolean) => {
    try {
      await api.put(`/admin/feature-flags/${key}`, {
        body: { is_enabled: !currentState },
      });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update flag');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Admin Console</h1>
        <p className="mt-1 text-sm text-zinc-400">
          System health, provider status, and platform configuration.
        </p>
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

      {/* System Health */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Activity className="h-5 w-5 text-brand-400" />
          System Health
        </h2>
        {health && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(health.services).map(([name, service]) => {
              const StatusIcon = statusIcons[service.status] || Clock;
              return (
                <div key={name} className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm capitalize text-zinc-400">{name}</p>
                    <StatusIcon className={`h-4 w-4 ${statusColors[service.status]}`} />
                  </div>
                  <p className={`mt-1 text-sm font-medium capitalize ${statusColors[service.status]}`}>
                    {service.status}
                  </p>
                  {service.latency_ms > 0 && (
                    <p className="text-xs text-zinc-500">{service.latency_ms}ms</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Platform Metrics */}
      {health && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-blue-400" />
              <p className="text-sm text-zinc-400">Organizations</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{health.metrics.total_organizations}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              <p className="text-sm text-zinc-400">Users</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{health.metrics.total_users}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-400" />
              <p className="text-sm text-zinc-400">Subscriptions</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{health.metrics.active_subscriptions}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-400" />
              <p className="text-sm text-zinc-400">Content</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{health.metrics.total_content}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-brand-400" />
              <p className="text-sm text-zinc-400">Campaigns</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{health.metrics.total_campaigns}</p>
          </div>
        </div>
      )}

      {/* Provider Status */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Cpu className="h-5 w-5 text-brand-400" />
          AI Providers
        </h2>
        <div className="mt-4 space-y-2">
          {providers.map((provider) => {
            const StatusIcon = statusIcons[provider.status] || Clock;
            return (
              <div key={provider.name} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-3">
                <div className="flex items-center gap-3">
                  <StatusIcon className={`h-4 w-4 ${statusColors[provider.status]}`} />
                  <p className="text-sm font-medium text-white">{provider.name}</p>
                </div>
                <span className={`text-xs capitalize ${statusColors[provider.status]}`}>
                  {provider.status}
                </span>
              </div>
            );
          })}
          {providers.length === 0 && (
            <p className="text-sm text-zinc-500">No providers configured</p>
          )}
        </div>
      </div>

      {/* Feature Flags */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Flag className="h-5 w-5 text-brand-400" />
          Feature Flags
        </h2>
        <div className="mt-4 space-y-2">
          {flags.map((flag) => (
            <div key={flag.key} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">{flag.name}</p>
                <p className="text-xs text-zinc-500">{flag.key}</p>
              </div>
              <button
                onClick={() => handleToggleFlag(flag.key, flag.is_enabled)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  flag.is_enabled ? 'bg-emerald-500' : 'bg-zinc-600'
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    flag.is_enabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          ))}
          {flags.length === 0 && (
            <p className="text-sm text-zinc-500">No feature flags configured</p>
          )}
        </div>
      </div>
    </div>
  );
}
