'use client';

import { useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { DATE_INFO_LABELS, useDateInfoLine } from '../clock/use-date-info';
import type { DateViewProps } from './types';

export default function DateStackedView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
  const locale = useFormattingLocale();
  const dayNumber = formatDateSync(now, 'd', { locale });
  const monthName = formatDateSync(now, 'MMMM', { locale });
  const dayName = formatDateSync(now, 'EEEE', { locale });
  const year = formatDateSync(now, 'yyyy', { locale });
  const { text: infoStr } = useDateInfoLine(config, now, DATE_INFO_LABELS);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center gap-1"
    >
      {config.showDayName && (
        <div
          className="uppercase tracking-[0.25em] font-light"
          style={{ fontSize: scaledFontSize * 0.85, opacity: TEXT_OPACITY.dim }}
          suppressHydrationWarning
        >
          {dayName}
        </div>
      )}
      <div
        className="w-12 border-t opacity-20"
        style={{ borderColor: config.accentColor }}
      />
      <div
        className="font-semibold leading-none"
        style={{ fontSize: scaledFontSize * 3 }}
        suppressHydrationWarning
      >
        {dayNumber}
      </div>
      <div
        className="w-12 border-t opacity-20"
        style={{ borderColor: config.accentColor }}
      />
      <div
        className="uppercase tracking-[0.2em]"
        style={{ fontSize: scaledFontSize * 0.9, opacity: TEXT_OPACITY.secondary }}
        suppressHydrationWarning
      >
        {monthName}{config.showYear ? ` ${year}` : ''}
      </div>

      {infoStr && (
        <div
          className="mt-1 tracking-wider uppercase"
          style={{ fontSize: scaledFontSize * 0.7, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoStr}
        </div>
      )}
    </div>
  );
}
