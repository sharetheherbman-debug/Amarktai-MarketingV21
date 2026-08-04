'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Webhook,
  Plus,
  Loader2,
  AlertCircle,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Clock,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface IncomingWebhook { id: string; name: string; endpoint_slug: string; events: string[]; is_active: boolean; trigger_count: number; last_triggered_at: string | null; created_at: string; }
interface OutgoingWebhook { id: string; name: string; url: string; events: string[]; is_active: boolean; success_count: number; failure_count: number; last_sent_at: string | null; created_at: string; }
interface Delivery { id: string; webhook_type: string; event_type: string; status: string; http_status: number | null; error: string | null; attempt: number; delivered_at: string | null; created_at: string; }

export default function WebhooksPage() {
  const [incoming, setIncoming] = useState<IncomingWebhook[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingWebhook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'incoming' | 'outgoing' | 'deliveries'>('incoming');
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<'incoming' | 'outgoing'>('incoming');
  const [form, setForm] = useState({ name: '', endpoint_slug: '', url: '', events: '' });
  const [creating, setCreating] = useState(false);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [inRes, outRes, delRes] = await Promise.all([
        api.get<ApiResponse<IncomingWebhook[]>>('/integrations/webhooks/incoming', { params: { organization_id: orgId } }),
        api.get<ApiResponse<OutgoingWebhook[]>>('/integrations/webhooks/outgoing', { params: { organization_id: orgId } }),
        api.get<ApiResponse<Delivery[]>>('/integrations/webhooks/deliveries', { params: { organization_id: orgId } }),
      ]);
      setIncoming(inRes.data);
      setOutgoing(outRes.data);
      setDeliveries(delRes.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!form.name || !orgId) return;
    try {
      setCreating(true);
      if (createType === 'incoming') {
        if (!form.endpoint_slug) return;
        await api.post('/integrations/webhooks/incoming', { body: { organization_id: orgId, name: form.name, endpoint_slug: form.endpoint_slug, events: form.events.split(',').map(e => e.trim()).filter(Boolean) } });
      } else {
        if (!form.url) return;
        await api.post('/integrations/webhooks/outgoing', { body: { organization_id: orgId, name: form.name, url: form.url, events: form.events.split(',').map(e => e.trim()).filter(Boolean) } });
      }
      setShowCreate(false);
      setForm({ name: '', endpoint_slug: '', url: '', events: '' });
      fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Create failed'); }
    finally { setCreating(false); }
  };

  const handleDelete = async (type: string, id: string) => {
    if (!confirm('Delete this webhook?')) return;
    try {
      await api.delete(`/integrations/webhooks/${type}/${id}`, { params: { organization_id: orgId } });
      fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Webhooks</h1>
          <p className="mt-1 text-sm text-zinc-400">Manage incoming and outgoing webhook integrations.</p>
        </div>
        <button onClick={() => { setShowCreate(true); setForm({ name: '', endpoint_slug: '', url: '', events: '' }); }}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
          <Plus className="h-4 w-4" />New Webhook
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-1">
        {([['incoming', 'Incoming', ArrowDownToLine], ['outgoing', 'Outgoing', ArrowUpFromLine], ['deliveries', 'Deliveries', Clock]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as typeof tab)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:text-white'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {showCreate && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">New Webhook</h2>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setCreateType('incoming')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${createType === 'incoming' ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>Incoming</button>
            <button onClick={() => setCreateType('outgoing')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${createType === 'outgoing' ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>Outgoing</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="My Webhook"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            {createType === 'incoming' ? (
              <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Endpoint Slug *</label>
                <input type="text" value={form.endpoint_slug} onChange={e => setForm({ ...form, endpoint_slug: e.target.value })} placeholder="my-webhook"
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            ) : (
              <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Target URL *</label>
                <input type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/webhook"
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            )}
            <div className="sm:col-span-2"><label className="block text-sm font-medium text-zinc-300 mb-1.5">Events (comma-separated)</label>
              <input type="text" value={form.events} onChange={e => setForm({ ...form, events: e.target.value })} placeholder="content.created, deal.won"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleCreate} disabled={creating || !form.name}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.04]">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : tab === 'incoming' ? (
        incoming.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-12 text-center">
            <ArrowDownToLine className="mx-auto h-8 w-8 text-zinc-500" /><p className="mt-4 text-sm text-zinc-400">No incoming webhooks.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {incoming.map(wh => (
              <div key={wh.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{wh.name}</h3>
                    <p className="text-xs text-zinc-500">/webhook/{wh.endpoint_slug}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                      <span>Triggered: {wh.trigger_count}</span>
                      {wh.last_triggered_at && <span>Last: {new Date(wh.last_triggered_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleDelete('incoming', wh.id)} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : tab === 'outgoing' ? (
        outgoing.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-12 text-center">
            <ArrowUpFromLine className="mx-auto h-8 w-8 text-zinc-500" /><p className="mt-4 text-sm text-zinc-400">No outgoing webhooks.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {outgoing.map(wh => (
              <div key={wh.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{wh.name}</h3>
                    <p className="text-xs text-zinc-500 truncate max-w-md">{wh.url}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
                      <span className="text-emerald-400">✓ {wh.success_count}</span>
                      <span className="text-red-400">✗ {wh.failure_count}</span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete('outgoing', wh.id)} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        deliveries.length === 0 ? (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-12 text-center">
            <Clock className="mx-auto h-8 w-8 text-zinc-500" /><p className="mt-4 text-sm text-zinc-400">No deliveries yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/[0.06] bg-surface-100">
            <div className="divide-y divide-white/[0.06]">
              {deliveries.slice(0, 20).map(d => (
                <div key={d.id} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <span className="text-sm text-white">{d.event_type}</span>
                    <span className="ml-2 text-xs text-zinc-500 capitalize">({d.webhook_type})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.http_status && <span className="text-xs text-zinc-400">{d.http_status}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{d.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
