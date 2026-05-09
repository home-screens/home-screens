'use client';

import { getDateInfoValues } from '@/lib/date-info';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { DateViewProps } from './types';

export default function DateFullView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const dayNumber = formatDateSync(now, 'd', { locale });
  const monthName = formatDateSync(now, 'MMMM', { locale });
  const dayName = formatDateSync(now, 'EEEE', { locale });
  const year = formatDateSync(now, 'yyyy', { locale });

  const { weekNumber, dayOfYear } = getDateInfoValues(now);
  const infoParts: string[] = [];
  if (config.showWeekNumber) infoParts.push(`${t('date.weekShort')} ${weekNumber}`);
  if (config.showDayOfYear) infoParts.push(`${t('date.dayShort')} ${dayOfYear}`);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      {config.showDayName && (
        <div
          className="uppercase tracking-[0.2em] font-medium"
          style={{ fontSize: scaledFontSize * 0.9, opacity: TEXT_OPACITY.dim }}
          suppressHydrationWarning
        >
          {dayName}
        </div>
      )}
      <div
        className="font-light leading-none"
        style={{ fontSize: scaledFontSize * 4.5, color: config.accentColor }}
        suppressHydrationWarning
      >
        {dayNumber}
      </div>
      <div
        className="uppercase tracking-[0.15em] font-medium"
        style={{ fontSize: scaledFontSize * 1.1, opacity: TEXT_OPACITY.secondary }}
        suppressHydrationWarning
      >
        {monthName}{config.showYear ? ` ${year}` : ''}
      </div>

      {infoParts.length > 0 && (
        <div
          className="mt-2 tracking-wider uppercase"
          style={{ fontSize: scaledFontSize * 0.75, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoParts.join(' · ')}
        </div>
      )}
    </div>
  );
}
