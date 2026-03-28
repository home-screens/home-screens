'use client';

import { useEffect, useCallback } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useConfirmStore } from '@/stores/confirm-store';
import Button from './Button';

export default function ConfirmModal() {
  const { open, options, isAlert, respond } = useConfirmStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') respond(false);
      if (e.key === 'Enter') respond(true);
    },
    [open, respond],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const trapRef = useFocusTrap<HTMLDivElement>();

  if (!open) return null;

  const variant = options.variant ?? 'danger';

  return (
    <div className="fixed inset-0 z-confirm flex items-center justify-center bg-black/60" role="dialog" aria-modal="true" aria-label={options.title ?? 'Confirm'}>
      <div ref={trapRef} className="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-sm shadow-2xl">
        {options.title && (
          <div className="px-5 pt-4 pb-0">
            <h3 className="text-sm font-semibold text-neutral-100">{options.title}</h3>
          </div>
        )}
        <div className="px-5 py-4">
          <p className="text-sm text-neutral-300 leading-relaxed">{options.message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-4">
          {!isAlert && (
            <Button variant="secondary" size="sm" onClick={() => respond(false)}>
              {options.cancelLabel ?? 'Cancel'}
            </Button>
          )}
          <Button variant={variant} size="sm" onClick={() => respond(true)}>
            {options.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}
