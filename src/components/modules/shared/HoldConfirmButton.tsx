'use client';

import type { ReactNode, CSSProperties } from 'react';
import { useHoldConfirm } from '@/hooks/useHoldConfirm';

export interface HoldConfirmButtonProps {
  onConfirm: () => void;
  durationMs?: number;
  children: ReactNode;
  className?: string;
  /** Layout classes for the content wrapper (defaults to a centred row). */
  contentClassName?: string;
  disabled?: boolean;
  /** aria-label for screen readers (visible label may be an icon). */
  ariaLabel?: string;
  /**
   * Shown in a pill for a moment after a short tap, so a finger that lifted
   * too soon learns to keep holding.
   */
  hint?: string;
  /** Hint type size, so a corner-sized widget doesn't get a wall-sized pill. */
  hintFontSize?: number;
  /**
   * Where the hint pill sits: over the top of the button (`inside`, for a
   * button wide enough to hold the sentence) or above it (`above`, for a
   * square one whose sentence is wider than itself).
   */
  hintPlacement?: 'inside' | 'above';
  /** With `above`: how far over the button the hint sits, px (clear of a word over the button row, say). */
  hintGap?: number;
  /** Corner radius and any other box styling from the sizing model. */
  style?: CSSProperties;
  /** Merged over `style` while a finger is holding it (a red border on a button whose border is styled inline). */
  holdingStyle?: CSSProperties;
}

/**
 * Button that requires a press-and-hold before firing onConfirm: for an
 * action on the wall that a passing tap must not set off (sleep the display,
 * stop a routine). Renders a red sweep that fills left-to-right during the
 * hold, turns its border red while held, and flashes `hint` after a tap that
 * let go too early.
 */
export function HoldConfirmButton({
  onConfirm,
  durationMs = 1000,
  children,
  className = '',
  contentClassName = 'flex items-center justify-center gap-2',
  disabled = false,
  ariaLabel,
  hint,
  hintFontSize = 20,
  hintPlacement = 'inside',
  hintGap,
  style,
  holdingStyle,
}: HoldConfirmButtonProps) {
  const { progress, isHolding, releasedEarly, onPointerDown, onPointerUp, onPointerCancel } = useHoldConfirm({
    durationMs,
    onConfirm,
  });

  const hintStyle: CSSProperties = {
    fontSize: hintFontSize,
    paddingInline: hintFontSize * 0.7,
    paddingBlock: hintFontSize * 0.18,
    ...(hintPlacement === 'above' ? { bottom: `calc(100% + ${hintGap ?? hintFontSize * 0.6}px)` } : { top: 4 }),
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={disabled ? undefined : onPointerDown}
      onPointerUp={disabled ? undefined : onPointerUp}
      onPointerCancel={disabled ? undefined : onPointerCancel}
      onPointerLeave={disabled ? undefined : onPointerUp}
      className={`relative select-none touch-none ${isHolding ? 'border-red-400' : ''} ${className}`}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', ...style, ...(isHolding ? holdingStyle : undefined) }}
    >
      {/* The sweep clips to the button's own corners; the button itself does
          not clip, so a hint placed above it stays visible. */}
      <span aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none" style={{ borderRadius: 'inherit' }}>
        <span
          data-testid="hold-sweep"
          style={{ width: `${progress * 100}%` }}
          className="absolute inset-y-0 left-0 bg-red-500/25 transition-[width] duration-75"
        />
      </span>
      {releasedEarly && hint && (
        <span
          role="status"
          style={hintStyle}
          className="absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-white font-semibold leading-tight text-black pointer-events-none shadow-lg"
        >
          {hint}
        </span>
      )}
      <span className={`relative z-10 ${contentClassName}`}>{children}</span>
    </button>
  );
}
