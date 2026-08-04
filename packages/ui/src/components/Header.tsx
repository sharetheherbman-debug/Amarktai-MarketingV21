'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Bell, Search, type LucideIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  active?: boolean;
}

export interface HeaderProps {
  logo?: React.ReactNode;
  navItems?: NavItem[];
  actions?: React.ReactNode;
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
  onSearch?: () => void;
  onNotificationClick?: () => void;
  notificationCount?: number;
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({
  logo,
  navItems,
  actions,
  user,
  onSearch,
  onNotificationClick,
  notificationCount = 0,
  className,
}) => {
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  return (
    <header
      className={twMerge(
        clsx(
          'flex items-center justify-between h-16 px-6',
          'bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]',
          'sticky top-0 z-40',
          className
        )
      )}
    >
      <div className="flex items-center gap-8">
        {logo && <div className="flex-shrink-0">{logo}</div>}

        {navItems && navItems.length > 0 && (
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className={clsx(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  item.active
                    ? 'text-white bg-white/[0.08]'
                    : 'text-white/50 hover:text-white hover:bg-white/[0.05]'
                )}
              >
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      <div className="flex items-center gap-3">
        {onSearch && (
          <button
            onClick={onSearch}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <Search size={18} />
          </button>
        )}

        {onNotificationClick && (
          <button
            onClick={onNotificationClick}
            className="relative p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <Bell size={18} />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
        )}

        {actions}

        {user && (
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
            >
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-sm font-medium">
                  {user.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
              )}
              <span className="hidden sm:block text-sm text-white/70">{user.name}</span>
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-56 py-1 bg-surface-100 border border-white/[0.08] rounded-xl shadow-xl z-50 animate-in fade-in slide-up">
                  <div className="px-4 py-3 border-b border-white/[0.06]">
                    <p className="text-sm font-medium text-white">{user.name}</p>
                    <p className="text-xs text-white/40 mt-0.5">{user.email}</p>
                  </div>
                  <div className="py-1">
                    <button className="w-full text-left px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.05] transition-colors">
                      Profile Settings
                    </button>
                    <button className="w-full text-left px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.05] transition-colors">
                      Billing
                    </button>
                    <button className="w-full text-left px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/[0.05] transition-colors">
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

Header.displayName = 'Header';
