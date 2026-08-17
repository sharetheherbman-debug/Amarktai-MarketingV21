'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3, CalendarDays, ChevronLeft, ChevronRight, Coins, Image, LayoutDashboard,
  LogOut, Megaphone, Puzzle, Settings, Share2, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn, getInitials } from '@/lib/utils';

type NavItem = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };
type NavSection = { title?: string; items: NavItem[] };

const navigation: NavSection[] = [
  { items: [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
    { label: 'Create', href: '/creative-studio', icon: Image },
    { label: 'Content', href: '/content-studio', icon: Sparkles },
    { label: 'Calendar', href: '/content-studio/calendar', icon: CalendarDays },
  ]},
  { title: 'Publish & measure', items: [
    { label: 'Publishing', href: '/social', icon: Share2 },
    { label: 'Connections', href: '/connections', icon: Puzzle },
    { label: 'Analytics', href: '/analytics', icon: BarChart3 },
  ]},
  { title: 'Workspace', items: [
    { label: 'Automation & Safety', href: '/relaunch-control', icon: ShieldCheck },
    { label: 'Credits', href: '/billing', icon: Coins },
    { label: 'Settings', href: '/settings', icon: Settings },
  ]},
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  const closeOnMobile = () => { if (typeof window !== 'undefined' && window.innerWidth < 1024) setSidebarOpen(false); };

  return (
    <>
      {sidebarOpen && <button type="button" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-[#102538]/35 backdrop-blur-[2px] lg:hidden" />}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-[272px] flex-col border-r border-white/10 bg-[#173754] text-white shadow-[12px_0_40px_rgba(17,39,57,0.12)] transition-all duration-300',
        sidebarOpen ? 'translate-x-0 lg:w-[272px]' : '-translate-x-full lg:w-[76px] lg:translate-x-0'
      )}>
        <div className="flex h-[76px] items-center border-b border-white/10 px-3">
          <Link href="/dashboard" onClick={closeOnMobile} className={cn('min-w-0 flex-1', sidebarOpen ? 'pr-2' : 'flex justify-center')}>
            {sidebarOpen ? (
              <div className="flex h-12 items-center rounded-xl bg-white px-3 shadow-sm">
                <img src="/logo.svg" alt="EquiProfile" className="h-8 w-full max-w-[190px] object-contain object-left" />
              </div>
            ) : <img src="/logo-icon.svg" alt="EquiProfile" className="h-10 w-10 rounded-xl shadow-sm" />}
          </Link>
          {sidebarOpen && <button type="button" onClick={toggleSidebar} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-blue-100 transition hover:bg-white/10 hover:text-white lg:flex" aria-label="Collapse navigation"><ChevronLeft className="h-4 w-4" /></button>}
          <button type="button" onClick={() => setSidebarOpen(false)} className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-blue-100 transition hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>
        </div>

        {!sidebarOpen && <button type="button" onClick={toggleSidebar} className="mx-auto mt-3 hidden h-9 w-9 items-center justify-center rounded-lg text-blue-100 transition hover:bg-white/10 hover:text-white lg:flex" aria-label="Expand navigation"><ChevronRight className="h-4 w-4" /></button>}

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {navigation.map((section, sectionIndex) => (
            <div key={`${section.title || 'main'}-${sectionIndex}`} className={cn(sectionIndex > 0 && 'mt-6')}>
              {section.title && sidebarOpen && <h3 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100/55">{section.title}</h3>}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                  return (
                    <Link key={item.href} href={item.href} onClick={closeOnMobile} title={!sidebarOpen ? item.label : undefined} className={cn(
                      'group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition',
                      active ? 'bg-white text-[#173754] shadow-sm' : 'text-blue-50/80 hover:bg-white/10 hover:text-white',
                      !sidebarOpen && 'justify-center px-0'
                    )}>
                      <item.icon className={cn('h-[18px] w-[18px] shrink-0', active && 'text-[#2e6da4]')} />
                      {sidebarOpen && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className={cn('flex items-center gap-3 rounded-xl bg-white/[0.07] p-2.5', !sidebarOpen && 'justify-center bg-transparent p-1')}>
            {user?.avatar ? <img src={user.avatar} alt={user.name} className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#b99a55] text-xs font-bold text-[#173754]">{user?.name ? getInitials(user.name) : 'U'}</div>}
            {sidebarOpen && <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{user?.name || 'Workspace owner'}</p><p className="truncate text-[11px] text-blue-100/65">EquiProfile Marketing</p></div>}
            {sidebarOpen && <button type="button" onClick={logout} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-blue-100/70 transition hover:bg-white/10 hover:text-white" aria-label="Logout"><LogOut className="h-4 w-4" /></button>}
          </div>
        </div>
      </aside>
    </>
  );
}
