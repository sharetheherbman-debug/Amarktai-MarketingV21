'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Image,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Puzzle,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn, getInitials } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const workspaceNav: NavSection[] = [
  {
    items: [
      { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
      { label: 'Create', href: '/creative-studio', icon: Image },
      { label: 'Content', href: '/content-studio', icon: Sparkles },
      { label: 'Calendar', href: '/content-studio/calendar', icon: CalendarDays },
    ],
  },
  {
    title: 'Publish & measure',
    items: [
      { label: 'Publishing', href: '/social', icon: Share2 },
      { label: 'Analytics', href: '/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { label: 'Connections', href: '/connections', icon: Puzzle },
      { label: 'Automation & Safety', href: '/relaunch-control', icon: ShieldCheck },
      { label: 'Credits', href: '/billing', icon: Coins },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const sections = workspaceNav;
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'EquiProfile Marketing';

  return (
    <aside className={cn(
      'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#284b69] bg-[#1a3a5c] shadow-xl transition-all duration-300',
      sidebarOpen ? 'translate-x-0 lg:w-64' : '-translate-x-full lg:w-16 lg:translate-x-0'
    )}>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c5a55a]/20">
            <svg className="h-5 w-5 text-[#e2c982]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          {sidebarOpen && (
            <span className="max-w-[175px] truncate whitespace-nowrap text-sm font-bold text-white">
              {appName}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-blue-100 hover:bg-white/10 hover:text-white"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, sectionIndex) => (
          <div key={`${section.title || 'main'}-${sectionIndex}`} className={cn(sectionIndex > 0 && 'mt-6')}>
            {section.title && sidebarOpen && (
              <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-blue-200/70">
                {section.title}
              </h3>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={`${item.label}-${item.href}`}
                    href={item.href}
                    title={!sidebarOpen ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-blue-100/80 hover:bg-white/10 hover:text-white',
                      !sidebarOpen && 'justify-center'
                    )}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {sidebarOpen && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className={cn('flex items-center gap-3 rounded-lg p-2', !sidebarOpen && 'justify-center')}>
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
              {user?.name ? getInitials(user.name) : 'U'}
            </div>
          )}
          {sidebarOpen && (
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <p className="truncate text-xs text-blue-100/70">{user?.email}</p>
            </div>
          )}
          {sidebarOpen && (
            <button
              type="button"
              onClick={logout}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-blue-100/80 hover:bg-white/10 hover:text-white"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
