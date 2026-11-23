'use client';

import type { CSSProperties } from 'react';

/**
 * The phone's one waiting ring. `accent` lights the turning edge amber for
 * something the person started (an upload, an import); `quiet` keeps it grey
 * where the wait is the page's own (a search, a library loading). The words
 * beside it, if any, say what is happening; the ring itself is hidden from
 * screen readers.
 */
export default function PhoneSpinner({ size = 18, tone = 'accent', style }: {
  size?: number;
  tone?: 'accent' | 'quiet';
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid="phone-spinner"
      className="animate-spin"
      style={{
        display: 'inline-block',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        boxSizing: 'border-box',
        border: `${size >= 18 ? 2.5 : 2}px solid var(--hs-border-strong)`,
        borderTopColor: tone === 'accent' ? 'var(--hs-accent)' : 'var(--hs-text-muted)',
        ...style,
      }}
    />
  );
}
