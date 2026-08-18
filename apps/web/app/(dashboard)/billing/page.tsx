'use client';

import { useEffect, useState } from 'react';
import { Coins, Loader2, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/api') return '/api/v1';
  return trimmed;
}
const API_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

export default function GenerationCreditsPage() {
  const { token, currentOrganization } = useAuthStore();
  const [wallet, setWallet] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!token || !currentOrganization) return;
    fetch(`${API_URL}/generation-credits/wallet`, { credentials: 'include', headers: { Authorization: `Bearer ${token}`, 'x-organization-id': currentOrganization.id } })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || 'Credit balance unavailable'); return payload.data; })
      .then(setWallet).catch((cause) => setError(cause.message));
  }, [token, currentOrganization]);
  if (!wallet && !error) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#2e6da4]" /></div>;
  const values = [
    ['Available', wallet?.available_credits], ['Reserved', wallet?.reserved_credits],
    ['Granted', wallet?.lifetime_granted_credits], ['Used', wallet?.lifetime_spent_credits],
  ];
  return <div className="space-y-6">
    <section className="rounded-[24px] border border-[#d9e1e7] bg-[linear-gradient(135deg,#fff_0%,#f4f8fb_70%,#f3f8f6_100%)] p-6 shadow-sm sm:p-8"><div className="flex items-start gap-3"><span className="rounded-xl bg-[#fbf4e5] p-2.5 text-[#a17e35]"><Coins className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a8992]">Credits</p><h1 className="mt-1 font-serif text-3xl font-semibold text-[#172c3d]">Generation credits</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#61727d]">Your workspace balance for governed image and video generation through approved processing routes.</p></div></div></section>
    {error ? <div className="rounded-xl border border-[#efc7c0] bg-[#fff5f2] p-4 text-sm text-[#963e35]">{error}</div> : <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{values.map(([label,value]) => <article key={String(label)} className="ep-card p-5"><p className="text-sm font-semibold text-[#61727d]">{label}</p><p className="mt-3 text-3xl font-bold text-[#172c3d]">{Number(value || 0).toLocaleString()}</p><p className="mt-1 text-xs text-[#87939a]">credits</p></article>)}</div>
      <section className="ep-card p-5"><div className="flex items-start gap-3"><span className="rounded-xl bg-[#edf7f4] p-2 text-[#348d82]"><ShieldCheck className="h-5 w-5" /></span><div><p className="font-bold text-[#243e50]">Protected credit accounting</p><p className="mt-1 text-sm leading-6 text-[#687983]">Generation reserves the required credits before execution. Successful work settles against the actual request; failed work releases its reservation so balances do not remain stranded.</p></div></div></section>
    </>}
  </div>;
}
