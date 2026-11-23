'use client';

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type HTMLAttributes, type ReactNode } from 'react';
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

/* The stack the page's toasts land in, so two never sit in the same spot
   (an Undo under the backup reminder). Kept outside React state: a toast
   anywhere on the page finds it. A toast raised inside a window lands in
   that window's own stack instead (`WindowToastStack`). */
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
      className={STACK_CLASS}
      style={{ bottom: STACK_BOTTOM_PX }}
    />
  );
}

const STACK_CLASS = 'pointer-events-none fixed left-1/2 z-toast flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2';
/** The gap under the lowest toast, and between the two stacks: Tailwind's `bottom-4` and `gap-2`. */
const STACK_BOTTOM_PX = 16;
const STACK_GAP_PX = 8;

/** The stack of the window a toast is raised in; null on the page itself. */
const WindowStack = createContext<{ host: HTMLElement | null } | null>(null);

/**
 * A window's own toast stack, drawn inside the element that keeps Tab in the
 * window. A window is a modal dialog: a toast left in the page's stack is
 * outside it, so its button (Undo) could be clicked but never reached from
 * the keyboard. It sits where the page's stack does, and above whatever the
 * page's stack is showing, so the two never cover each other.
 */
export function WindowToastStack({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const pageStack = useSyncExternalStore(subscribe, () => stackHost, () => null);
  const [pageStackHeight, setPageStackHeight] = useState(0);
  useEffect(() => {
    if (!pageStack || typeof ResizeObserver === 'undefined') return;
    const measure = () => setPageStackHeight(pageStack.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pageStack);
    return () => observer.disconnect();
  }, [pageStack]);
  // A window whose toasts would not fit between its bottom edge and the
  // bottom of the screen (under the page's own stack, when that is up) puts
  // them at the top of the screen instead, as the phone holds them while a
  // form is open. At the bottom they sat on Done and Save, and lifted above
  // the buttons they sat on the box being typed in.
  const [roomBelow, setRoomBelow] = useState<number | null>(null);
  const [ownHeight, setOwnHeight] = useState(0);
  useEffect(() => {
    const frame = host?.parentElement;
    if (!host || !frame || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      setRoomBelow(window.innerHeight - frame.getBoundingClientRect().bottom);
      setOwnHeight(host.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(host);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [host]);
  const value = useMemo(() => ({ host }), [host]);
  const underPageStack = STACK_BOTTOM_PX + (pageStackHeight > 0 ? pageStackHeight + STACK_GAP_PX : 0);
  // Before a toast shows its height is unknown, so a usual one's is assumed.
  const atTop = roomBelow !== null && roomBelow < underPageStack + Math.max(ownHeight, TOAST_HEIGHT_PX) + STACK_GAP_PX;

  return (
    <WindowStack.Provider value={value}>
      {children}
      <div
        ref={setHost}
        data-testid="window-toast-stack"
        data-at-top={atTop || undefined}
        className={STACK_CLASS}
        style={atTop ? { top: STACK_BOTTOM_PX } : { bottom: underPageStack }}
      />
    </WindowStack.Provider>
  );
}

/** One toast's height, a line of words with its padding: what a window must leave free under it for its toasts to stay at the bottom. */
const TOAST_HEIGHT_PX = 52;

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
 * Raised inside a window it draws into that window's stack, where the
 * keyboard can reach it; anywhere else into the page's `ToastStack`. With no
 * stack on the page (a unit test of one component) it draws where it is.
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
  const pageHost = useSyncExternalStore(subscribe, () => stackHost, () => null);
  const windowStack = useContext(WindowStack);
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
  // A window's stack is in the page one commit after the window; the toast
  // waits for it, not drawn in the page's stack first and then moved.
  if (windowStack) return windowStack.host ? createPortal(toast, windowStack.host) : null;
  return pageHost ? createPortal(toast, pageHost) : toast;
}
