'use client';

import { useFormattingLocale, formatDateSync } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { dateModulePattern } from '@/lib/date-module-format';
import { DATE_INFO_LABELS, useDateInfoLine } from '../clock/use-date-info';
import type { DateViewProps } from './types';

export default function DateMinimalView({ config, now, scaledFontSize, containerRef }: DateViewProps) {
  const locale = useFormattingLocale();
  const dateFormat = config.dateFormat || 'MMMM d';
  let dateStr: string;
  try {
    dateStr = formatDateSync(now, dateModulePattern(dateFormat, locale), { locale });
  } catch {
    dateStr = formatDateSync(now, dateModulePattern('MMMM d', locale), { locale });
  }

  const { text: infoStr } = useDateInfoLine(config, now, DATE_INFO_LABELS);

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

      {infoStr && (
        <div
          className="mt-2 tracking-wider uppercase"
          style={{ fontSize: scaledFontSize * 0.8, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoStr}
        </div>
      )}
    </div>
  );
}
