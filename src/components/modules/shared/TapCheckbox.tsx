'use client';

import type { CSSProperties } from 'react';
import { ink } from '@/lib/constants';

/** Default box size: a comfortable fingertip target on a 1080-wide wall. */
export const TAP_CHECKBOX_SIZE = 38;

/** Accent used when a module has no colour of its own (matches the mockup). */
export const TAP_CHECKBOX_ACCENT = '#3b82f6';

/**
 * The one checkbox every tappable module on the wall shares (interactive
 * todo, chore chart when tap-to-complete is on): a rounded box with a soft
 * outer ring so it reads as a control, a pressed state while the tap is in
 * flight (ring grows, box tints), and a filled check when done. Purely
 * presentational: the row or column around it owns the button semantics.
 */
export function TapCheckbox({
  checked,
  pressed = false,
  color = TAP_CHECKBOX_ACCENT,
  size = TAP_CHECKBOX_SIZE,
  style,
}: {
  checked: boolean;
  pressed?: boolean;
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  const radius = Math.round(size * 0.29);
  const border = Math.max(2, Math.round(size * 0.066));
  const ring = pressed
    ? `0 0 0 ${Math.round(size * 0.21)}px ${withAlpha(color, 0.22)}`
    : checked
      ? 'none'
      : `0 0 0 ${Math.round(size * 0.105)}px ${ink(0.06)}`;
  return (
    <span
      data-testid="tap-checkbox"
      data-checked={checked ? '' : undefined}
      data-pressed={pressed ? '' : undefined}
      aria-hidden="true"
      className="inline-flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        boxSizing: 'border-box',
        border: `${border}px solid ${checked || pressed ? color : ink(0.55)}`,
        backgroundColor: checked ? color : pressed ? withAlpha(color, 0.25) : 'transparent',
        boxShadow: ring,
        transition: 'background-color 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
        ...style,
      }}
    >
      {checked && (
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {/* White for contrast on the accent fill it sits in: chip ink, not card ink. */}
          <path d="M5 12.5L10 17.5L19 7" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/** Colour at an alpha; hex colours get a real alpha, anything else falls back to a neutral tint. */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(hex[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
