'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Coins, Loader2, Megaphone, Plug, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { MARKETING_BRAND_NAME } from '@/lib/branding';

const API_URL = String(process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/+$/, '');

type Summary = {
  control?: Record<string, unknown>;
  wallet?: Record<string, unknown>;
  campaigns?: unknown[];
  connections?: unknown[];
  capabilities?: unknown[];
};

function rows(payload: any): unknown[] {
  const value = payload?.data;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

export default function DashboardPage() {
  const { user, currentOrganization } = useAuthStore();
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrganization) {
      setError('No organization is available for this Marketing workspace.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const headers = { 'x-organization-id': currentOrganization.id };
    const get = async (path: string) => {
      const response = await fetch(`${API_URL}${path}`, { credentials: 'include', headers });
      if (!response.ok) throw new Error(`${path} returned ${response.status}`);
      return response.json();
    };
    Promise.allSettled([
      get('/relaunch-control'), get('/generation-credits/wallet'), get('/campaigns?limit=100'),
      get('/integrations/connections'), get('/genx-admin/capabilities'),
    ]).then((results) => {
      const failures = results.filter((item) => item.status === 'rejected');
      const value = (index: number) => results[index].status === 'fulfilled' ? (results[index] as PromiseFulfilledResult<any>).value : undefined;
      setSummary({
        control: value(0)?.data,
        wallet: value(1)?.data,
        campaigns: rows(value(2)),
        connections: rows(value(3)),
        capabilities: rows(value(4)),
      });
      setError(failures.length ? `${failures.length} live status source${failures.length === 1 ? '' : 's'} unavailable` : null);
      setLoading(false);
    });
  }, [currentOrganization]);

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-400" /></div>;

  const control = summary.control || {};
  const wallet = summary.wallet || {};
  const campaigns = summary.campaigns || [];
  const activeCampaigns = campaigns.filter((item: any) => item?.status === 'active').length;
  const drafts = campaigns.filter((item: any) => item?.status === 'draft').length;
  const connections = summary.connections || [];
  const capabilities = summary.capabilities || [];

  const cards = [
    { label: 'Operating mode', value: String(control.operating_mode || 'Unavailable'), icon: ShieldCheck },
    { label: 'Emergency stop', value: control.emergency_stop === true ? 'ON' : control.emergency_stop === false ? 'OFF' : 'Unavailable', icon: AlertTriangle },
    { label: 'Available credits', value: wallet.available_credits == null ? 'Unavailable' : Number(wallet.available_credits).toLocaleString(), icon: Coins },
    { label: 'GenX capabilities', value: String(capabilities.length), icon: Sparkles },
    { label: 'Active campaigns', value: String(activeCampaigns), icon: Megaphone },
    { label: 'Draft campaigns', value: String(drafts), icon: Megaphone },
    { label: 'Connections', value: String(connections.length), icon: Plug },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">{MARKETING_BRAND_NAME}</h1>
        <p className="mt-1 text-sm text-zinc-400">Owner operations for {user?.name || 'the connected application'}.</p>
      </div>
      {error && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">{error}. Values are shown as unavailable rather than estimated.</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><div className="flex items-center justify-between"><p className="text-sm text-zinc-400">{label}</p><Icon className="h-4 w-4 text-brand-400" /></div><p className="mt-3 text-2xl font-bold text-white">{value}</p></div>)}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/relaunch-control" className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 hover:border-brand-500/30"><p className="font-medium text-white">Safety & approvals</p><p className="mt-1 text-sm text-zinc-500">Review control policy, pending approvals, schedules and limits.</p></Link>
        <Link href="/billing" className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 hover:border-brand-500/30"><p className="font-medium text-white">Generation Credits</p><p className="mt-1 text-sm text-zinc-500">Review wallet balance and immutable ledger activity.</p></Link>
        <Link href="/integrations" className="rounded-xl border border-white/[0.06] bg-surface-100 p-5 hover:border-brand-500/30"><p className="font-medium text-white">Connections</p><p className="mt-1 text-sm text-zinc-500">Review social, email, analytics and host application health.</p></Link>
      </div>
    </div>
  );
}
