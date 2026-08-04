'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LucideIcon } from 'lucide-react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  onIconRightClick?: () => void;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon: Icon, iconRight: IconRight, onIconRightClick, hint, className, id, ...rest }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-white/70 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none">
              <Icon size={18} />
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={twMerge(
              clsx(
                'w-full h-10 rounded-lg bg-white/[0.05] border text-white placeholder:text-white/30',
                'transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                Icon ? 'pl-10' : 'pl-3.5',
                IconRight ? 'pr-10' : 'pr-3.5',
                error
                  ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500'
                  : 'border-white/[0.08] hover:border-white/[0.15]',
                className
              )
            )}
            {...rest}
          />
          {IconRight && (
            <button
              type="button"
              onClick={onIconRightClick}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
            >
              <IconRight size={18} />
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-red-400">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1.5 text-sm text-white/40">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
