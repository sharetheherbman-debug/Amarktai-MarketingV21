'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Puzzle,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Globe,
  Share2,
  BarChart3,
  Mail,
  Calendar,
  Webhook,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Provider { id: string; slug: string; name: string; category: string; description: string | null; auth_type: string; capabilities: string[]; }
interface Connection { id: string; name: string; provider_slug: string; provider_name: string; health_status: string; status: string; last_sync_at: string | null; }

const categoryIcons: Record<string, typeof Globe> = { cms: Globe, social: Share2, analytics: BarChart3, email: Mail, calendar: Calendar, storage: Upload };
const categoryLabels: Record<string, string> = { cms: 'CMS', social: 'Social Media', analytics: 'Analytics', email: 'Email', calendar: 'Calendar', storage: 'Storage' };

export default function IntegrationsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showConnect, setShowConnect] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [connectionName, setConnectionName] = useState('');
  const [connecting, setConnecting] = useState(false);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [provRes, connRes] = await Promise.all([
        api.get<ApiResponse<Provider[]>>('/integrations/providers', { params: categoryFilter !== 'all' ? { category: categoryFilter } : {} }),
        api.get<ApiResponse<Connection[]>>('/integrations/connections', { params: { organization_id: orgId } }),
      ]);
      setProviders(provRes.data);
      setConnections(connRes.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [orgId, categoryFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleConnect = async () => {
    if (!selectedProvider || !connectionName || !orgId) return;
    try {
      setConnecting(true);
      await api.post('/integrations/connections', { body: { organization_id: orgId, provider_slug: selectedProvider, name: connectionName } });
      setShowConnect(false);
      setSelectedProvider('');
      setConnectionName('');
      fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Connection failed'); }
    finally { setConnecting(false); }
  };

  const handleTest = async (id: string) => {
    try {
      await api.post(`/integrations/connections/${id}/test`, { body: { organization_id: orgId } });
      fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Test failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this connection?')) return;
    try {
      await api.delete(`/integrations/connections/${id}`, { params: { organization_id: orgId } });
      fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  };

  const categories = ['all', ...new Set(providers.map(p => p.category))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Integrations</h1>
          <p className="mt-1 text-sm text-zinc-400">Connect your marketing tools and platforms.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/integrations/webhooks"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06]">
            <Webhook className="h-4 w-4" />Webhooks
          </Link>
          <Link href="/integrations/import-export"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.06]">
            <Upload className="h-4 w-4" />Import/Export
          </Link>
          <button onClick={() => setShowConnect(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
            <Plus className="h-4 w-4" />Add Connection
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {showConnect && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">New Connection</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Provider</label>
              <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50">
                <option value="">Select provider...</option>
                {providers.map(p => <option key={p.slug} value={p.slug}>{p.name} ({p.category})</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Connection Name</label>
              <input type="text" value={connectionName} onChange={e => setConnectionName(e.target.value)} placeholder="My WordPress Site"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleConnect} disabled={connecting || !selectedProvider || !connectionName}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Connect
            </button>
            <button onClick={() => setShowConnect(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.04]">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {categories.map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${categoryFilter === c ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>
            {c === 'all' ? 'All' : (categoryLabels[c] || c)}
          </button>
        ))}
      </div>

      {connections.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Active Connections ({connections.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {connections.map(conn => (
              <div key={conn.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{conn.name}</h3>
                    <p className="text-xs text-zinc-500">{conn.provider_name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${conn.health_status === 'healthy' ? 'bg-emerald-400' : conn.health_status === 'unhealthy' ? 'bg-red-400' : 'bg-zinc-500'}`} />
                    <span className="text-xs text-zinc-400 capitalize">{conn.status}</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => handleTest(conn.id)} className="rounded-md p-1.5 text-zinc-500 hover:bg-white/[0.04] hover:text-white"><RefreshCw className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(conn.id)} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Available Providers ({providers.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {providers.map(p => {
              const Icon = categoryIcons[p.category] || Puzzle;
              return (
                <div key={p.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/20">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10">
                      <Icon className="h-5 w-5 text-brand-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                      <p className="text-[11px] text-zinc-500 uppercase">{p.category}</p>
                      {p.description && <p className="mt-1 text-xs text-zinc-400">{p.description}</p>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.capabilities.slice(0, 4).map(cap => (
                      <span key={cap} className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-400">{cap}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
