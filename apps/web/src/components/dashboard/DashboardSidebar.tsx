'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Megaphone,
  FileText,
  Bot,
  BarChart3,
  Settings,
  Shield,
  Users,
  Cpu,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Dna,
  BookOpen,
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

const mainNav: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
      { label: 'Content', href: '/content', icon: FileText },
    ],
  },
  {
    title: 'AI',
    items: [
      { label: 'AI Agents', href: '/agents', icon: Bot },
      { label: 'Prompts', href: '/prompts', icon: FileText },
      { label: 'Brand DNA', href: '/brand-dna', icon: Dna },
      { label: 'Knowledge Base', href: '/knowledge', icon: BookOpen },
    ],
  },
  {
    title: 'Analytics',
    items: [{ label: 'Analytics', href: '/analytics', icon: BarChart3 }],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

const adminNav: NavSection[] = [
  {
    title: 'Admin',
    items: [
      { label: 'Providers', href: '/admin/providers', icon: Cpu },
      { label: 'Users', href: '/admin/users', icon: Users },
    ],
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar } = useUIStore();

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const sections = isAdmin ? [...mainNav, ...adminNav] : mainNav;

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/[0.06] glass transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-4">
        <Link href="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/20">
            <svg
              className="h-5 w-5 text-brand-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          {sidebarOpen && (
            <span className="text-lg font-bold text-white whitespace-nowrap">
              Amarkt<span className="text-brand-400">AI</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, i) => (
          <div key={i} className={cn(i > 0 && 'mt-6')}>
            {section.title && sidebarOpen && (
              <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {section.title}
              </h3>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={!sidebarOpen ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-brand-500/10 text-brand-400'
                        : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white',
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

      <div className="border-t border-white/[0.06] p-3">
        <div
          className={cn(
            'flex items-center gap-3 rounded-lg p-2',
            !sidebarOpen && 'justify-center'
          )}
        >
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-400">
              {user?.name ? getInitials(user.name) : 'U'}
            </div>
          )}
          {sidebarOpen && (
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <p className="truncate text-xs text-zinc-500">{user?.email}</p>
            </div>
          )}
          {sidebarOpen && (
            <button
              type="button"
              onClick={logout}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-red-400"
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
