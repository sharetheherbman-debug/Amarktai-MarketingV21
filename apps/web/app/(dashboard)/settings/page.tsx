'use client';

import { Building2, Lock, Palette, ShieldCheck, User } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { getInitials } from '@/lib/utils';

export default function SettingsPage() {
  const { user, currentOrganization } = useAuthStore();
  return <div className="space-y-6">
    <section className="rounded-[24px] border border-[#d9e1e7] bg-[linear-gradient(135deg,#fff_0%,#f4f8fb_70%,#f3f8f6_100%)] p-6 shadow-sm sm:p-8"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a8992]">Workspace settings</p><h1 className="mt-1 font-serif text-3xl font-semibold text-[#172c3d]">Settings</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#61727d]">Account identity, workspace context and launch-safe security settings for EquiProfile Marketing.</p></section>
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="ep-card p-5 sm:p-6"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#173754] text-sm font-bold text-white">{user?.name ? getInitials(user.name) : 'U'}</div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#7a8992]">Signed-in owner</p><h2 className="truncate text-lg font-bold text-[#172c3d]">{user?.name || 'Owner account'}</h2></div></div><div className="mt-5 grid gap-3"><div className="flex items-center gap-3 rounded-xl bg-[#f6f4f0] p-4"><User className="h-4 w-4 text-[#2e6da4]"/><div className="min-w-0"><p className="text-xs font-semibold text-[#7a8992]">Account</p><p className="truncate text-sm font-medium text-[#314958]">{user?.email || 'Authenticated owner'}</p></div></div><div className="flex items-center gap-3 rounded-xl bg-[#f6f4f0] p-4"><Building2 className="h-4 w-4 text-[#348d82]"/><div className="min-w-0"><p className="text-xs font-semibold text-[#7a8992]">Workspace</p><p className="truncate text-sm font-medium text-[#314958]">{currentOrganization?.name || 'EquiProfile Marketing'}</p></div></div></div></section>
      <section className="ep-card p-5 sm:p-6"><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#348d82]"/><h2 className="text-lg font-bold text-[#172c3d]">Security</h2></div><div className="mt-5 space-y-3"><div className="flex items-start gap-3 rounded-xl border border-[#d7e7e2] bg-[#f1f8f6] p-4"><Lock className="mt-0.5 h-4 w-4 text-[#348d82]"/><div><p className="text-sm font-bold text-[#294b45]">Multi-factor authentication required</p><p className="mt-1 text-xs leading-5 text-[#61727d]">Owner access remains protected by the Marketing MFA flow. This screen never displays setup secrets or recovery-code values.</p></div></div><div className="flex items-start gap-3 rounded-xl border border-[#e3ded7] bg-[#faf8f5] p-4"><Palette className="mt-0.5 h-4 w-4 text-[#2e6da4]"/><div><p className="text-sm font-bold text-[#314958]">EquiProfile visual theme</p><p className="mt-1 text-xs leading-5 text-[#61727d]">The client workspace uses the approved warm-light EquiProfile palette for consistent contrast and readability.</p></div></div></div></section>
    </div>
  </div>;
}
