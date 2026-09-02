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
   * Shown in a pill over the button for a moment after a short tap, so a
   * finger that lifted too soon learns to keep holding.
   */
  hint?: string;
}

/**
 * Button that requires a press-and-hold before firing onConfirm. Renders a
 * red sweep that fills left-to-right during the hold, turns its border red
 * while held, and flashes `hint` after a tap that let go too early.
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
}: HoldConfirmButtonProps) {
  const { progress, isHolding, releasedEarly, onPointerDown, onPointerUp, onPointerCancel } = useHoldConfirm({
    durationMs,
    onConfirm,
  });

  const fillStyle: CSSProperties = {
    width: `${progress * 100}%`,
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
      className={`relative overflow-hidden select-none touch-none ${isHolding ? 'border-red-400' : ''} ${className}`}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
    >
      <span
        aria-hidden="true"
        style={fillStyle}
        className="absolute inset-y-0 left-0 bg-red-500/25 pointer-events-none transition-[width] duration-75"
      />
      {releasedEarly && hint && (
        <span
          role="status"
          className="absolute left-1/2 top-2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-4 py-1 text-[20px] font-semibold leading-tight text-black pointer-events-none"
        >
          {hint}
        </span>
      )}
      <span className={`relative z-10 ${contentClassName}`}>{children}</span>
    </button>
  );
}
