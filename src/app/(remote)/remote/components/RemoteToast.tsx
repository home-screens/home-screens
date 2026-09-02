'use client';

import { dismissToast, useRemoteToast } from '../remote-toast';

/**
 * Renders the current remote toast just above the tab bar. Tap to dismiss.
 * `role="status"` keeps it polite for screen readers — these are outcomes,
 * not interruptions.
 */
export default function RemoteToast() {
  const toast = useRemoteToast();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-0 right-0 z-[90] flex justify-center px-5"
      style={{ bottom: 'calc(5.75rem + env(safe-area-inset-bottom))' }}
    >
      {toast && (
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
