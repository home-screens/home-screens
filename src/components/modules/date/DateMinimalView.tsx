'use client';

import { getDateInfoValues } from '@/lib/date-info';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import type { DateViewProps } from './types';

export default function DateMinimalView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  const dateFormat = config.dateFormat || 'MMMM d';
  let dateStr: string;
  try {
    dateStr = formatDateSync(now, dateFormat, { locale });
  } catch {
    dateStr = formatDateSync(now, 'MMMM d', { locale });
  }

  const { weekNumber, dayOfYear } = getDateInfoValues(now);
  const infoParts: string[] = [];
  if (config.showWeekNumber) infoParts.push(`${t('date.weekShort')} ${weekNumber}`);
  if (config.showDayOfYear) infoParts.push(`${t('date.dayShort')} ${dayOfYear}`);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div
        className="tracking-wide"
        style={{ fontSize: scaledFontSize * 2 }}
        suppressHydrationWarning
      >
        {dateStr}
      </div>

      {infoParts.length > 0 && (
        <div
          className="mt-2 tracking-wider uppercase"
          style={{ fontSize: scaledFontSize * 0.8, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoParts.join(' · ')}
        </div>
      )}
    </div>
  );
}
