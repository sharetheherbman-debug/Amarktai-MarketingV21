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
  useEffect(() => { let active = true; void checkAuth().finally(() => { if (active) setAuthChecked(true); }); return () => { active = false; }; }, [checkAuth]);
  useEffect(() => { if (authChecked && !isLoading && !isAuthenticated) router.replace('/login'); }, [authChecked, isLoading, isAuthenticated, router]);

  if (!authChecked || isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#f7f5f1]"><div className="h-9 w-9 animate-spin rounded-full border-2 border-[#d7d0c7] border-t-[#2e6da4]" /></div>;
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#f7f5f1] text-[#172c3d]">
      <DashboardSidebar />
      <div className={cn('flex min-h-screen min-w-0 flex-col transition-[margin] duration-300', sidebarOpen ? 'lg:ml-[272px]' : 'lg:ml-[76px]')}>
        <DashboardHeader />
        <main className="ep-workspace min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1480px] min-w-0">{children}</div>
        </main>
        <footer className="px-6 pb-6 text-center text-[11px] text-[#87939a]">© 2026 EquiProfile Marketing</footer>
      </div>
    </div>
  );
}
