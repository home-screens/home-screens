'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { FOCUSABLE, useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useTranslate } from '@/i18n';
import Button from './Button';
import ModalPortal from './ModalPortal';
import { FieldSurfaceProvider } from './FieldHint';

/**
 * Dismissal behaviour every dialog is expected to have: Escape closes, a click
 * on the backdrop closes, Tab stays inside, and the dialog is announced with
 * its own visible heading.
 *
 * The window inside is drawn from the parts below, so every editor window
 * looks and closes the same way:
 * - `ModalPanel`: the card, at most 85% of the screen tall.
 * - `ModalHeader`: the title (its id goes to `labelledBy`), an optional
 *   subtitle and actions, and the × with the Esc hint.
 * - `ModalBody`: the part that scrolls when the window outgrows the screen.
 * - `ModalFooter`: Cancel, then the one main action on the right.
 *
 * Pass `closable={false}` while a save or install is in flight so a stray
 * Escape can't orphan half-finished work, or for a window that must not be
 * left at all (the Wi-Fi rollback).
 *
 * A frame opened from inside another one (the plugin store's install window,
 * a picture picker over a settings window) is the only one that answers
 * Escape while it is up: one Escape closes one window, and a window that is
 * busy keeps the one underneath open too.
 */

/**
 * How a frame learns that another frame is open inside it. Counted through
 * the tree, not by which opened last: a window that is redrawn while its
 * inner window stays up (the plugin store after an install) must still
 * count as the one underneath.
 */
const OuterFrame = createContext<{ opened: () => void; closed: () => void } | null>(null);

export default function ModalFrame({
  label,
  labelledBy,
  onClose,
  closable = true,
  className,
  backdropClassName = 'bg-black/60',
  children,
}: {
  /** Fallback announcement when there is no visible heading to point at. */
  label?: string;
  /** Id of the dialog's own `<h2>`; preferred over `label`. */
  labelledBy?: string;
  onClose: () => void;
  closable?: boolean;
  className?: string;
  /** How dark the page behind goes. A window over another window dims a little less. */
  backdropClassName?: string;
  children: ReactNode;
}) {
  const outer = useContext(OuterFrame);
  const innerOpen = useRef(0);
  const self = useMemo(
    () => ({
      opened: () => { innerOpen.current += 1; },
      closed: () => { innerOpen.current -= 1; },
    }),
    [],
  );
  useEffect(() => {
    if (!outer) return;
    outer.opened();
    return outer.closed;
  }, [outer]);
  const closeIfOnTop = useCallback((event: KeyboardEvent) => {
    if (innerOpen.current !== 0) return;
    // Marked as handled: closing can finish between two listeners of one key
    // press, and the window underneath would then find nothing inside it
    // and close as well.
    event.preventDefault();
    onClose();
  }, [onClose]);
  // Every open frame hears the key; only the innermost one acts on it.
  useEscapeKey(closeIfOnTop, closable);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-modal flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
      >
        <div
          className={`absolute inset-0 ${backdropClassName}`}
          onClick={closable ? onClose : undefined}
          data-testid="modal-backdrop"
        />
        <OuterFrame.Provider value={self}>
          {/* A window is a roomy surface, so its hints take the page size. */}
          <FieldSurfaceProvider surface="page">
            <TrapLayer className={className}>{children}</TrapLayer>
          </FieldSurfaceProvider>
        </OuterFrame.Provider>
      </div>
    </ModalPortal>
  );
}

/**
 * The trapped panel, as its own component so the trap lives *inside* the
 * portal. `ModalPortal` renders nothing until its own mount effect has a DOM
 * target, so a `useFocusTrap` called from `ModalFrame` itself would run its
 * effect one commit too early, find a null ref and never attach again.
 */
function TrapLayer({ className, children }: { className?: string; children: ReactNode }) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  // The trap starts on the first control, which in a window with a header is
  // its ×. A window opens on what it is for instead: the first control after
  // the ×, or the × when it holds nothing else.
  useEffect(() => {
    const panel = trapRef.current;
    if (!panel || !(document.activeElement instanceof HTMLElement) || !document.activeElement.hasAttribute(CLOSE_ATTR)) return;
    [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => !el.hasAttribute(CLOSE_ATTR))?.focus();
  }, [trapRef]);

  return (
    <div ref={trapRef} className={`relative ${className ?? ''}`}>
      {children}
    </div>
  );
}

const CLOSE_ATTR = 'data-modal-close';

/**
 * The window's card. At most 85% of the screen tall, so a short window that
 * grows (a long error, a big list) scrolls in its `ModalBody` instead of
 * running off the screen. A window that should always be tall passes
 * `className="h-[85vh]"`.
 */
