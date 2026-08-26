'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

type Account = { id: string; name: string; platform: string };
type Exchange = { session_id: string; accounts: Account[] };

export default function SocialOAuthCallbackPage() {
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const platform = sessionStorage.getItem('marketing_oauth_platform') || '';
    const code = params.get('code') || '';
    const state = params.get('state') || '';
    const providerError = params.get('error_description') || params.get('error');
    if (providerError || !platform || !code || !state) {
      setError(providerError || 'The provider callback is incomplete or no longer belongs to this browser session.');
      setBusy(false);
      return;
    }
    void api.post<ApiResponse<Exchange>>(`/amai/social/oauth/${platform}/callback`, { body: { code, state } })
      .then((response) => { setExchange(response.data); sessionStorage.removeItem('marketing_oauth_platform'); })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'The provider connection could not be completed.'))
      .finally(() => setBusy(false));
  }, []);

  const select = async (account: Account) => {
    if (!exchange) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/amai/social/oauth/sessions/${exchange.session_id}/select`, { body: { account_id: account.id } });
      setCompleted(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The selected account could not be connected.'); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-2xl space-y-5"><header className="ep-panel p-6"><p className="ep-section-label">Secure provider connection</p><h1 className="ep-page-title mt-2">Choose the account Marketing may use.</h1><p className="ep-page-copy mt-3 text-sm">Provider credentials stay encrypted on the server and are never returned to this page.</p></header>{busy&&<div className="ep-card flex items-center justify-center gap-3 p-10 text-sm text-[var(--ep-text-muted)]"><Loader2 className="h-5 w-5 animate-spin"/>Completing the secure provider exchange…</div>}{error&&<div className="ep-status-danger rounded-xl border p-4 text-sm">{error}</div>}{completed?<div className="ep-status-success rounded-xl border p-6"><CheckCircle2 className="h-6 w-6"/><p className="mt-3 font-extrabold">Social account connected.</p><Link href="/connections" className="ep-button-primary mt-4 px-4 py-2.5 text-sm">Return to connections</Link></div>:!busy&&exchange&&<div className="space-y-3">{exchange.accounts.map((account)=><button key={account.id} type="button" onClick={()=>void select(account)} className="ep-card flex w-full items-center justify-between p-5 text-left"><span><strong className="block text-[var(--ep-navy)]">{account.name}</strong><span className="text-xs text-[var(--ep-text-muted)]">{account.platform} · {account.id}</span></span><span className="text-sm font-extrabold text-[var(--ep-blue)]">Connect</span></button>)}</div>}</div>;
}
