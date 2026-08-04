'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';

export interface SidebarItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  badge?: string | number;
  children?: SidebarItem[];
}

export interface SidebarProps {
  items: SidebarItem[];
  activeItem?: string;
  onItemClick?: (item: SidebarItem) => void;
  collapsed?: boolean;
  onToggle?: () => void;
  logo?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  activeItem,
  onItemClick,
  collapsed = false,
  onToggle,
  logo,
  footer,
  className,
}) => {
  const [expandedItems, setExpandedItems] = React.useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderItem = (item: SidebarItem, depth: number = 0) => {
    const isActive = activeItem === item.id;
    const isExpanded = expandedItems.has(item.id);
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleExpand(item.id);
            } else {
              onItemClick?.(item);
            }
          }}
          className={twMerge(
            clsx(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
              depth > 0 && 'pl-10',
              isActive
                ? 'bg-brand-500/10 text-brand-400'
                : 'text-white/50 hover:text-white/80 hover:bg-white/[0.05]',
              collapsed && 'justify-center px-2'
            )
          )}
          title={collapsed ? item.label : undefined}
        >
          <item.icon size={collapsed ? 20 : 18} className="flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/60">
                  {item.badge}
                </span>
              )}
              {hasChildren && (
                <ChevronRight
                  size={14}
                  className={clsx(
                    'transition-transform duration-200',
                    isExpanded && 'rotate-90'
                  )}
                />
              )}
            </>
          )}
        </button>
        {hasChildren && isExpanded && !collapsed && (
          <div className="mt-1">{item.children!.map((child) => renderItem(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={twMerge(
        clsx(
          'flex flex-col h-full bg-surface-100 border-r border-white/[0.06] transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
          className
        )
      )}
    >
      {logo && (
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          {!collapsed && logo}
          {onToggle && (
            <button
              onClick={onToggle}
              className={clsx(
                'p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors',
                collapsed && 'mx-auto'
              )}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {items.map((item) => renderItem(item))}
      </nav>

      {footer && (
        <div className="p-3 border-t border-white/[0.06]">{footer}</div>
      )}
    </aside>
  );
};

Sidebar.displayName = 'Sidebar';
