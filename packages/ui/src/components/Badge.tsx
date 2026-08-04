'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'brand';
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}

const variantStyles: Record<string, string> = {
  default: 'bg-white/10 text-white/70 border-white/10',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  brand: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
};

const dotColors: Record<string, string> = {
  default: 'bg-white/50',
  success: 'bg-emerald-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
  brand: 'bg-brand-400',
};

const sizeStyles: Record<string, string> = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'md',
  className,
  children,
  dot = false,
}) => {
  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 font-medium rounded-full border',
          variantStyles[variant],
          sizeStyles[size],
          className
        )
      )}
    >
      {dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full', dotColors[variant])} />
      )}
      {children}
    </span>
  );
};

Badge.displayName = 'Badge';
