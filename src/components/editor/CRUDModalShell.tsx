'use client';

import { useEffect, type ReactNode } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import Button from '@/components/ui/Button';

interface CRUDModalShellProps {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  maxWidth?: string;
  headerActions?: ReactNode;
  hideFooter?: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function CRUDModalShell({
  title,
  icon,
  subtitle,
  maxWidth = 'max-w-4xl',
  headerActions,
  hideFooter,
  onClose,
  children,
}: CRUDModalShellProps) {
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div ref={trapRef} className={`relative bg-neutral-900 border border-neutral-700 rounded-xl w-full ${maxWidth} h-[85vh] flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-700">
          <div className="flex items-center gap-3">
            {icon}
            <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
            {subtitle && (
              <span className="text-xs text-neutral-400">{subtitle}</span>
            )}
          </div>
          {headerActions ?? (
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-neutral-400 hover:text-neutral-200 text-lg leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-800 transition-colors"
            >
              &times;
            </button>
          )}
        </div>

        {/* Body */}
        {children}

        {/* Footer */}
        {!hideFooter && (
          <div className="flex items-center justify-end px-5 py-3 border-t border-neutral-700">
            <Button size="sm" variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
