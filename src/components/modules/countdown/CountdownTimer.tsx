'use client';

import { Fragment } from 'react';
import { useTranslate, useFormattingLocale } from '@/i18n';
import { formatDuration, type Unit } from '@/lib/duration-format';
import type { CountdownConfig } from '@/types/config';
import { FlipCard, FlipSeparator } from './FlipCard';
import { pad, selectCountdownUnits } from './countdown-utils';
import type { TimeRemaining } from './types';

/**
 * Shared unit renderer for both Countdown views (All and Next). The two views
 * differ only in scale and surrounding layout; the ticking value display is
 * identical, so it lives here to keep the flip-card markup and the text
 * formats from re-diverging.
 *
 * `format === 'flip'` (the default for existing configs, which carry neither
 * field) reproduces the original boxed flip-card block byte-for-byte. Any
 * other format renders a single text line via the shared duration formatter.
 */
export default function CountdownTimer({
  time,
  config,
  fontSizePx,
}: {
  time: TimeRemaining;
  config: CountdownConfig;
  fontSizePx: number;
}) {
  const t = useTranslate('modules');
  const formattingLocale = useFormattingLocale();
  const units = selectCountdownUnits(time, config.precision ?? 'auto');
  const format = config.format ?? 'flip';

  if (format === 'flip') {
    const labels: Record<Unit, string> = {
      days: t('countdown.unitDays'),
      hours: t('countdown.unitHours'),
      minutes: t('countdown.unitMinutes'),
      seconds: t('countdown.unitSeconds'),
    };
    return (
      <div className="flex items-start justify-center" style={{ fontSize: `${fontSizePx}px`, gap: '0.15em' }}>
        {units.map(({ unit, value }, i) => (
          <Fragment key={unit}>
            {i > 0 && <FlipSeparator />}
            <FlipCard value={unit === 'days' ? String(value) : pad(value)} label={labels[unit]} />
          </Fragment>
        ))}
      </div>
    );
  }

  // Text formats: 'words'/'wordsTitle' are word-based and should not use
  // tabular-nums; the rest are numeric. The value ticks every second, so
  // server HTML and client hydration can straddle a tick (see FlipCard).
  const isWords = format === 'words' || format === 'wordsTitle';
  return (
    <div
      className={`font-semibold ${isWords ? '' : 'tabular-nums'}`}
      style={{ fontSize: `${fontSizePx}px` }}
      suppressHydrationWarning
    >
      {formatDuration(units, format, formattingLocale)}
    </div>
  );
}
