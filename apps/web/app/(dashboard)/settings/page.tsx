'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import { Building2, BrainCircuit, Lock, Palette, ShieldCheck, User } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getInitials } from '@/lib/utils';

export default function SettingsPage() {
  const { user, currentOrganization } = useAuthStore();
  return <div className="space-y-6">
    <header className="ep-panel p-6 sm:p-8"><p className="ep-section-label">Settings</p><h1 className="ep-page-title mt-2">Workspace, identity and security.</h1><p className="ep-page-copy mt-3 max-w-3xl text-sm leading-6 sm:text-base">Keep account and workspace details visible here; business facts and brand rules live in Business Brain so there is one canonical place to teach Marketing about the company.</p></header>

    <div className="grid gap-5 xl:grid-cols-2">
      <section className="ep-card p-5 sm:p-6"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ep-navy)] text-sm font-extrabold text-white">{user?.name ? getInitials(user.name) : 'U'}</div><div className="min-w-0"><p className="ep-section-label">Signed-in owner</p><h2 className="mt-1 truncate text-lg font-extrabold text-[var(--ep-navy)]">{user?.name || 'Owner account'}</h2></div></div><div className="mt-5 space-y-3"><Info icon={User} label="Account" value={user?.email || 'Authenticated owner'} /><Info icon={Building2} label="Workspace" value={currentOrganization?.name || 'EquiProfile Marketing'} /></div></section>

      <section className="ep-card p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[var(--ep-blue)]"/><h2 className="text-lg font-extrabold text-[var(--ep-navy)]">Security</h2></div><div className="mt-5 space-y-3"><div className="ep-status-success flex items-start gap-3 rounded-xl border p-4"><Lock className="mt-0.5 h-4 w-4 shrink-0"/><div><p className="text-sm font-extrabold">Multi-factor authentication required</p><p className="mt-1 text-xs leading-5 opacity-80">Owner access remains protected by the Marketing MFA flow. Setup secrets and recovery-code values are never displayed here.</p></div></div><div className="rounded-xl border border-[var(--ep-border)] bg-[var(--ep-surface-subtle)] p-4"><div className="flex items-start gap-3"><Palette className="mt-0.5 h-4 w-4 text-[var(--ep-blue)]"/><div><p className="text-sm font-extrabold text-[var(--ep-navy)]">EquiProfile interface</p><p className="mt-1 text-xs leading-5 text-[var(--ep-text-muted)]">Management and Marketing share the same navy, blue, white and cool-light interface language. Customer pages do not use provider or internal branding.</p></div></div></div></div></section>
    </div>

    <Link href="/business-brain" className="ep-card group flex items-start gap-4 p-5 sm:p-6"><span className="rounded-xl bg-[var(--ep-blue-soft)] p-3 text-[var(--ep-blue)]"><BrainCircuit className="h-5 w-5"/></span><div className="min-w-0 flex-1"><p className="ep-section-label">Business configuration</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Edit Business Brain</h2><p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">Website learning, knowledge sources, products, audiences, goals, claims, brand voice and visual identity are maintained in the Business Brain workspace.</p></div><span className="text-sm font-extrabold text-[var(--ep-blue)]">Open →</span></Link>
  </div>;
}

function Info({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string }) {
  return <div className="flex items-center gap-3 rounded-xl bg-[var(--ep-surface-subtle)] p-4"><Icon className="h-4 w-4 shrink-0 text-[var(--ep-blue)]"/><div className="min-w-0"><p className="text-xs font-bold text-[var(--ep-text-muted)]">{label}</p><p className="truncate text-sm font-semibold text-[var(--ep-navy)]">{value}</p></div></div>;
}
