'use client';

import { dismissToast, useRemoteToast, useToastFloor } from '../remote-toast';

/**
 * Renders the current remote toast just above the tab bar. Tap to dismiss.
 * `role="status"` keeps it polite for screen readers — these are outcomes,
 * not interruptions.
 *
 * `raisedBy` lifts it further when a tab pins its own bar above the tab bar
 * (the Lists tab's add bar), so an error never lands on top of the field
 * the person is typing into. Over the photo viewer it sits just above the
 * viewer's own panel (`setToastFloor`), off the buttons it would cover.
 */
export default function RemoteToast({ raisedBy = 0 }: { raisedBy?: number }) {
  const toast = useRemoteToast();
  const floor = useToastFloor();
  const bottom = floor !== null
    ? `${floor + 12}px`
    : `calc(5.75rem + ${raisedBy}px + env(safe-area-inset-bottom))`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-0 right-0 z-[90] flex justify-center px-5"
      style={{ bottom }}
    >
      {toast?.action ? (
        // A toast with a button: the message still closes it, the button acts.
        <div
          key={toast.id}
          data-testid="remote-toast"
          data-tone={toast.tone}
          className="pointer-events-auto flex max-w-full items-center gap-1 rounded-full border bg-hs-card border-hs-border-strong pl-4 pr-1.5 py-1 text-[13px] font-medium text-hs-text-primary shadow-[0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm"
        >
          <button type="button" onClick={dismissToast} className="min-h-[40px] text-left">
            {toast.message}
          </button>
          <button
            type="button"
            data-testid="remote-toast-action"
            onClick={() => {
              const { onPress } = toast.action!;
              dismissToast();
              onPress();
            }}
            className="min-h-[40px] rounded-full px-3.5 font-bold text-hs-accent"
          >
            {toast.action.label}
          </button>
        </div>
      ) : toast && (
        <button
          key={toast.id}
          type="button"
          onClick={dismissToast}
          data-testid="remote-toast"
          data-tone={toast.tone}
          className={`pointer-events-auto max-w-full rounded-full border px-4 py-2.5 text-[13px] font-medium shadow-[0_6px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-opacity ${
            toast.tone === 'error'
              ? 'bg-hs-danger/[0.18] border-hs-danger/40 text-hs-danger'
              : 'bg-hs-card border-hs-border-strong text-hs-text-primary'
          }`}
        >
          {toast.message}
        </button>
      )}
    </div>
  );
}
