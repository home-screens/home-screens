'use client';

import { parseClockTime } from '@/lib/date-info';
import { useTranslate } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { clockAlignmentStyle } from './alignment';
import type { ClockViewProps } from './types';

export default function ClockMinimalView({ config, now, scaledFontSize, containerRef }: ClockViewProps) {
  const t = useTranslate('modules');
  const { hStr, mStr, hours } = parseClockTime(config.format24h, now);
  // Off unless asked for: this view is the bare time, and every Minimal clock
  // placed before the toggle existed stays that way.
  const ampm = config.showAmPm && !config.format24h ? (hours >= 12 ? t('clock.pm') : t('clock.am')) : '';

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex"
      style={clockAlignmentStyle(config, 'row')}
    >
      <span
        className="tabular-nums whitespace-nowrap"
        style={{
          fontSize: scaledFontSize * 3.5,
          fontWeight: 100,
          letterSpacing: '0.05em',
          lineHeight: 1,
        }}
        suppressHydrationWarning
      >
        {hStr}:{mStr}
        {ampm && <span suppressHydrationWarning style={{ fontSize: '0.4em', marginLeft: '0.15em', opacity: TEXT_OPACITY.dim }}> {ampm}</span>}
      </span>
    </div>
  );
}
