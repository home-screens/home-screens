'use client';

import { useEffect, useRef, useState } from 'react';

export interface BrightnessPopoverProps {
  initial: number; // 0..100
  onCommit: (value: number) => void;
  onDismiss: () => void;
  /** Translated label shown in the popover header and as the slider's aria-label. */
  label?: string;
}

export function BrightnessPopover({ initial, onCommit, onDismiss, label = 'Brightness' }: BrightnessPopoverProps) {
  const [value, setValue] = useState(clamp(initial));
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
      className="rounded-xl bg-hs-card border border-hs-border-strong shadow-lg p-3 w-[220px]"
    >
      <div className="flex justify-between text-xs mb-1">
        <span className="uppercase tracking-wider text-hs-text-muted">{label}</span>
        <span className="font-mono text-hs-text-faint">{value}%</span>
      </div>
      <input
        aria-label={label}
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onPointerUp={() => onCommit(value)}
        className="w-full h-3 accent-hs-accent"
      />
    </div>
  );
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}
