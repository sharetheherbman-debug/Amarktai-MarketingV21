'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Menu,
  ChevronDown,
  User,
  Settings,
  LogOut,
  Building2,
  Check,
} from 'lucide-react';
import { useAuthStore, type Organization } from '@/stores/auth.store';
import { useUIStore } from '@/stores/ui.store';
import { cn, getInitials } from '@/lib/utils';

const breadcrumbMap: Record<string, string> = {
  dashboard: 'Dashboard',
  campaigns: 'Campaigns',
  content: 'Content',
  agents: 'AI Agents',
  analytics: 'Analytics',
  settings: 'Settings',
  admin: 'Admin',
  providers: 'Providers',
  users: 'Users',
  connections: 'Connections',
  'creative-studio': 'Create',
  'content-studio': 'Content',
  'relaunch-control': 'Automation & Safety',
  billing: 'Credits',
};

export function DashboardHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, organizations, currentOrganization, setCurrentOrganization } =
    useAuthStore();
  const { toggleSidebar } = useUIStore();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const orgDropdownRef = useRef<HTMLDivElement>(null);

  const segments = pathname?.split('/').filter(Boolean) ?? [];
  const breadcrumbs = segments.map((seg) => ({
    label: breadcrumbMap[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1),
    href: '/' + segments.slice(0, segments.indexOf(seg) + 1).join('/'),
  }));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelectOrg(org: Organization) {
    setCurrentOrganization(org);
    setOrgDropdownOpen(false);
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[#e0dbd3] bg-white/95 px-4 shadow-sm backdrop-blur-xl sm:px-6">
      <button
        type="button"
        onClick={toggleSidebar}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[#1a3a5c] transition-colors hover:bg-[#f0ece6] lg:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div ref={orgDropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
          className="flex items-center gap-2 rounded-lg border border-[#e0dbd3] bg-[#f8f6f3] px-3 py-1.5 text-sm transition-colors hover:bg-[#f0ece6]"
        >
          {currentOrganization?.logo ? (
            <img
              src={currentOrganization.logo}
              alt={currentOrganization.name}
              className="h-5 w-5 rounded object-cover"
            />
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded bg-brand-500/20">
              <Building2 className="h-3 w-3 text-brand-400" />
            </div>
          )}
          <span className="max-w-[140px] truncate text-sm font-medium text-[#1a2e3e]">
            {currentOrganization?.name ?? 'Select Workspace'}
          </span>
          <ChevronDown
            className={cn(
                'h-3.5 w-3.5 text-[#5f6f7a] transition-transform',
              orgDropdownOpen && 'rotate-180'
            )}
          />
        </button>

        {orgDropdownOpen && (
          <div className="animate-fade-in absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-[#e0dbd3] bg-white p-1.5 shadow-xl">
            <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Workspaces
            </p>
            {organizations.length > 0 ? (
              organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => handleSelectOrg(org)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[#f0ece6]',
                    currentOrganization?.id === org.id
                      ? 'text-brand-400'
                      : 'text-[#334955]'
                  )}
                >
                  {org.logo ? (
                    <img
                      src={org.logo}
                      alt={org.name}
                      className="h-5 w-5 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-[#f0ece6]">
                      <Building2 className="h-3 w-3 text-zinc-400" />
                    </div>
                  )}
                  <span className="flex-1 truncate text-left">{org.name}</span>
                  {currentOrganization?.id === org.id && (
                    <Check className="h-4 w-4 text-brand-400" />
                  )}
                </button>
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-[#788791]">No workspace is available</p>
            )}
            <div className="my-1.5 border-t border-[#e0dbd3]" />
            <Link
              href="/settings"
              onClick={() => setOrgDropdownOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[#334955] transition-colors hover:bg-[#f0ece6]"
            >
              <Settings className="h-4 w-4" />
              Workspace Settings
            </Link>
          </div>
        )}
      </div>

      <nav className="hidden items-center gap-1.5 text-sm md:flex">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[#b0aaa2]">/</span>}
            {i === breadcrumbs.length - 1 ? (
              <span className="font-medium text-[#1a2e3e]">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="text-[#5f6f7a] transition-colors hover:text-[#1a3a5c]">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-[#f0ece6]"
          >
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/20 text-xs font-semibold text-brand-400">
                {user?.name ? getInitials(user.name) : 'U'}
              </div>
            )}
            <ChevronDown
              className={cn(
                'h-4 w-4 text-[#5f6f7a] transition-transform',
                dropdownOpen && 'rotate-180'
              )}
            />
          </button>

          {dropdownOpen && (
            <div className="animate-fade-in absolute right-0 top-full mt-2 w-56 rounded-xl border border-[#e0dbd3] bg-white p-1.5 shadow-xl">
              <div className="mb-1.5 border-b border-[#e0dbd3] px-3 py-2.5">
                <p className="text-sm font-medium text-[#1a2e3e]">{user?.name}</p>
                <p className="text-xs text-[#788791]">{user?.email}</p>
              </div>
              <Link
                href="/settings"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[#334955] transition-colors hover:bg-[#f0ece6]"
              >
                <User className="h-4 w-4" />
                Profile
              </Link>
              <Link
                href="/settings"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[#334955] transition-colors hover:bg-[#f0ece6]"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <div className="my-1.5 border-t border-[#e0dbd3]" />
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                  router.push('/login');
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
