'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, BarChart3, CheckCircle2, Loader2, Megaphone, Plus, Puzzle, RefreshCw, Trash2, Upload, Webhook, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Provider {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  auth_config: { fields?: string[] } | string;
  config_schema: { fields?: string[] } | string;
  capabilities: string[] | string;
}

interface Connection {
  id: string;
  name: string;
  provider_slug: string;
  provider_name: string;
  provider_category: string;
  health_status: string;
  status: string;
  error_message: string | null;
  last_sync_at: string | null;
  has_credentials: boolean;
}

function objectValue<T extends Record<string, unknown>>(value: T | string | null | undefined): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return {} as T; }
  }
  return (value || {}) as T;
}

function arrayValue(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as string[]; } catch { return []; }
  }
  return [];
}

export default function IntegrationsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showConnect, setShowConnect] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [providerResponse, connectionResponse] = await Promise.all([
        api.get<ApiResponse<Provider[]>>('/integrations/providers', { params: categoryFilter !== 'all' ? { category: categoryFilter } : {} }),
        api.get<ApiResponse<Connection[]>>('/integrations/connections'),
      ]);
      setProviders(providerResponse.data || []);
      setConnections(connectionResponse.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load integrations.');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const provider = useMemo(() => providers.find((item) => item.slug === selectedProvider), [providers, selectedProvider]);
  const credentialFields = objectValue(provider?.auth_config).fields || [];
  const configFields = objectValue(provider?.config_schema).fields || [];
  const categories = ['all', ...Array.from(new Set(providers.map((item) => item.category)))];

  const resetForm = () => {
    setSelectedProvider('');
    setConnectionName('');
    setCredentials({});
    setConfig({});
  };

  const parsedValue = (field: string, value: string): unknown => {
    if (['headers', 'metric_map'].includes(field)) {
      try { return value.trim() ? JSON.parse(value) : {}; }
      catch { throw new Error(`${field} must be valid JSON.`); }
    }
    return value;
  };

  const connect = async () => {
    if (!selectedProvider || !connectionName.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const parsedCredentials = Object.fromEntries(Object.entries(credentials).map(([key, value]) => [key, parsedValue(key, value)]));
      const parsedConfig = Object.fromEntries(Object.entries(config).map(([key, value]) => [key, parsedValue(key, value)]));
      const response = await api.post<ApiResponse<Connection>>('/integrations/connections', {
        body: { provider_slug: selectedProvider, name: connectionName.trim(), credentials: parsedCredentials, config: parsedConfig },
      });
      await api.post(`/integrations/connections/${response.data.id}/test`, { body: {} });
      setShowConnect(false);
      resetForm();
      await fetchData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Connection failed.');
    } finally {
      setConnecting(false);
    }
  };

  const run = async (connection: Connection, action: 'test' | 'sync') => {
    setBusyId(connection.id);
    setError(null);
    try {
      const endpoint = action === 'test'
        ? `/integrations/connections/${connection.id}/test`
        : connection.provider_category === 'advertising'
          ? `/integrations/advertising/connections/${connection.id}/sync`
          : `/integrations/analytics/connections/${connection.id}/sync`;
      await api.post(endpoint, { body: {} });
      await fetchData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${action} failed.`);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this integration and its synchronized data?')) return;
    setBusyId(id);
    try { await api.delete(`/integrations/connections/${id}`); await fetchData(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Delete failed.'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-white">Integrations</h1><p className="mt-1 text-sm text-zinc-400">Connect, test and synchronize real advertising and analytics providers.</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/advertising" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white"><Megaphone className="h-4 w-4" />Advertising</Link>
          <Link href="/analytics" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white"><BarChart3 className="h-4 w-4" />Analytics</Link>
          <Link href="/integrations/webhooks" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white"><Webhook className="h-4 w-4" />Webhooks</Link>
          <Link href="/integrations/import-export" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white"><Upload className="h-4 w-4" />Import/Export</Link>
          <button type="button" onClick={() => setShowConnect(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Add connection</button>
        </div>
      </div>

      {error && <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3"><AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p><button type="button" onClick={() => setError(null)} className="ml-auto text-red-400"><X className="h-4 w-4" /></button></div>}

      {showConnect && (
        <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">New provider connection</h2>
          <p className="mt-1 text-xs text-zinc-500">Credentials are encrypted at rest and never returned by the API.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm text-zinc-300"><span>Provider</span><select value={selectedProvider} onChange={(event) => { setSelectedProvider(event.target.value); setCredentials({}); setConfig({}); }} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white"><option value="">Select provider</option>{providers.map((item) => <option key={item.slug} value={item.slug}>{item.name} ({item.category})</option>)}</select></label>
            <label className="space-y-1.5 text-sm text-zinc-300"><span>Connection name</span><input value={connectionName} onChange={(event) => setConnectionName(event.target.value)} placeholder="Production account" className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>
            {credentialFields.map((field) => <label key={field} className="space-y-1.5 text-sm text-zinc-300"><span>{field.replaceAll('_', ' ')}</span>{['headers'].includes(field) ? <textarea rows={4} value={credentials[field] || ''} onChange={(event) => setCredentials((current) => ({ ...current, [field]: event.target.value }))} placeholder='{"Authorization":"Bearer ..."}' className="w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-white" /> : <input type={field.includes('token') || field.includes('key') ? 'password' : 'text'} value={credentials[field] || ''} onChange={(event) => setCredentials((current) => ({ ...current, [field]: event.target.value }))} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" />}</label>)}
            {configFields.map((field) => <label key={field} className="space-y-1.5 text-sm text-zinc-300"><span>{field.replaceAll('_', ' ')}</span>{['metric_map'].includes(field) ? <textarea rows={4} value={config[field] || ''} onChange={(event) => setConfig((current) => ({ ...current, [field]: event.target.value }))} placeholder='{"users":"data.users"}' className="w-full rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs text-white" /> : <input value={config[field] || ''} onChange={(event) => setConfig((current) => ({ ...current, [field]: event.target.value }))} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" />}</label>)}
          </div>
          {provider?.description && <p className="mt-3 text-xs text-zinc-500">{provider.description}</p>}
          <div className="mt-4 flex gap-2"><button type="button" disabled={connecting || !selectedProvider || !connectionName.trim()} onClick={() => void connect()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{connecting ? 'Connecting…' : 'Save and test'}</button><button type="button" onClick={() => { setShowConnect(false); resetForm(); }} className="rounded-lg px-4 py-2 text-sm text-zinc-400">Cancel</button></div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">{categories.map((category) => <button type="button" key={category} onClick={() => setCategoryFilter(category)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${categoryFilter === category ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:bg-white/5'}`}>{category === 'all' ? 'All providers' : category}</button>)}</div>

      {connections.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Connected providers</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {connections.map((connection) => (
              <article key={connection.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
                <div className="flex items-start justify-between"><div><h3 className="text-sm font-semibold text-white">{connection.name}</h3><p className="text-xs text-zinc-500">{connection.provider_name} · {connection.provider_category}</p></div><span className={`inline-flex items-center gap-1 text-xs ${connection.health_status === 'healthy' ? 'text-emerald-400' : connection.health_status === 'unhealthy' ? 'text-red-400' : 'text-zinc-400'}`}>{connection.health_status === 'healthy' && <CheckCircle2 className="h-3.5 w-3.5" />}{connection.health_status}</span></div>
                {connection.error_message && <p className="mt-3 text-xs text-red-400">{connection.error_message}</p>}
                <p className="mt-3 text-xs text-zinc-500">{connection.last_sync_at ? `Last sync ${new Date(connection.last_sync_at).toLocaleString()}` : 'Not synchronized yet'}</p>
                <div className="mt-4 flex gap-2"><button type="button" onClick={() => void run(connection, 'test')} className="inline-flex items-center gap-1 rounded border border-white/10 px-2.5 py-1.5 text-xs text-white">{busyId === connection.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Test</button>{['analytics', 'advertising'].includes(connection.provider_category) && <button type="button" onClick={() => void run(connection, 'sync')} className="rounded bg-brand-500 px-2.5 py-1.5 text-xs text-white">Sync now</button>}<button type="button" onClick={() => void remove(connection.id)} className="ml-auto rounded p-1.5 text-zinc-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div> : <section><h2 className="mb-3 text-sm font-semibold text-white">Available providers</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{providers.map((item) => <article key={item.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10"><Puzzle className="h-5 w-5 text-brand-400" /></div><div><h3 className="text-sm font-semibold text-white">{item.name}</h3><p className="text-[11px] uppercase text-zinc-500">{item.category}</p></div></div><p className="mt-3 text-xs text-zinc-400">{item.description}</p><div className="mt-3 flex flex-wrap gap-1">{arrayValue(item.capabilities).map((capability) => <span key={capability} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">{capability}</span>)}</div></article>)}</div></section>}
    </div>
  );
}
