'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

const variantStyles: Record<string, string> = {
  default: 'bg-white/[0.03] backdrop-blur-xl border border-white/[0.06]',
  elevated: 'bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] shadow-xl shadow-black/20',
  outlined: 'bg-transparent border border-white/10',
};

const paddingStyles: Record<string, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-7',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'md',
  className,
  children,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={twMerge(
        clsx(
          'rounded-xl transition-all duration-200',
          variantStyles[variant],
          paddingStyles[padding],
          onClick && 'cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.1]',
          className
        )
      )}
    >
      {children}
    </div>
  );
};

Card.displayName = 'Card';
