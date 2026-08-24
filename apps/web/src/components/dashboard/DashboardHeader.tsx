'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Menu, Settings, User } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn, getInitials } from '@/lib/utils';
import { MARKETING_BRAND_NAME } from '@/lib/branding';

const pageNames: Record<string, string> = {
  dashboard: 'Command Centre',
  'business-brain': 'Business Brain',
  intelligence: 'Research & Intelligence',
  campaigns: 'Strategy & Campaigns',
  'content-studio': 'Content Studio',
  'creative-studio': 'Creative Studio',
  social: 'Publish & Channels',
  crm: 'CRM',
  analytics: 'Analytics & Optimisation',
  'marketing-team': 'Marketing Team',
  approvals: 'Workflows & Approvals',
  connections: 'Connections',
  integrations: 'Connections',
  'usage-safety': 'Usage & Safety',
  settings: 'Settings',
};

export function DashboardHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { setSidebarOpen } = useUIStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const segment = pathname?.split('/').filter(Boolean)[0] || 'dashboard';
  const pageName = pageNames[segment] || segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const signOut = async () => {
    setProfileOpen(false);
    await logout();
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-[var(--ep-border)] bg-white/95 px-2 backdrop-blur-md lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-[var(--ep-navy)] transition hover:bg-[var(--ep-blue-soft)]"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="truncate text-sm font-semibold tracking-tight text-[var(--ep-text)]">{pageName}</span>
      </div>

      <div ref={profileRef} className="relative">
        <button
          type="button"
          onClick={() => setProfileOpen((open) => !open)}
          className="flex items-center gap-1 rounded-lg p-1.5 transition hover:bg-[var(--ep-blue-soft)]"
          aria-label="Open account menu"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="h-8 w-8 rounded-full border border-[var(--ep-border)] object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ep-navy)] text-[10px] font-semibold text-white">
              {user?.name ? getInitials(user.name) : 'U'}
            </div>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 text-[var(--ep-text-muted)] transition', profileOpen && 'rotate-180')} />
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-xl border border-[var(--ep-border)] bg-white p-2 shadow-[var(--ep-shadow-float)]">
            <div className="border-b border-[var(--ep-border)] px-3 pb-3 pt-2">
              <p className="truncate text-sm font-semibold text-[var(--ep-text)]">{user?.name || 'Account'}</p>
              <p className="truncate text-xs text-[var(--ep-text-muted)]">{user?.email || MARKETING_BRAND_NAME}</p>
            </div>
            <Link href="/settings" onClick={() => setProfileOpen(false)} className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--ep-text)] hover:bg-[var(--ep-blue-soft)]">
              <User className="h-4 w-4" /> Profile & settings
            </Link>
            <Link href="/settings" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--ep-text)] hover:bg-[var(--ep-blue-soft)]">
              <Settings className="h-4 w-4" /> Workspace settings
            </Link>
            <button type="button" onClick={() => void signOut()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--ep-danger)] hover:bg-[var(--ep-danger-soft)]">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
