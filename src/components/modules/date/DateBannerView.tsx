'use client';

import { getDateInfoValues } from '@/lib/date-info';
import { localeWeekStart } from '@/lib/week-number';
import { useTranslate, useFormattingLocale, formatDateSync, dayMonthPattern } from '@/i18n';
import { TEXT_OPACITY } from '@/lib/constants';
import { estimateTextWidth, fitBaseSize, fitFactor } from '../clock/fit-width';
import type { DateViewProps } from './types';

/** Letter spacing of the banner line, in em (Tailwind `tracking-[0.15em]`). */
const TRACKING_EM = 0.15;
/** The bullet between parts: its glyph plus the `mx-2` margin either side, in px at any size. */
const SEPARATOR_MARGIN_PX = 16;
/** Under this size one line is too small to read from across a room, so the day takes a line of its own. */
const MIN_ONE_LINE_PX = 16;

/** Estimated width of the parts on one line, bullets between them. */
function lineWidth(parts: string[], fontSize: number): number {
  const text = parts.reduce((sum, part) => sum + estimateTextWidth(part, fontSize, TRACKING_EM), 0);
  const bullets = Math.max(0, parts.length - 1);
  return text + bullets * (estimateTextWidth('\u2022', fontSize, TRACKING_EM) + SEPARATOR_MARGIN_PX);
}

export default function DateBannerView({ config, now, scaledFontSize, autoFontSize, boxWidth = 0, containerRef }: DateViewProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();
  // Day and month in the order this language writes them ("29. SEPTEMBER").
  const dayAndMonth = formatDateSync(now, dayMonthPattern(locale, 'long'), { locale });
  const dayName = formatDateSync(now, 'EEEE', { locale });
  const year = formatDateSync(now, 'yyyy', { locale });

  const parts: string[] = [];
  if (config.showDayName) parts.push(dayName.toUpperCase());
  parts.push(dayAndMonth.toUpperCase());
  if (config.showYear) parts.push(year);

  // The size comes from the box height, so in a card narrower than the line
  // the text ran off both sides ("ESDAY \u2022 SEPTEMB"). Fit it to the width as
  // the one-line clocks do. When that would make it too small to read, the
  // first part takes a line of its own and both lines are fitted instead.
  const lineSize = scaledFontSize * 1.4;
  const base = fitBaseSize(scaledFontSize, autoFontSize ?? scaledFontSize) * 1.4;
  const oneLine = fitFactor(lineWidth(parts, base), boxWidth);
  const stacked = parts.length > 1 && lineSize * oneLine < MIN_ONE_LINE_PX;
  const lines = stacked ? [[parts[0]], parts.slice(1)] : [parts];
  const factor = stacked
    ? fitFactor(Math.max(...lines.map((line) => lineWidth(line, base))), boxWidth)
    : oneLine;

  const { weekNumber, dayOfYear } = getDateInfoValues(now, localeWeekStart(locale));
  const infoParts: string[] = [];
  if (config.showWeekNumber) infoParts.push(`${t('date.weekAbbrev')} ${weekNumber}`);
  if (config.showDayOfYear) infoParts.push(`${t('date.dayAbbrev')} ${dayOfYear}`);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <div
        className="tracking-[0.15em] font-light text-center"
        style={{ fontSize: lineSize * factor }}
        data-testid="date-banner-line"
        suppressHydrationWarning
      >
        {lines.map((line, row) => (
          <div key={row} className="whitespace-nowrap" suppressHydrationWarning>
            {line.map((part, i) => (
              <span key={i} suppressHydrationWarning>
                {i > 0 && (
                  <span className="mx-2 opacity-30" style={{ color: config.accentColor }}>&bull;</span>
                )}
                {part}
              </span>
            ))}
          </div>
        ))}
      </div>

      {infoParts.length > 0 && (
        <div
          className="mt-1.5 tracking-[0.2em] uppercase"
          style={{ fontSize: scaledFontSize * 0.7, opacity: TEXT_OPACITY.tertiary }}
          suppressHydrationWarning
        >
          {infoParts.join('  ·  ')}
        </div>
      )}
    </div>
  );
}
