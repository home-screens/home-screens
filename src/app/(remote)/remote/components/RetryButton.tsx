'use client';

import { useState, type CSSProperties } from 'react';
import { RotateCw } from 'lucide-react';
import { useTranslate } from '@/i18n';

/**
 * Try again, with the wait shown on the button while the hub asks: the icon
 * turns and the button rests until the retry settles, so a slow answer on the
 * home Wi-Fi does not read as a tap that missed.
 */
export function RetryButton({ onRetry, style }: { onRetry: () => Promise<unknown> | void; style?: CSSProperties }) {
  const t = useTranslate('remote');
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="press-btn"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={async () => {
        setBusy(true);
        try {
          await onRetry();
        } finally {
          setBusy(false);
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        minHeight: 44,
        padding: '0 16px',
        borderRadius: 12,
        border: 'none',
        background: 'var(--hs-bg-hover)',
        color: 'var(--hs-text-primary)',
        fontSize: 14,
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        opacity: busy ? 0.7 : 1,
        ...style,
      }}
    >
      <RotateCw size={15} strokeWidth={2} aria-hidden className={busy ? 'animate-spin' : undefined} />
      {t('loadFailed.retry')}
    </button>
  );
}

/**
 * What a phone tab (or one page of it) shows when its data could not be
 * read: the reason in one line, and Try again under it. Every tab says it
 * this way, so a Wi-Fi blip looks the same wherever it lands, and "nothing
 * set up yet" is never shown for data that is still there.
 */
export function LoadFailed({ message, onRetry, testId, style }: {
  message: string;
  onRetry: () => Promise<unknown> | void;
  testId?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        marginTop: 12,
        padding: 16,
        borderRadius: 14,
        background: 'var(--hs-bg-card)',
        border: '1px solid var(--hs-border-strong)',
        ...style,
      }}
    >
      <p role="alert" style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: 'var(--hs-text-faint)' }}>{message}</p>
      <RetryButton onRetry={onRetry} style={{ marginTop: 12 }} />
    </div>
  );
}
