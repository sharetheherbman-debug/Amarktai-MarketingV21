'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  X,
  MoreHorizontal,
  Eye,
  Edit3,
  Trash2,
  Archive,
  Users,
  Megaphone,
  DollarSign,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface ClientAssignment {
  id: string;
  agency_id: string;
  client_organization_id: string;
  client_name: string;
  client_slug: string;
  assigned_to: string | null;
  relationship_type: string;
  contract_start: string | null;
  contract_end: string | null;
  monthly_fee_cents: number;
  notes: string | null;
  status: string;
  created_at: string;
}

export default function AgencyClientsPage() {
  const [clients, setClients] = useState<ClientAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newClient, setNewClient] = useState({
    client_organization_id: '',
    relationship_type: 'managed',
    monthly_fee_cents: 0,
    notes: '',
  });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchClients = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<ClientAssignment[]>>('/agency/clients', {
        params: { organization_id: orgId },
      });
      setClients(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const handleAddClient = async () => {
    if (!newClient.client_organization_id) return;
    try {
      await api.post('/agency/clients', {
        body: { organization_id: orgId, ...newClient },
      });
      setShowAdd(false);
      setNewClient({ client_organization_id: '', relationship_type: 'managed', monthly_fee_cents: 0, notes: '' });
      fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add client');
    }
  };

  const handleRemoveClient = async (assignmentId: string) => {
    if (!confirm('Remove this client assignment?')) return;
    try {
      await api.delete(`/agency/clients/${assignmentId}`, {
        params: { organization_id: orgId },
      });
      fetchClients();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove client');
    }
  };

  const filteredClients = clients.filter((c) =>
    c.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.client_slug?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Client Management</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage your agency clients and their assignments.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400"
        >
          <Plus className="h-4 w-4" />
          Add Client
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

      {showAdd && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">Add New Client</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-300">Client Organization ID</label>
              <input
                type="text"
                value={newClient.client_organization_id}
                onChange={(e) => setNewClient({ ...newClient, client_organization_id: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                placeholder="Organization UUID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Relationship Type</label>
              <select
                value={newClient.relationship_type}
                onChange={(e) => setNewClient({ ...newClient, relationship_type: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
              >
                <option value="managed">Managed</option>
                <option value="consultant">Consultant</option>
                <option value="fulfillment">Fulfillment</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Monthly Fee ($)</label>
              <input
                type="number"
                value={newClient.monthly_fee_cents / 100}
                onChange={(e) => setNewClient({ ...newClient, monthly_fee_cents: Number(e.target.value) * 100 })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Notes</label>
              <input
                type="text"
                value={newClient.notes}
                onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
                placeholder="Optional notes"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleAddClient}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400"
            >
              Add Client
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-white/[0.06] px-4 py-2 text-sm text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.06] py-20">
          <Building2 className="h-12 w-12 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No clients found</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-400"
          >
            <Plus className="h-4 w-4" />
            Add your first client
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100">
          <div className="grid grid-cols-12 gap-4 border-b border-white/[0.06] px-6 py-3 text-xs font-medium text-zinc-400">
            <div className="col-span-4">Client</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-2">Monthly Fee</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="grid grid-cols-12 items-center gap-4 border-b border-white/[0.04] px-6 py-4 last:border-0"
            >
              <div className="col-span-4">
                <p className="text-sm font-medium text-white">{client.client_name}</p>
                <p className="text-xs text-zinc-500">{client.client_slug}</p>
              </div>
              <div className="col-span-2">
                <span className="inline-flex items-center rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-medium text-brand-400 capitalize">
                  {client.relationship_type}
                </span>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-white">${(client.monthly_fee_cents / 100).toLocaleString()}</p>
              </div>
              <div className="col-span-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    client.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-zinc-500/10 text-zinc-400'
                  }`}
                >
                  {client.status}
                </span>
              </div>
              <div className="col-span-2 flex justify-end gap-2">
                <button
                  onClick={() => handleRemoveClient(client.id)}
                  className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
