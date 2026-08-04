'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
  fullScreen?: boolean;
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className,
  text,
  fullScreen = false,
}) => {
  const spinner = (
    <div className={twMerge('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className={clsx(
          'rounded-full border-2 border-white/10 border-t-brand-500 animate-spin',
          sizeMap[size]
        )}
      />
      {text && <p className="text-sm text-white/50">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return spinner;
};

Spinner.displayName = 'Spinner';
