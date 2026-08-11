'use client';

import { useEffect, useState } from 'react';
import { Coins, Loader2, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

const API_URL = String(process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/+$/, '');

export default function GenerationCreditsPage() {
  const { token, currentOrganization } = useAuthStore();
  const [wallet, setWallet] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token || !currentOrganization) return;
    fetch(`${API_URL}/generation-credits/wallet`, { credentials: 'include', headers: { Authorization: `Bearer ${token}`, 'x-organization-id': currentOrganization.id } })
      .then(async (r) => { const p = await r.json(); if (!r.ok) throw new Error(p.error?.message || 'Wallet unavailable'); return p.data; })
      .then(setWallet).catch((e) => setError(e.message));
  }, [token, currentOrganization]);
  if (!wallet && !error) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>;
  const values = [
    ['Available', wallet?.available_credits], ['Reserved', wallet?.reserved_credits],
    ['Lifetime granted', wallet?.lifetime_granted_credits], ['Lifetime spent', wallet?.lifetime_spent_credits],
  ];
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold text-white">Generation Credits</h1><p className="mt-1 text-sm text-zinc-400">Internal launch wallet and immutable usage accounting. Public purchases are disabled for Phase 1.</p></div>{error ? <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">{error}</div> : <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{values.map(([label, value]) => <div key={label} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><Coins className="h-5 w-5 text-brand-400" /><p className="mt-3 text-sm text-zinc-400">{label}</p><p className="mt-1 text-3xl font-bold text-white">{Number(value || 0).toLocaleString()}</p></div>)}</div><div className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 text-emerald-400" /><div><p className="font-medium text-white">Controlled accounting</p><p className="mt-1 text-sm text-zinc-500">Jobs reserve credits before provider execution, settle actual cost on success, and release or reverse holds on failure.</p></div></div></div></>}</div>;
}
