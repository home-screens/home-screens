'use client';

import { useEffect, useRef } from 'react';
import { BrightnessSlider } from './controls';
import { popoverMetrics } from './metrics';

export interface BrightnessPopoverProps {
  /** Reported brightness 0..100, or null while nothing has been reported. */
  initial: number | null;
  onCommit: (value: number) => void;
  onDismiss: () => void;
}

/** The brightness slider in a small card, for the bar layout. */
export function BrightnessPopover({ initial, onCommit, onDismiss }: BrightnessPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      className="w-[300px] rounded-2xl border border-hs-border-strong bg-hs-card p-4 shadow-2xl"
    >
      <BrightnessSlider value={clamp(initial)} onCommit={onCommit} m={popoverMetrics()} />
    </div>
  );
}

function clamp(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}
