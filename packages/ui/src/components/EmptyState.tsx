'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Inbox, type LucideIcon } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondaryAction,
  className,
}) => {
  return (
    <div
      className={twMerge(
        'flex flex-col items-center justify-center py-16 px-6 text-center',
        className
      )}
    >
      <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5">
        <Icon size={28} className="text-white/20" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-white/40 max-w-sm mb-6">{description}</p>
      )}
      <div className="flex items-center gap-3">
        {action && (
          <Button
            variant={action.variant || 'primary'}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
        {secondaryAction && (
          <Button variant="ghost" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
};

EmptyState.displayName = 'EmptyState';
