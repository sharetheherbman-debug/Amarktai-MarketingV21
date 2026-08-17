'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, Check, ChevronDown, LogOut, Menu, Settings, User } from 'lucide-react';
import { useAuthStore, type Organization } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn, getInitials } from '@/lib/utils';

const pageNames: Record<string, string> = {
  dashboard: 'Overview', campaigns: 'Campaigns', connections: 'Connections', analytics: 'Analytics',
  settings: 'Settings', 'creative-studio': 'Create', 'content-studio': 'Content',
  'relaunch-control': 'Automation & Safety', billing: 'Credits', social: 'Publishing',
};

export function DashboardHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, organizations, currentOrganization, setCurrentOrganization } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const segment = pathname?.split('/').filter(Boolean)[0] || 'dashboard';
  const pageName = pageNames[segment] || segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
      if (workspaceRef.current && !workspaceRef.current.contains(event.target as Node)) setWorkspaceOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const chooseWorkspace = (org: Organization) => { setCurrentOrganization(org); setWorkspaceOpen(false); };

  return (
    <header className="sticky top-0 z-20 flex h-[76px] shrink-0 items-center gap-3 border-b border-[#e1dbd2] bg-[#fbfaf8]/95 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <button type="button" onClick={toggleSidebar} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#ddd6cc] bg-white text-[#173754] shadow-sm transition hover:bg-[#f2eee8] lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a8992]">EquiProfile Marketing</p><p className="truncate text-base font-bold text-[#172c3d]">{pageName}</p></div>
      <div className="flex-1" />

      <div ref={workspaceRef} className="relative hidden sm:block">
        <button type="button" onClick={() => setWorkspaceOpen((open) => !open)} className="flex max-w-[250px] items-center gap-2 rounded-xl border border-[#ddd6cc] bg-white px-3 py-2 text-sm shadow-sm transition hover:bg-[#f7f5f1]">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f1f7] text-[#2e6da4]"><Building2 className="h-4 w-4" /></div>
          <span className="truncate font-semibold text-[#243d4e]">{currentOrganization?.name || 'Workspace'}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-[#7a8992] transition', workspaceOpen && 'rotate-180')} />
        </button>
        {workspaceOpen && (
          <div className="absolute right-0 top-full mt-2 w-72 overflow-hidden rounded-2xl border border-[#ddd6cc] bg-white p-2 shadow-xl">
            <p className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7a8992]">Workspace</p>
            {organizations.length ? organizations.map((org) => (
              <button key={org.id} type="button" onClick={() => chooseWorkspace(org)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[#314958] transition hover:bg-[#f4f1ec]">
                <Building2 className="h-4 w-4 text-[#648197]" /><span className="min-w-0 flex-1 truncate font-medium">{org.name}</span>{currentOrganization?.id === org.id && <Check className="h-4 w-4 text-[#348d82]" />}
              </button>
            )) : <p className="px-3 py-2 text-sm text-[#7a8992]">No workspace available</p>}
            <div className="my-2 border-t border-[#ebe6df]" />
            <Link href="/settings" onClick={() => setWorkspaceOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[#314958] hover:bg-[#f4f1ec]"><Settings className="h-4 w-4" /> Workspace settings</Link>
          </div>
        )}
      </div>

      <div ref={profileRef} className="relative">
        <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex items-center gap-2 rounded-xl border border-transparent p-1.5 transition hover:border-[#ddd6cc] hover:bg-white" aria-label="Open account menu">
          {user?.avatar ? <img src={user.avatar} alt={user.name} className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#173754] text-xs font-bold text-white">{user?.name ? getInitials(user.name) : 'U'}</div>}
          <ChevronDown className={cn('hidden h-4 w-4 text-[#7a8992] transition sm:block', profileOpen && 'rotate-180')} />
        </button>
        {profileOpen && (
          <div className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-2xl border border-[#ddd6cc] bg-white p-2 shadow-xl">
            <div className="border-b border-[#ebe6df] px-3 pb-3 pt-2"><p className="truncate text-sm font-semibold text-[#172c3d]">{user?.name || 'Account'}</p><p className="truncate text-xs text-[#7a8992]">EquiProfile Marketing</p></div>
            <Link href="/settings" onClick={() => setProfileOpen(false)} className="mt-2 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[#314958] hover:bg-[#f4f1ec]"><User className="h-4 w-4" /> Profile & settings</Link>
            <button type="button" onClick={() => { setProfileOpen(false); logout(); router.push('/login'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[#a33f3f] hover:bg-[#fff3f1]"><LogOut className="h-4 w-4" /> Logout</button>
          </div>
        )}
      </div>
    </header>
  );
}
