'use client';

import { useId, type ReactNode } from 'react';
import ModalFrame, { ModalFooter, ModalHeader, ModalPanel } from '@/components/ui/ModalFrame';
import { useTranslate } from '@/i18n';

interface CRUDModalShellProps {
  title: string;
  icon?: ReactNode;
  /** Beside the title: a count, or a line with its own pieces (the meal planner's source pill). */
  subtitle?: ReactNode;
  maxWidth?: string;
  /** Before the ×: a link out (the meal planner's Open Mealie). Never a second way to close. */
  headerActions?: ReactNode;
  hideFooter?: boolean;
  /** Suspend Escape and backdrop-click while a save or other action is in
   *  flight, so a stray keypress can't orphan it. Defaults to always closable,
   *  matching every caller before this took a ModalFrame underneath. */
  closable?: boolean;
  /** Said on the greyed Done and × while `closable` is off, so it is clear what to do. */
  closeBlockedHint?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The big editor windows that manage family data (chores, meals, timetables,
 * notes, lists): a tall panel with the shared header, the caller's body, and
 * a Done in the footer.
 */
export default function CRUDModalShell({
  title,
  icon,
  subtitle,
  maxWidth = 'max-w-4xl',
  headerActions,
  hideFooter,
  closable = true,
  closeBlockedHint,
  onClose,
  children,
}: CRUDModalShellProps) {
  const t = useTranslate('editor');
  const titleId = useId();

  return (
    <ModalFrame labelledBy={titleId} onClose={onClose} closable={closable} className={`w-full ${maxWidth}`}>
      <ModalPanel className="h-[85vh]">
        <ModalHeader
          titleId={titleId}
          title={title}
          icon={icon}
          subtitle={subtitle}
          actions={headerActions}
          onClose={onClose}
          closable={closable}
          closeBlockedHint={closeBlockedHint}
        />

        {children}

        {!hideFooter && (
          <ModalFooter
            // Off whenever × is: closing then would drop work in progress (an open form, a save).
            hint={!closable ? closeBlockedHint : undefined}
            primary={{
              label: t('modals.crud.done'),
              onClick: onClose,
              disabled: !closable,
              title: !closable ? closeBlockedHint : undefined,
            }}
          />
        )}
      </ModalPanel>
    </ModalFrame>
  );
}
