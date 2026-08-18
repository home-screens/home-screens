'use client';

import { useMemo } from 'react';
import { parseDateInTZ } from '@/lib/timezone';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { useRealClock } from '@/hooks/useTZClock';
import { TEXT_OPACITY } from '@/lib/constants';
import { formatElapsed } from './elapsed-format';
import type { ClockViewProps } from './types';

export default function ClockElapsedView({ config, scaledFontSize, containerRef, timezone }: ClockViewProps) {
  const t = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  // Elapsed math runs on REAL instants only. The `now` prop the other views
  // use is a timezone-shifted wall clock (epoch offset by module tz − OS tz),
  // while parseDateInTZ returns a true epoch — mixing them skews the count by
  // exactly that offset whenever the module zone differs from the Pi's OS
  // zone. The naive referenceTime parses in the module's effective zone.
  const realNow = useRealClock(1000);
  const accentColor = config.accentColor || '#ffffff';

  const refDate = useMemo(
    () => (config.referenceTime ? parseDateInTZ(config.referenceTime, timezone) : null),
    [config.referenceTime, timezone],
  );
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
          {t('clock.elapsed.setReferenceTime')}
        </div>
      </div>
    );
  }
  const diffMs = realNow.getTime() - refDate!.getTime();
  const countUp = config.countUp ?? true;

  // Determine display logic
  // countUp=true: show time since reference (positive diff = time elapsed, negative diff = hasn't started)
  // countUp=false: show time until reference (negative diff = time remaining, positive diff = already passed)
  const isExpected = countUp ? diffMs >= 0 : diffMs <= 0;
  const elapsedFormat = config.elapsedFormat ?? 'units';
  const elapsedPrecision = config.elapsedPrecision ?? 'auto';
  const elapsed = formatElapsed(diffMs, elapsedFormat, elapsedPrecision, formattingLocale);

  const label = config.referenceLabel || '';
  const descriptor = isExpected
    ? (countUp ? t('clock.elapsed.since', { label }) : t('clock.elapsed.until', { label })).trim()
    : countUp
      ? t('clock.elapsed.until', { label }).trim()
      : t('clock.elapsed.since', { label }).trim();

  const displayValue =
    isExpected || Math.abs(diffMs) >= 1000 ? elapsed : formatElapsed(0, elapsedFormat, elapsedPrecision, formattingLocale);

  // Word formats render prose, where proportional figures read better; the
  // numeric formats keep tabular-nums so ticking digits don't jitter.
  const isWords = elapsedFormat === 'words' || elapsedFormat === 'wordsTitle';

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      {/* Elapsed time */}
      <div
        className={`font-light tracking-wide ${isWords ? '' : 'tabular-nums'}`}
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
          {countUp ? t('clock.elapsed.notYet') : t('clock.elapsed.elapsed')}
        </div>
      )}
    </div>
  );
}
