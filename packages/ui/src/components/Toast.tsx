'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export interface ToastProps {
  id: string;
  variant?: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  onDismiss: (id: string) => void;
  duration?: number;
}

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  error: 'text-red-400 bg-red-500/10 border-red-500/20',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  info: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

const iconColorMap = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  info: 'text-blue-400',
};

export const Toast: React.FC<ToastProps> = ({
  id,
  variant = 'info',
  title,
  message,
  onDismiss,
  duration = 5000,
}) => {
  const [progress, setProgress] = React.useState(100);
  const [isPaused, setIsPaused] = React.useState(false);
  const Icon = iconMap[variant];

  React.useEffect(() => {
    if (isPaused) return;

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        onDismiss(id);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, id, isPaused, onDismiss]);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={twMerge(
        'relative w-80 overflow-hidden rounded-lg border backdrop-blur-xl',
        'animate-in slide-up',
        colorMap[variant]
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Icon size={18} className={clsx('flex-shrink-0 mt-0.5', iconColorMap[variant])} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{title}</p>
            {message && <p className="mt-1 text-xs text-white/50">{message}</p>}
          </div>
          <button
            onClick={() => onDismiss(id)}
            className="flex-shrink-0 p-0.5 rounded text-white/30 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="h-0.5 bg-white/[0.06]">
        <div
          className={clsx(
            'h-full transition-all duration-100 ease-linear',
            variant === 'success' && 'bg-emerald-500',
            variant === 'error' && 'bg-red-500',
            variant === 'warning' && 'bg-amber-500',
            variant === 'info' && 'bg-blue-500'
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

Toast.displayName = 'Toast';

interface ToastContainerProps {
  toasts: Array<{
    id: string;
    variant?: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
  }>;
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} {...t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

export function toast(
  variant: 'success' | 'error' | 'warning' | 'info',
  title: string,
  message?: string
) {
  const event = new CustomEvent('amarktai-toast', {
    detail: { variant, title, message },
  });
  window.dispatchEvent(event);
}

toast.success = (title: string, message?: string) => toast('success', title, message);
toast.error = (title: string, message?: string) => toast('error', title, message);
toast.warning = (title: string, message?: string) => toast('warning', title, message);
toast.info = (title: string, message?: string) => toast('info', title, message);
