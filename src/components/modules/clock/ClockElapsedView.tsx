'use client';

import { parseDateInTZ } from '@/lib/timezone';
import { TEXT_OPACITY } from '@/lib/constants';
import type { ClockViewProps } from './types';

function formatElapsed(diffMs: number): string {
  const totalSeconds = Math.floor(Math.abs(diffMs) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);

  // Show seconds only when diff is under 1 hour for precision
  if (totalSeconds < 3600) {
    parts.push(`${secs}s`);
  }

  return parts.join(' ');
}

export default function ClockElapsedView({ config, now, scaledFontSize, containerRef, timezone }: ClockViewProps) {
  const accentColor = config.accentColor || '#ffffff';

  const refDate = config.referenceTime ? parseDateInTZ(config.referenceTime, timezone) : null;
  const isValid = refDate && !isNaN(refDate.getTime());

  if (!isValid) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full flex flex-col items-center justify-center"
      >
        <div
          className="tracking-wide"
          style={{ fontSize: scaledFontSize * 1.1, opacity: TEXT_OPACITY.tertiary }}
        >
          Set a reference time
        </div>
      </div>
    );
  }
  const diffMs = now.getTime() - refDate!.getTime();
  const countUp = config.countUp ?? true;

  // Determine display logic
  // countUp=true: show time since reference (positive diff = time elapsed, negative diff = hasn't started)
  // countUp=false: show time until reference (negative diff = time remaining, positive diff = already passed)
  const isExpected = countUp ? diffMs >= 0 : diffMs <= 0;
  const elapsed = formatElapsed(diffMs);

  const label = config.referenceLabel || '';
  const preposition = countUp ? 'since' : 'until';
  const descriptor = isExpected
    ? `${preposition} ${label}`.trim()
    : countUp
      ? `until ${label}`.trim()
      : `since ${label}`.trim();

  const displayValue = isExpected ? elapsed : !isExpected && Math.abs(diffMs) < 1000 ? '0s' : elapsed;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      {/* Elapsed time */}
      <div
        className="tabular-nums font-light tracking-wide"
        style={{
          fontSize: scaledFontSize * 2.8,
          lineHeight: 1.1,
          color: accentColor,
        }}
        suppressHydrationWarning
      >
        {displayValue}
      </div>

      {/* Label */}
      {label && (
        <div
          className="mt-3 tracking-wide font-light"
          style={{
            fontSize: scaledFontSize * 1,
            color: accentColor,
            opacity: TEXT_OPACITY.dim,
          }}
          suppressHydrationWarning
        >
          {descriptor}
        </div>
      )}

      {/* Inverted state indicator */}
      {!isExpected && (
        <div
          className="mt-2 uppercase tracking-widest"
          style={{
            fontSize: scaledFontSize * 0.65,
            color: accentColor,
            opacity: TEXT_OPACITY.tertiary,
          }}
          suppressHydrationWarning
        >
          {countUp ? 'not yet' : 'elapsed'}
        </div>
      )}
    </div>
  );
}
