'use client';

import { useSyncExternalStore, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import Button from './Button';
import IconButton from './IconButton';

export type ToastTone = 'neutral' | 'warning' | 'danger';

const TONES: Record<ToastTone, { border: string; ink: string }> = {
  neutral: { border: 'border-hs-border-strong', ink: 'text-hs-text-body' },
  warning: { border: 'border-hs-warning/30', ink: 'text-hs-warning-ink' },
  danger: { border: 'border-hs-danger/50', ink: 'text-hs-danger' },
};

/* The one stack every editor toast lands in, so two never sit in the same
   spot (an Undo under the backup reminder). Kept outside React state: a
   toast anywhere in the tree, even inside a window, finds it. */
let stackHost: HTMLElement | null = null;
const listeners = new Set<() => void>();
function setStackHost(el: HTMLElement | null) {
  stackHost = el;
  listeners.forEach((notify) => notify());
}
function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}

/**
 * Where editor toasts appear: the bottom middle of the screen, newest at the
 * bottom, above every window. Rendered once, in the editor layout.
 */
export function ToastStack() {
  return (
    <div
      ref={setStackHost}
      data-testid="toast-stack"
      className="pointer-events-none fixed bottom-4 left-1/2 z-toast flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2"
    />
  );
}

export interface ToastAction {
  label: ReactNode;
  onClick: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
}

/**
 * A short message at the bottom of the editor with at most one action (Undo,
 * Back up now) and a way to wave it off. Announced to screen readers:
 * `status` by default, `alert` for a danger tone. The action button follows
 * the tone, `warning` on a warning and the main colour otherwise.
 *
 * It draws into the `ToastStack`; with no stack on the page (a unit test of
 * one component) it draws where it is.
 */
export default function Toast({
  tone = 'neutral',
  message,
  action,
  onDismiss,
  dismissLabel,
  role,
  testId,
  messageTestId,
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> & {
  tone?: ToastTone;
  message: ReactNode;
  action?: ToastAction;
  onDismiss?: () => void;
  /** Said by the × that waves it off; required with `onDismiss`. */
  dismissLabel?: string;
  role?: 'status' | 'alert';
  testId?: string;
  messageTestId?: string;
}) {
  const host = useSyncExternalStore(subscribe, () => stackHost, () => null);
  const look = TONES[tone];
  const Icon = action?.icon;
  const toast = (
    <div
      {...rest}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      data-testid={testId}
      className={clsx(
        'pointer-events-auto hs-toast-in flex items-center gap-3 rounded-lg border bg-hs-panel/95 px-4 py-3 shadow-lg shadow-black/30 backdrop-blur-sm',
        look.border,
      )}
    >
      <div className={clsx('text-sm', look.ink)} data-testid={messageTestId}>{message}</div>
      {action && (
        <Button
          size="sm"
          variant={tone === 'warning' ? 'warning' : 'primary'}
          onClick={action.onClick}
          disabled={action.disabled}
          className="inline-flex shrink-0 items-center gap-1.5"
        >
          {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
          {action.label}
        </Button>
      )}
      {onDismiss && dismissLabel && (
        <IconButton label={dismissLabel} tone="neutral" onClick={onDismiss} />
      )}
    </div>
  );
  return host ? createPortal(toast, host) : toast;
}
