'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  footer?: React.ReactNode;
}

const sizeStyles: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  size = 'md',
  children,
  closeOnOverlay = true,
  closeOnEscape = true,
  showCloseButton = true,
  footer,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEscape, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlay && e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={clsx(
        'fixed inset-0 z-50 flex items-center justify-center p-4',
        'bg-black/60 backdrop-blur-sm',
        'animate-in fade-in'
      )}
    >
      <div
        ref={contentRef}
        className={twMerge(
          clsx(
            'relative w-full rounded-xl',
            'bg-surface-100 border border-white/[0.08]',
            'shadow-2xl shadow-black/50',
            'animate-in slide-up',
            sizeStyles[size]
          )
        )}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between p-5 pb-0">
            <div>
              {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
              {description && <p className="mt-1 text-sm text-white/50">{description}</p>}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className="p-5">{children}</div>

        {footer && (
          <div className="px-5 py-4 border-t border-white/[0.06] flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

Modal.displayName = 'Modal';
