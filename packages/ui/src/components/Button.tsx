'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2, type LucideIcon } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white shadow-sm shadow-brand-500/20',
  secondary:
    'bg-white/10 hover:bg-white/15 active:bg-white/20 text-white border border-white/10',
  ghost: 'bg-transparent hover:bg-white/10 active:bg-white/15 text-white',
  danger: 'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-sm shadow-red-500/20',
};

const sizeStyles: Record<string, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      icon: Icon,
      iconPosition = 'left',
      disabled,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={twMerge(
          clsx(
            'inline-flex items-center justify-center font-medium transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            variantStyles[variant],
            sizeStyles[size],
            fullWidth && 'w-full',
            className
          )
        )}
        {...rest}
      >
        {loading ? (
          <Loader2 className="animate-spin" size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
        ) : (
          Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
        )}
        {children}
        {!loading && Icon && iconPosition === 'right' && (
          <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
