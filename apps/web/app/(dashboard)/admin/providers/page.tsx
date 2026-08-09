'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Coins,
  Cpu,
  Database,
  Loader2,
  LockKeyhole,
  PoundSterling,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface GenXCapabilities {
  total: number;
  available: number;
  retail_enabled: number;
  unpriced: number;
  pricing_errors: number;
  vendors: number;
  text: number;
  image: number;
  video: number;
  voice: number;
  audio: number;
  runtime_confirmed: number;
}

interface ProviderStatus {
  name: string;
  status: string;
  latency?: number;
  lastCheck?: string;
  error?: string;
}

interface PriceRow {
  id: string;
  model_id: string;
  model_name?: string;
  category?: string;
  operation: string;
  billable_unit: string;
  source_currency: string;
  source_unit_cost: number | string;
  wholesale_unit_cost_gbp: number | string;
  retail_unit_cost_gbp: number | string;
  credits_per_unit: number | string;
  target_margin_bps: number | string;
  agent_tier_applied: boolean;
  effective_from: string;
  retail_enabled: boolean;
  pricing_status: string;
}

const formatGBP = (value: number | string) => new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
}).format(Number(value) || 0);

const formatNumber = (value: number | string) => new Intl.NumberFormat('en-GB').format(Number(value) || 0);

export default function ProvidersPage() {
  const [capabilities, setCapabilities] = useState<GenXCapabilities | null>(null);
  const [health, setHealth] = useState<ProviderStatus[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [capabilitiesRes, healthRes, priceRes] = await Promise.all([
        api.get<ApiResponse<GenXCapabilities>>('/admin/genx/capabilities'),
        api.get<ApiResponse<ProviderStatus[]>>('/admin/providers/status'),
        api.get<ApiResponse<PriceRow[]>>('/admin/genx/pricing'),
      ]);
      setCapabilities(capabilitiesRes.data || null);
      setHealth(healthRes.data || []);
      setPrices(priceRes.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the GenX runtime status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshCatalogue = async () => {
    try {
      setRefreshing(true);
      setError(null);
      setNotice(null);
      const result = await api.post<ApiResponse<{
        catalogue: { total: number; new: number; updated: number; removed: number };
        pricing: { priced: number; unpriced: number; snapshotsCreated: number; errors: Array<{ model_id: string; error: string }> };
      }>>('/admin/genx/models/refresh', { body: {} });
      const priced = result.data?.pricing.priced || 0;
      const unpriced = result.data?.pricing.unpriced || 0;
      setNotice(`GenX catalogue refreshed: ${priced} priced models enabled and ${unpriced} models safely blocked until pricing is verified.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'GenX catalogue refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  const genxStatus = health.find((row) => row.name.toLowerCase() === 'genx') || health[0];
  const grossMargin = useMemo(() => {
    const first = prices[0];
    return first ? Number(first.target_margin_bps || 0) / 100 : 40;
  }, [prices]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">GenX Runtime & GBP Pricing</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">
            GenX is the platform&apos;s only remote AI provider. Credentials, base URLs, Stripe secrets and infrastructure configuration are managed on the server and are never exposed through this dashboard.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshCatalogue()}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh catalogue & prices
        </button>
      </header>

      <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <h2 className="text-sm font-semibold text-emerald-200">Environment-only credentials</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-100/70">
              Workspace users cannot add, replace or view the GenX key. The server uses the agent-tier account for every approved generation and records the wholesale cost, GBP retail charge and margin in the immutable credit ledger.
            </p>
          </div>
        </div>
      </section>

      {notice && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-sm text-emerald-200">{notice}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">GenX status</p>
                <Activity className={`h-5 w-5 ${genxStatus?.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400'}`} />
              </div>
              <p className="mt-3 text-2xl font-bold capitalize text-white">{genxStatus?.status || 'unknown'}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {genxStatus?.latency ? `${genxStatus.latency} ms latest health check` : 'No latency result yet'}
              </p>
            </article>

            <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Catalogue</p>
                <Database className="h-5 w-5 text-blue-400" />
              </div>
              <p className="mt-3 text-2xl font-bold text-white">{formatNumber(capabilities?.total || 0)}</p>
              <p className="mt-1 text-xs text-zinc-500">Models discovered from GenX</p>
            </article>

            <article className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Retail enabled</p>
                <ShieldCheck className="h-5 w-5 text-brand-400" />
              </div>
              <p className="mt-3 text-2xl font-bold text-white">{formatNumber(capabilities?.retail_enabled || 0)}</p>
              <p className="mt-1 text-xs text-zinc-500">Verified and priced in GBP</p>
            </article>

            <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Safely blocked</p>
                <TriangleAlert className="h-5 w-5 text-amber-400" />
              </div>
              <p className="mt-3 text-2xl font-bold text-white">
                {formatNumber((capabilities?.unpriced || 0) + (capabilities?.pricing_errors || 0))}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Missing or invalid prices</p>
            </article>

            <article className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">Target margin</p>
                <PoundSterling className="h-5 w-5 text-emerald-400" />
              </div>
              <p className="mt-3 text-2xl font-bold text-white">{grossMargin.toFixed(0)}%</p>
              <p className="mt-1 text-xs text-zinc-500">Gross margin on GenX cost</p>
            </article>
          </section>

          <section className="rounded-xl border border-white/[0.06] bg-surface-100">
            <div className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                <Coins className="h-4 w-4 text-brand-400" />
                Active GBP price snapshots
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Prices shown here are platform monitoring data, not editable customer settings.
              </p>
            </div>

            {prices.length === 0 ? (
              <div className="py-14 text-center">
                <Cpu className="mx-auto h-8 w-8 text-zinc-600" />
                <p className="mt-3 text-sm text-zinc-400">No verified GenX prices are active.</p>
                <p className="mt-1 text-xs text-zinc-500">Refresh the authenticated catalogue after configuring the server environment.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/[0.06] text-left text-sm">
                  <thead className="bg-white/[0.02] text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-5 py-3 font-medium">Model</th>
                      <th className="px-5 py-3 font-medium">Operation</th>
                      <th className="px-5 py-3 font-medium">Unit</th>
                      <th className="px-5 py-3 font-medium">Wholesale GBP</th>
                      <th className="px-5 py-3 font-medium">Retail GBP</th>
                      <th className="px-5 py-3 font-medium">Credits</th>
                      <th className="px-5 py-3 font-medium">Effective</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {prices.map((price) => (
                      <tr key={price.id} className="text-zinc-300">
                        <td className="px-5 py-3">
                          <p className="font-medium text-white">{price.model_name || price.model_id}</p>
                          <p className="text-xs text-zinc-500">{price.category || 'generation'}{price.agent_tier_applied ? ' · agent tier' : ''}</p>
                        </td>
                        <td className="px-5 py-3">{price.operation.replace(/_/g, ' ')}</td>
                        <td className="px-5 py-3">{price.billable_unit.replace(/_/g, ' ')}</td>
                        <td className="px-5 py-3">{formatGBP(price.wholesale_unit_cost_gbp)}</td>
                        <td className="px-5 py-3 font-medium text-white">{formatGBP(price.retail_unit_cost_gbp)}</td>
                        <td className="px-5 py-3">{formatNumber(price.credits_per_unit)}</td>
                        <td className="px-5 py-3 text-xs text-zinc-500">
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            {new Date(price.effective_from).toLocaleString('en-GB')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
