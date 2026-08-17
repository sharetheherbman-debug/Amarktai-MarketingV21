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
    if (window.matchMedia('(max-width: 1023px)').matches) {
      useUIStore.getState().setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void checkAuth().finally(() => {
      if (active) setAuthChecked(true);
    });
    return () => {
      active = false;
    };
  }, [checkAuth]);

  useEffect(() => {
    if (authChecked && !isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authChecked, isLoading, isAuthenticated, router]);

  if (!authChecked || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-sm text-[#5f6f7a]">Checking your secure session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <DashboardSidebar />
      <div
        className={cn(
          'flex flex-1 flex-col overflow-hidden transition-all duration-300',
          sidebarOpen ? 'ml-0 lg:ml-64' : 'ml-0 lg:ml-16'
        )}
      >
        <DashboardHeader />
        <main className="client-page flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          <footer className="mx-auto mt-10 max-w-[1500px] border-t border-[#e0dbd3] py-6 text-center text-xs text-[#788791]">
            © 2026 EquiProfile Marketing
          </footer>
        </main>
      </div>
    </div>
  );
}
