'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3, BookOpenCheck, BrainCircuit, CalendarRange, FileCheck2, FlaskConical,
  LayoutDashboard, LogOut, Megaphone, Palette, PanelLeft, Plug, Send, Settings,
  ShieldCheck, Sparkles, UsersRound,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn, getInitials } from '@/lib/utils';
import { MARKETING_BRAND_LOGO_URL, MARKETING_BRAND_NAME } from '@/lib/branding';

type NavItem = { label: string; href: string; icon: ComponentType<{ className?: string }> };
type NavSection = { title?: string; items: NavItem[] };

const navigation: NavSection[] = [
  { items: [
    { label: 'Command Centre', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Business Brain', href: '/business-brain', icon: BrainCircuit },
    { label: 'Research & Intelligence', href: '/intelligence', icon: FlaskConical },
  ] },
  { title: 'Plan & create', items: [
    { label: 'Strategy & Campaigns', href: '/campaigns', icon: Megaphone },
    { label: 'Content Studio', href: '/content-studio', icon: BookOpenCheck },
    { label: 'Creative Studio', href: '/creative-studio', icon: Palette },
    { label: 'Calendar & Production', href: '/content-studio/calendar', icon: CalendarRange },
  ] },
  { title: 'Reach & grow', items: [
    { label: 'Publish & Channels', href: '/social', icon: Send },
    { label: 'CRM', href: '/crm', icon: UsersRound },
    { label: 'Analytics & Optimisation', href: '/analytics', icon: BarChart3 },
  ] },
  { title: 'Team & operations', items: [
    { label: 'Marketing Team', href: '/marketing-team', icon: Sparkles },
    { label: 'Workflows & Approvals', href: '/approvals', icon: FileCheck2 },
    { label: 'Connections', href: '/connections', icon: Plug },
    { label: 'Usage & Safety', href: '/usage-safety', icon: ShieldCheck },
    { label: 'Settings', href: '/settings', icon: Settings },
  ] },
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const { user, logout, currentOrganization } = useAuthStore();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();

  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setSidebarOpen(false);
  };

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-[#031a35]/45 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/5 bg-[var(--ep-navy)] text-white shadow-[10px_0_32px_rgba(3,26,53,0.12)] transition-[width,transform] duration-200',
          sidebarOpen ? 'w-[280px] translate-x-0' : '-translate-x-full w-[280px] lg:w-[72px] lg:translate-x-0',
        )}
      >
        <div className="flex h-16 shrink-0 items-center px-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            aria-label="Toggle navigation"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          {sidebarOpen && (
            <Link href="/dashboard" onClick={closeOnMobile} className="ml-3 flex min-w-0 items-center gap-2.5">
              <img src={MARKETING_BRAND_LOGO_URL} alt={MARKETING_BRAND_NAME} className="h-10 w-auto max-w-[118px] shrink-0 object-contain" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[15px] font-semibold tracking-tight text-white">{MARKETING_BRAND_NAME}</p>
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-white/45">Marketing workspace</p>
              </div>
            </Link>
          )}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-1" aria-label="Marketing workspace">
          {navigation.map((section, sectionIndex) => (
            <div key={`${section.title || 'main'}-${sectionIndex}`} className={cn(sectionIndex > 0 && 'mt-4')}>
              {section.title && sidebarOpen && (
                <p className="mb-1 px-3 pt-1 text-[9px] font-bold uppercase tracking-[0.15em] text-white/38">{section.title}</p>
              )}

              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeOnMobile}
                      title={!sidebarOpen ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors',
                        active
                          ? 'bg-white/12 font-semibold text-white'
                          : 'text-white/78 hover:bg-white/8 hover:text-white',
                        !sidebarOpen && 'justify-center px-0',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-white/68')} />
                      {sidebarOpen && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <div className={cn('flex items-center gap-3 rounded-lg px-1 py-1.5', !sidebarOpen && 'justify-center px-0')}>
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="h-9 w-9 shrink-0 rounded-full border border-white/15 object-cover" />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-white">
                {user?.name ? getInitials(user.name) : 'U'}
              </div>
            )}

            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-none text-white">{user?.name || 'Workspace owner'}</p>
                <p className="mt-1.5 truncate text-[11px] text-white/55">{currentOrganization?.name || MARKETING_BRAND_NAME}</p>
              </div>
            )}

            {sidebarOpen && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
