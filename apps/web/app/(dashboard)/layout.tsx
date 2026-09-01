'use client';

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarRange, LayoutDashboard, Megaphone, MoreHorizontal, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { cn } from '@/lib/utils';
import { MARKETING_EMBEDDED_SSO_ONLY, MARKETING_HOST_RETURN_URL } from '@/lib/branding';

type MobileNavItem = { label: string; href: string; icon: ComponentType<{ className?: string }> };

const mobileNav: MobileNavItem[] = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Create', href: '/create', icon: Sparkles },
  { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { label: 'Calendar', href: '/content-studio/calendar', icon: CalendarRange },
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '/dashboard';
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    useUIStore.getState().setTheme('light');
    if (window.matchMedia('(max-width: 1023px)').matches) useUIStore.getState().setSidebarOpen(false);
  }, []);

  useEffect(() => {
    let active = true;
    void checkAuth().finally(() => {
      if (active) setAuthChecked(true);
    });
    return () => { active = false; };
  }, [checkAuth]);

  useEffect(() => {
    if (!authChecked || isLoading || isAuthenticated) return;
    if (MARKETING_EMBEDDED_SSO_ONLY) {
      window.location.replace(MARKETING_HOST_RETURN_URL);
      return;
    }
    router.replace('/login');
  }, [authChecked, isLoading, isAuthenticated, router]);

  if (!authChecked || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--ep-page)]">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--ep-border)] border-t-[var(--ep-blue)]" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[var(--ep-page)] text-[var(--ep-text)]">
      <DashboardSidebar />
      <div
        className={cn(
          'flex min-h-screen min-w-0 flex-col transition-[margin] duration-200',
          sidebarOpen ? 'lg:ml-[280px]' : 'lg:ml-[72px]',
        )}
      >
        <DashboardHeader />
        <main className="min-w-0 flex-1 overflow-x-hidden p-3 pb-24 sm:p-5 sm:pb-24 md:p-6 md:pb-24 lg:pb-6">
          <div className="mx-auto w-full max-w-[1480px] min-w-0">{children}</div>
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--ep-border)] bg-white/95 backdrop-blur-md lg:hidden" aria-label="Mobile navigation">
        <div className="flex h-16 items-stretch">
          {mobileNav.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                  active ? 'text-[var(--ep-blue)]' : 'text-[var(--ep-text-muted)] hover:text-[var(--ep-text)]',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-[var(--ep-text-muted)] transition-colors hover:text-[var(--ep-text)]"
            aria-label="More modules"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
