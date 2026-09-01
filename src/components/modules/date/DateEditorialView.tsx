'use client';

import { getDateInfoValues } from '@/lib/date-info';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { DateViewProps } from './types';

export default function DateEditorialView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
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
      className="w-full h-full flex items-center justify-center"
    >
      <div className="flex items-center gap-3">
        <div
          className="font-extralight leading-none"
          style={{ fontSize: scaledFontSize * 5, color: config.accentColor }}
          suppressHydrationWarning
        >
          {dayNumber}
        </div>

        <div
          className="self-stretch w-px opacity-30"
          style={{ backgroundColor: config.accentColor }}
        />

        <div className="flex flex-col justify-center gap-0.5">
          <div
            className="uppercase tracking-[0.15em] font-medium leading-tight"
            style={{ fontSize: scaledFontSize * 1.1 }}
            suppressHydrationWarning
          >
            {monthName}
          </div>
          {config.showDayName && (
            <div
              className="leading-tight"
              style={{ fontSize: scaledFontSize * 0.85, opacity: TEXT_OPACITY.dim }}
              suppressHydrationWarning
            >
              {dayName}
            </div>
          )}
          {config.showYear && (
            <div
              className="leading-tight"
              style={{ fontSize: scaledFontSize * 0.8, opacity: TEXT_OPACITY.tertiary }}
              suppressHydrationWarning
            >
              {year}
            </div>
          )}
          {infoParts.length > 0 && (
            <div
              className="tracking-wider uppercase leading-tight mt-0.5"
              style={{ fontSize: scaledFontSize * 0.65, opacity: TEXT_OPACITY.tertiary }}
              suppressHydrationWarning
            >
              {infoParts.join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
