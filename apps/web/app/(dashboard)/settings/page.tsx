'use client';

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { Building2, BrainCircuit, CheckCircle2, Globe2, Lock, Palette, RefreshCw, Save, ShieldCheck, User } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getInitials } from '@/lib/utils';
import { MARKETING_BRAND_NAME } from '@/lib/branding';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

type WhiteLabelConfig = {
  brand_name?: string | null;
  brand_logo?: string | null;
  brand_colors?: Record<string, unknown> | null;
  support_email?: string | null;
  support_url?: string | null;
};

type CustomDomain = {
  id: string;
  domain: string;
  verification_status: string;
  ssl_status: string;
  verification_token?: string | null;
  dns_records?: Array<Record<string, unknown>>;
  is_primary: boolean;
};

export default function SettingsPage() {
  const { user, currentOrganization } = useAuthStore();
  const [config, setConfig] = useState<WhiteLabelConfig | null>(null);
  const [domains, setDomains] = useState<CustomDomain[]>([]);
  const [brandName, setBrandName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#2e6da4');
  const [domainInput, setDomainInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [domainBusy, setDomainBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadWhiteLabel = async () => {
    if (!currentOrganization?.id) { setLoading(false); return; }
    setLoading(true);
    setMessage(null);
    try {
      const [configResponse, domainsResponse] = await Promise.all([
        api.get<ApiResponse<WhiteLabelConfig>>('/white-label/config'),
        api.get<ApiResponse<CustomDomain[]>>('/white-label/domains'),
      ]);
      const nextConfig = configResponse.data || {};
      setConfig(nextConfig);
      setDomains(domainsResponse.data || []);
      setBrandName(String(nextConfig.brand_name || currentOrganization.name || ''));
      setSupportEmail(String(nextConfig.support_email || ''));
      const colors = nextConfig.brand_colors || {};
      setPrimaryColor(typeof colors.primary === 'string' ? colors.primary : '#2e6da4');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'White-label settings could not be loaded. Existing workspace settings were not changed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadWhiteLabel(); }, [currentOrganization?.id]);

  const saveBranding = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await api.put<ApiResponse<WhiteLabelConfig>>('/white-label/config', {
        body: {
          brand_name: brandName.trim() || null,
          support_email: supportEmail.trim() || null,
          brand_colors: { ...(config?.brand_colors || {}), primary: primaryColor },
        },
      });
      setConfig(response.data || config);
      setMessage('Brand settings saved. Active customer experiences will use the configured identity where supported.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Brand settings could not be saved. No configuration was changed.');
    } finally {
      setSaving(false);
    }
  };

  const addDomain = async () => {
    const domain = domainInput.trim();
    if (!domain) { setMessage('Enter a public custom domain before adding it.'); return; }
    setDomainBusy('add');
    setMessage(null);
    try {
      const response = await api.post<ApiResponse<CustomDomain>>('/white-label/domains', { body: { domain, is_primary: domains.length === 0 } });
      if (response.data) setDomains((current) => [response.data!, ...current]);
      setDomainInput('');
      setMessage('Domain added. Publish the displayed DNS record, then verify it here.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The custom domain could not be added.');
    } finally {
      setDomainBusy(null);
    }
  };

  const verifyDomain = async (domain: CustomDomain) => {
    setDomainBusy(domain.id);
    setMessage(null);
    try {
      const response = await api.post<ApiResponse<CustomDomain>>(`/white-label/domains/${domain.id}/verify`, { body: {} });
      if (response.data) setDomains((current) => current.map((item) => item.id === domain.id ? response.data! : item));
      setMessage('DNS verification completed. SSL provisioning remains pending until the deployment reports a certificate status.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'DNS verification is still pending. Check the required record and try again.');
    } finally {
      setDomainBusy(null);
    }
  };

  return <div className="space-y-6">
    <header className="ep-panel p-6 sm:p-8"><p className="ep-section-label">Settings</p><h1 className="ep-page-title mt-2">Workspace, identity and security.</h1><p className="ep-page-copy mt-3 max-w-3xl text-sm leading-6 sm:text-base">Keep account and workspace details visible here; business facts and brand rules live in Business Brain so there is one canonical place to teach Marketing about the company.</p></header>

    {message && <div role="status" className="rounded-xl border border-[var(--ep-border)] bg-[var(--ep-surface-subtle)] px-4 py-3 text-sm leading-6 text-[var(--ep-text-muted)]">{message}</div>}

    <div className="grid gap-5 xl:grid-cols-2">
      <section className="ep-card p-5 sm:p-6"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ep-navy)] text-sm font-extrabold text-white">{user?.name ? getInitials(user.name) : 'U'}</div><div className="min-w-0"><p className="ep-section-label">Signed-in owner</p><h2 className="mt-1 truncate text-lg font-extrabold text-[var(--ep-navy)]">{user?.name || 'Owner account'}</h2></div></div><div className="mt-5 space-y-3"><Info icon={User} label="Account" value={user?.email || 'Authenticated owner'} /><Info icon={Building2} label="Workspace" value={currentOrganization?.name || MARKETING_BRAND_NAME} /></div></section>

      <section className="ep-card p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[var(--ep-blue)]"/><h2 className="text-lg font-extrabold text-[var(--ep-navy)]">Security</h2></div><div className="mt-5 space-y-3"><div className="ep-status-success flex items-start gap-3 rounded-xl border p-4"><Lock className="mt-0.5 h-4 w-4 shrink-0"/><div><p className="text-sm font-extrabold">Multi-factor authentication required</p><p className="mt-1 text-xs leading-5 opacity-80">Owner access remains protected by the Marketing MFA flow. Setup secrets and recovery-code values are never displayed here.</p></div></div><div className="rounded-xl border border-[var(--ep-border)] bg-[var(--ep-surface-subtle)] p-4"><div className="flex items-start gap-3"><Palette className="mt-0.5 h-4 w-4 text-[var(--ep-blue)]"/><div><p className="text-sm font-extrabold text-[var(--ep-navy)]">{MARKETING_BRAND_NAME} interface</p><p className="mt-1 text-xs leading-5 text-[var(--ep-text-muted)]">The deployment uses its configured brand identity and interface colours. Customer pages do not expose provider or internal infrastructure branding.</p></div></div></div></div></section>
    </div>

    <section className="ep-card p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="ep-section-label">White-label identity</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Customer-facing brand settings</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">Save a workspace identity without exposing raw deployment controls. Domain activation remains separate and requires verifiable DNS ownership.</p></div><button type="button" onClick={() => void loadWhiteLabel()} disabled={loading || saving} className="ep-button-secondary shrink-0 px-3 py-2 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}/> Refresh</button></div><div className="mt-5 grid gap-4 md:grid-cols-3"><label className="text-xs font-bold text-[var(--ep-text-muted)]">Brand name<input value={brandName} onChange={(event) => setBrandName(event.target.value)} disabled={loading} className="ep-input mt-1 min-h-11 w-full px-3 text-sm font-normal" placeholder="Your customer-facing brand"/></label><label className="text-xs font-bold text-[var(--ep-text-muted)]">Support email<input type="email" value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} disabled={loading} className="ep-input mt-1 min-h-11 w-full px-3 text-sm font-normal" placeholder="support@example.com"/></label><label className="text-xs font-bold text-[var(--ep-text-muted)]">Primary colour<input value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value)} disabled={loading} className="ep-input mt-1 min-h-11 w-full px-3 text-sm font-normal" placeholder="#2e6da4"/></label></div><button type="button" onClick={() => void saveBranding()} disabled={loading || saving} className="ep-button-primary mt-5 px-4 py-2.5 text-sm">{saving ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}{saving ? 'Saving…' : 'Save brand settings'}</button></section>

    <section className="ep-card p-5 sm:p-6"><div><p className="ep-section-label">Custom domain</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Connect a verified public domain</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">A domain remains pending until the required DNS record is found. It is never represented as active before verification and certificate provisioning complete.</p></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><input value={domainInput} onChange={(event) => setDomainInput(event.target.value)} className="ep-input min-h-11 flex-1 px-3 text-sm" placeholder="marketing.example.com" aria-label="Custom domain"/><button type="button" onClick={() => void addDomain()} disabled={domainBusy !== null} className="ep-button-secondary px-4 py-2.5 text-sm">{domainBusy === 'add' ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Globe2 className="h-4 w-4"/>} Add domain</button></div><div className="mt-5 space-y-3">{loading ? <p className="text-sm text-[var(--ep-text-muted)]">Loading configured domains…</p> : domains.length === 0 ? <p className="rounded-xl bg-[var(--ep-surface-subtle)] p-4 text-sm text-[var(--ep-text-muted)]">No custom domain has been added. The standard Marketing workspace domain remains in use.</p> : domains.map((domain) => <article key={domain.id} className="rounded-xl border border-[var(--ep-border)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-extrabold text-[var(--ep-navy)]">{domain.domain}</p>{domain.is_primary && <span className="rounded-full bg-[var(--ep-blue-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--ep-blue)]">Primary</span>}</div><p className="mt-1 text-xs text-[var(--ep-text-muted)]">DNS: {domain.verification_status} · SSL: {domain.ssl_status}</p>{domain.verification_status !== 'verified' && domain.verification_token && <p className="mt-2 break-all text-xs leading-5 text-[var(--ep-text-muted)]">Add TXT <strong>_amarktai.{domain.domain}</strong> with value <strong>amarktai-verification={domain.verification_token}</strong>.</p>}</div>{domain.verification_status === 'verified' ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--ep-success)]"><CheckCircle2 className="h-4 w-4"/> DNS verified</span> : <button type="button" onClick={() => void verifyDomain(domain)} disabled={domainBusy !== null} className="ep-button-secondary shrink-0 px-3 py-2 text-xs">{domainBusy === domain.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin"/> : <CheckCircle2 className="h-3.5 w-3.5"/>} Verify DNS</button>}</div></article>)}</div></section>

    <Link href="/business-brain" className="ep-card group flex items-start gap-4 p-5 sm:p-6"><span className="rounded-xl bg-[var(--ep-blue-soft)] p-3 text-[var(--ep-blue)]"><BrainCircuit className="h-5 w-5"/></span><div className="min-w-0 flex-1"><p className="ep-section-label">Business configuration</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Edit Business Brain</h2><p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">Website learning, knowledge sources, products, audiences, goals, claims, brand voice and visual identity are maintained in the Business Brain workspace.</p></div><span className="text-sm font-extrabold text-[var(--ep-blue)]">Open →</span></Link>
  </div>;
}

function Info({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl bg-[var(--ep-surface-subtle)] p-4"><Icon className="h-4 w-4 shrink-0 text-[var(--ep-blue)]"/><div className="min-w-0"><p className="text-xs font-bold text-[var(--ep-text-muted)]">{label}</p><p className="truncate text-sm font-semibold text-[var(--ep-navy)]">{value}</p></div></div>;
}
