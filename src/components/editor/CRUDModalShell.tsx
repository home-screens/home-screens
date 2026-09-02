'use client';

import { type ReactNode } from 'react';
import ModalFrame from '@/components/ui/ModalFrame';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

interface CRUDModalShellProps {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  maxWidth?: string;
  headerActions?: ReactNode;
  hideFooter?: boolean;
  /** Suspend Escape and backdrop-click while a save or other action is in
   *  flight, so a stray keypress can't orphan it. Defaults to always closable,
   *  matching every caller before this took a ModalFrame underneath. */
  closable?: boolean;
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
  closable = true,
  onClose,
  children,
}: CRUDModalShellProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');

  return (
    <ModalFrame labelledBy="crud-modal-title" onClose={onClose} closable={closable} className={`w-full ${maxWidth}`}>
      <div className="bg-hs-panel border border-hs-border-strong rounded-xl w-full h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-hs-border-strong">
          <div className="flex items-center gap-3">
            {icon}
            <h2 id="crud-modal-title" className="text-sm font-semibold text-hs-text-primary">{title}</h2>
            {subtitle && (
              <span className="text-xs text-hs-text-muted">{subtitle}</span>
            )}
          </div>
          {headerActions ?? (
            <button
              onClick={onClose}
              disabled={!closable}
              aria-label={tCore('actions.close')}
              className="text-hs-text-muted hover:text-hs-text-body text-lg leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-hs-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              &times;
            </button>
          )}
        </div>

        {children}

        {!hideFooter && (
          <div className="flex items-center justify-end px-5 py-3 border-t border-hs-border-strong">
            <Button size="sm" variant="primary" onClick={onClose}>
              {t('modals.crud.done')}
            </Button>
          </div>
        )}
      </div>
    </ModalFrame>
  );
}
