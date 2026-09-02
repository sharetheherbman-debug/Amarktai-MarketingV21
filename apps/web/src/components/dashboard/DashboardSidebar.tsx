'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  BrainCircuit,
  CalendarRange,
  CheckCircle2,
  Library,
  LayoutDashboard,
  LogOut,
  Megaphone,
  PanelLeft,
  PlugZap,
  Settings,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn, getInitials } from '@/lib/utils';
import {
  MARKETING_BRAND_LOGO_URL,
  MARKETING_BRAND_NAME,
  MARKETING_EMBEDDED_SSO_ONLY,
  MARKETING_HOST_RETURN_URL,
} from '@/lib/branding';

type NavItem = { label: string; href: string; icon: ComponentType<{ className?: string }> };

const navigation: NavItem[] = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Business Brain', href: '/business-brain', icon: BrainCircuit },
  { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { label: 'Create', href: '/create', icon: Sparkles },
  { label: 'Library', href: '/library', icon: Library },
  { label: 'Calendar', href: '/content-studio/calendar', icon: CalendarRange },
  { label: 'Approvals', href: '/approvals', icon: CheckCircle2 },
  { label: 'Connections', href: '/connections', icon: PlugZap },
  { label: 'Marketing Team', href: '/marketing-team', icon: UsersRound },
  { label: 'Results', href: '/analytics', icon: BarChart3 },
  { label: 'Settings', href: '/settings', icon: Settings },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/create') {
    return pathname === '/create'
      || pathname === '/advertising'
      || pathname.startsWith('/content-studio/generate')
      || pathname.startsWith('/creative-studio');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const { user, logout, currentOrganization } = useAuthStore();
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  const brandLogo = currentOrganization?.logo || MARKETING_BRAND_LOGO_URL;
  const brandName = currentOrganization?.name || MARKETING_BRAND_NAME;

  const closeOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) setSidebarOpen(false);
  };

  const signOut = async () => {
    await logout();
    if (MARKETING_EMBEDDED_SSO_ONLY) {
      window.location.assign(MARKETING_HOST_RETURN_URL);
      return;
    }
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
              <img src={brandLogo} alt={brandName} className="h-10 w-auto max-w-[148px] shrink-0 object-contain" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-white/55">Marketing</p>
              </div>
            </Link>
          )}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Marketing workspace">
          {sidebarOpen && (
            <div className="mb-3 rounded-xl bg-white/8 px-3 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">What do you want to do?</p>
              <p className="mt-1 text-xs leading-5 text-white/72">Create marketing, run campaigns and see results.</p>
            </div>
          )}

          <div className="space-y-1">
            {navigation.map((item) => {
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
                    'flex h-11 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors',
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
                <p className="mt-1.5 truncate text-[11px] text-white/55">{brandName}</p>
              </div>
            )}

            {sidebarOpen && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/55 transition hover:bg-white/10 hover:text-white"
                aria-label={MARKETING_EMBEDDED_SSO_ONLY ? 'Exit Marketing' : 'Sign out'}
                title={MARKETING_EMBEDDED_SSO_ONLY ? 'Exit Marketing' : 'Sign out'}
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