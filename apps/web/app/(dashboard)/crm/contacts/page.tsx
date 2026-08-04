'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  X,
  Mail,
  Phone,
  Building2,
  Sparkles,
  Star,
  Trash2,
  Eye,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface Contact { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; title: string | null; lead_score: number; lead_status: string; company_id: string | null; created_at: string; }

const statuses = ['all', 'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', title: '', company_id: '' });

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchContacts = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const params: Record<string, string> = { organization_id: orgId };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search) params.search = search;
      const res = await api.get<ApiResponse<Contact[]>>('/crm/contacts', { params });
      setContacts(res.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [orgId, statusFilter, search]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleCreate = async () => {
    if (!form.first_name || !form.last_name || !orgId) return;
    try {
      setCreating(true);
      await api.post('/crm/contacts', { body: { ...form, organization_id: orgId } });
      setShowCreate(false);
      setForm({ first_name: '', last_name: '', email: '', phone: '', title: '', company_id: '' });
      fetchContacts();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to create'); }
    finally { setCreating(false); }
  };

  const handleScore = async (id: string) => {
    try {
      await api.post(`/crm/contacts/${id}/score`, { body: { organization_id: orgId } });
      fetchContacts();
    } catch (err) { setError(err instanceof Error ? err.message : 'Scoring failed'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this contact?')) return;
    try {
      await api.delete(`/crm/contacts/${id}`, { params: { organization_id: orgId } });
      fetchContacts();
    } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
  };

  const scoreColor = (score: number) => score >= 70 ? 'text-emerald-400 bg-emerald-500/10' : score >= 40 ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10';
  const statusColor = (status: string) => {
    const colors: Record<string, string> = { new: 'bg-blue-500/10 text-blue-400', contacted: 'bg-amber-500/10 text-amber-400', qualified: 'bg-emerald-500/10 text-emerald-400', proposal: 'bg-purple-500/10 text-purple-400', won: 'bg-green-500/10 text-green-400', lost: 'bg-red-500/10 text-red-400' };
    return colors[status] || 'bg-zinc-500/10 text-zinc-400';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          <p className="mt-1 text-sm text-zinc-400">Manage contacts with AI-powered lead scoring.</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
          <Plus className="h-4 w-4" />Add Contact
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {showCreate && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">New Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">First Name *</label>
              <input type="text" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="John"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Last Name *</label>
              <input type="text" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Doe"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@example.com"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Title</label>
              <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="CEO"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleCreate} disabled={creating || !form.first_name || !form.last_name}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create Contact
            </button>
            <button onClick={() => setShowCreate(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.04]">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === s ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:bg-white/[0.04]'}`}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>
      ) : contacts.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 py-16 text-center">
          <Users className="mx-auto h-8 w-8 text-zinc-500" />
          <p className="mt-4 text-sm text-zinc-400">No contacts yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100">
          <div className="divide-y divide-white/[0.06]">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center justify-between px-6 py-4 hover:bg-white/[0.02]">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/20 text-sm font-semibold text-brand-400">
                    {c.first_name[0]}{c.last_name[0]}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{c.first_name} {c.last_name}</h3>
                    <div className="flex items-center gap-3 text-xs text-zinc-400">
                      {c.title && <span>{c.title}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor(c.lead_status)}`}>{c.lead_status}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${scoreColor(c.lead_score)}`}>Score: {c.lead_score}</span>
                  <button onClick={() => handleScore(c.id)} title="AI Score" className="rounded-md p-1.5 text-zinc-500 hover:bg-brand-500/10 hover:text-brand-400"><Sparkles className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(c.id)} title="Delete" className="rounded-md p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
