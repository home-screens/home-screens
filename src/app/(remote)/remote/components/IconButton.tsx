'use client';

import type { CSSProperties, ReactNode } from 'react';

/**
 * A 44 px square button holding only an icon: a banner's close ×, a − or +
 * step. `label` is what a screen reader says, since the icon says nothing.
 * `framed` draws the quiet bordered square used for step buttons; unframed
 * it is a bare target (a close × on a banner keeps the banner's own colour).
 */
export default function IconButton({
  label,
  onClick,
  children,
  disabled = false,
  framed = false,
  testId,
  style,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  framed?: boolean;
  testId?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      className="press-scale-xs"
      style={{
        flex: 'none',
        width: 44,
        height: 44,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        border: framed ? '1px solid var(--hs-border)' : 'none',
        background: framed ? 'var(--hs-bg-panel)' : 'transparent',
        color: framed ? 'var(--hs-text-muted)' : 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  );
}
