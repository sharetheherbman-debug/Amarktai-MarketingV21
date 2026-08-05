'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Plus,
  Loader2,
  AlertCircle,
  X,
  ExternalLink,
  Settings,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface ClientPortal {
  id: string;
  agency_id: string;
  client_organization_id: string;
  client_name: string;
  portal_name: string;
  custom_domain: string | null;
  subdomain: string | null;
  branding: Record<string, unknown>;
  features: Record<string, unknown>;
  status: string;
  created_at: string;
}

export default function ClientPortalPage() {
  const [portals, setPortals] = useState<ClientPortal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newPortal, setNewPortal] = useState({
    client_organization_id: '',
    portal_name: '',
    subdomain: '',
  });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchPortals = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<ClientPortal[]>>('/white-label/portals', {
        params: { agency_id: orgId },
      });
      setPortals(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load portals');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchPortals(); }, [fetchPortals]);

  const handleCreate = async () => {
    if (!newPortal.client_organization_id || !newPortal.portal_name) return;
    try {
      await api.post('/white-label/portals', {
        body: { agency_id: orgId, ...newPortal },
      });
      setShowCreate(false);
      setNewPortal({ client_organization_id: '', portal_name: '', subdomain: '' });
      fetchPortals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create portal');
    }
  };

  const handleDelete = async (portalId: string) => {
    if (!confirm('Delete this portal?')) return;
    try {
      await api.delete(`/white-label/portals/${portalId}`, {
        params: { agency_id: orgId },
      });
      fetchPortals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete portal');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Client Portals</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage white-labeled portals for your clients.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
        >
          <Plus className="h-4 w-4" />
          Create Portal
        </button>
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

      {showCreate && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">Create Client Portal</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Client Organization ID</label>
              <input
                type="text"
                value={newPortal.client_organization_id}
                onChange={(e) => setNewPortal({ ...newPortal, client_organization_id: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                placeholder="Organization UUID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Portal Name</label>
              <input
                type="text"
                value={newPortal.portal_name}
                onChange={(e) => setNewPortal({ ...newPortal, portal_name: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                placeholder="Client Portal"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Subdomain</label>
              <input
                type="text"
                value={newPortal.subdomain}
                onChange={(e) => setNewPortal({ ...newPortal, subdomain: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                placeholder="client-name"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleCreate}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400"
            >
              Create Portal
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-white/[0.06] px-4 py-2 text-sm text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : portals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.06] py-20">
          <Globe className="h-12 w-12 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No client portals yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400"
          >
            <Plus className="h-4 w-4" />
            Create your first portal
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portals.map((portal) => (
            <div
              key={portal.id}
              className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{portal.portal_name}</h3>
                  <p className="text-xs text-zinc-500">{portal.client_name}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    portal.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-zinc-500/10 text-zinc-400'
                  }`}
                >
                  {portal.status}
                </span>
              </div>
              {portal.subdomain && (
                <p className="mt-2 text-xs text-brand-400">{portal.subdomain}.amarktai.com</p>
              )}
              {portal.custom_domain && (
                <p className="mt-1 text-xs text-zinc-400">{portal.custom_domain}</p>
              )}
              <div className="mt-4 flex gap-2">
                <button className="flex-1 rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs text-zinc-400 hover:text-white">
                  <Settings className="mr-1 inline h-3 w-3" />
                  Settings
                </button>
                <button
                  onClick={() => handleDelete(portal.id)}
                  className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
