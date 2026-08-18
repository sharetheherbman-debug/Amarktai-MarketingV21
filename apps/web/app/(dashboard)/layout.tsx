'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { cn } from '@/lib/utils';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const { sidebarOpen } = useUIStore();
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
    if (authChecked && !isLoading && !isAuthenticated) router.replace('/login');
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
        <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-5 md:p-6">
          <div className="mx-auto w-full max-w-[1480px] min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