export function ModalPanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx('flex max-h-[85vh] w-full flex-col rounded-xl border border-hs-border-strong bg-hs-panel shadow-2xl', className)}>
      {children}
    </div>
  );
}

/**
 * The top bar of every editor window: one title size, an optional icon and
 * subtitle beside it, and on the right the caller's actions, then the Esc
 * hint and a lucide × with a 28px hit area. With no `onClose` there is no ×
 * (a window that can only be answered from its footer). While `closable` is
 * off the × is greyed and says why through `closeBlockedHint`, and the Esc
 * hint hides, since Escape does nothing then.
 */
export function ModalHeader({
  titleId,
  title,
  subtitle,
  icon,
  actions,
  onClose,
  closable = true,
  closeBlockedHint,
}: {
  /** Also passed to `ModalFrame`'s `labelledBy`. */
  titleId: string;
  title: ReactNode;
  /** Beside the title: a count, a line with its own pieces, or the window's tabs. */
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Before the ×: a link out, a mode switch. Never a second way to close. */
  actions?: ReactNode;
  onClose?: () => void;
  closable?: boolean;
  closeBlockedHint?: string;
}) {
  const tCore = useTranslate('core');
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-hs-border-strong px-5 py-3">
      {icon}
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 id={titleId} className="text-sm font-semibold text-hs-text-primary">{title}</h2>
        {subtitle != null && subtitle !== '' && <div className="text-xs text-hs-text-muted">{subtitle}</div>}
      </div>
      {actions}
      {onClose && (
        <div className="flex shrink-0 items-center gap-2">
          {closable && <EscHint />}
          <button
            type="button"
            onClick={onClose}
            disabled={!closable}
            title={!closable ? closeBlockedHint : undefined}
            aria-label={tCore('actions.close')}
            {...{ [CLOSE_ATTR]: '' }}
            className="flex h-7 w-7 items-center justify-center rounded text-hs-text-muted transition-colors hover:bg-hs-card hover:text-hs-text-body disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

/** The part of a window that scrolls; padded to line up with the header and footer. */
export function ModalBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)}>{children}</div>;
}

export interface ModalFooterAction {
  label: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** `submit` (with `form`) when the window's body is a form that Enter sends. */
  type?: 'button' | 'submit';
  form?: string;
  title?: string;
  icon?: ReactNode;
  testId?: string;
}

/**
 * The bottom bar of every editor window: Cancel (secondary) and then the one
 * main action on the right, in the main colour, or red when it deletes, so a
 * footer can't come out as two grey buttons. All are one size. `alternate`
 * is a second way forward between the two ("Switch anyway" beside "Scale to
 * fit"). `hint` is a short line on the left (why the action is off); `start`
 * holds anything else that belongs on the left, such as a Back.
 */
export function ModalFooter({
  hint,
  start,
  onCancel,
  cancelLabel,
  cancelDisabled,
  alternate,
  primary,
}: {
  hint?: ReactNode;
  start?: ReactNode;
  onCancel?: () => void;
  cancelLabel?: string;
  cancelDisabled?: boolean;
  alternate?: ModalFooterAction;
  /**
   * `danger` when the action deletes. `secondary` only when the window's main
   * action sits in its body instead (a saved password offered above a box to
   * type one).
   */
  primary?: ModalFooterAction & { variant?: 'primary' | 'danger' | 'secondary' };
}) {
  const tCore = useTranslate('core');
  const hasHint = hint != null && hint !== false && hint !== '';
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hs-border-strong px-5 py-3">
      {(start != null || hasHint) && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {start}
          {hasHint && <span className="text-xs text-hs-text-muted">{hint}</span>}
        </div>
      )}
      {onCancel && (
        <Button type="button" variant="secondary" onClick={onCancel} disabled={cancelDisabled}>
          {cancelLabel ?? tCore('actions.cancel')}
        </Button>
      )}
      {alternate && <FooterButton action={alternate} variant="secondary" />}
      {primary && <FooterButton action={primary} variant={primary.variant ?? 'primary'} />}
    </div>
  );
}

function FooterButton({ action, variant }: { action: ModalFooterAction; variant: 'primary' | 'danger' | 'secondary' }) {
  return (
    <Button
      type={action.type ?? 'button'}
      form={action.form}
      variant={variant}
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.title}
      data-testid={action.testId}
      className={clsx(action.icon != null && 'inline-flex items-center gap-1.5')}
    >
      {action.icon}
      {action.label}
    </Button>
  );
}

/** The "Esc closes this" hint every `ModalHeader` carries while its window can be closed. */
export function EscHint() {
  return (
    <kbd className="rounded border border-hs-border-strong px-1.5 py-0.5 font-mono text-[10px] text-hs-text-faint">
      Esc
    </kbd>
  );
}
