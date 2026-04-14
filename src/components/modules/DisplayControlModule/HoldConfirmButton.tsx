'use client';

import type { ReactNode, CSSProperties } from 'react';
import { useHoldConfirm } from '@/hooks/useHoldConfirm';

export interface HoldConfirmButtonProps {
  onConfirm: () => void;
  durationMs?: number;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  /** aria-label for screen readers (visible label may be an icon). */
  ariaLabel?: string;
}

/**
 * Button that requires a press-and-hold before firing onConfirm. Renders a
 * progress fill that sweeps left-to-right during the hold, and a brief
 * highlight flash when confirmed.
 */
export function HoldConfirmButton({
  onConfirm,
  durationMs = 1000,
  children,
  className = '',
  disabled = false,
  ariaLabel,
}: HoldConfirmButtonProps) {
  const { progress, onPointerDown, onPointerUp, onPointerCancel } = useHoldConfirm({
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
      onPointerDown={disabled ? undefined : onPointerDown}
      onPointerUp={disabled ? undefined : onPointerUp}
      onPointerCancel={disabled ? undefined : onPointerCancel}
      onPointerLeave={disabled ? undefined : onPointerUp}
      className={`relative overflow-hidden select-none touch-none ${className}`}
    >
      <span
        aria-hidden="true"
        style={fillStyle}
        className="absolute inset-y-0 left-0 bg-red-500/25 pointer-events-none transition-[width] duration-75"
      />
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}
