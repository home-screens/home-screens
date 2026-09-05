'use client';

import { useTZClock } from '@/hooks/useTZClock';
import { useTranslate, useFormattingLocale, formatDateSync } from '@/i18n';
import type { YearProgressConfig, ModuleStyle } from '@/types/config';
import ModuleWrapper from './ModuleWrapper';
import { TEXT_OPACITY, resolveAccent, ink } from '@/lib/constants';

interface YearProgressModuleProps {
  config: YearProgressConfig;
  style: ModuleStyle;
  timezone?: string;
}

function getProgress(now: Date) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInYear = isLeap ? 366 : 365;
  const dayOfYear = Math.floor(
    (Date.UTC(year, month, day) - Date.UTC(year, 0, 1)) / 86_400_000,
  );
  const yearPercent = ((dayOfYear + (hours * 60 + minutes) / 1440) / daysInYear) * 100;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthPercent = (((day - 1) + (hours * 60 + minutes) / 1440) / daysInMonth) * 100;

  const jsDay = now.getDay();
  const weekDay = jsDay === 0 ? 6 : jsDay - 1;
  const minutesInDay = hours * 60 + minutes;
  const weekMinutesElapsed = weekDay * 1440 + minutesInDay;
  const weekPercent = (weekMinutesElapsed / (7 * 1440)) * 100;

  const dayPercent = (minutesInDay / 1440) * 100;

  return { yearPercent, monthPercent, weekPercent, dayPercent, year };
}

function ProgressBar({ label, percent, showPercentage, accentColor, hasAccent }: {
  label: string;
  percent: number;
  showPercentage: boolean;
  accentColor: string;
  hasAccent: boolean;
}) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div className="flex flex-col" style={{ gap: '0.3em' }}>
      <div className="flex justify-between items-baseline">
        {/* Label, percentage and bar width all derive from the wall clock, so
            the server and the client disagree across any tick between the two
            renders. Same treatment as the clock, date and countdown modules. */}
        <span suppressHydrationWarning style={{ fontSize: '0.85em', opacity: TEXT_OPACITY.secondary }}>{label}</span>
        {showPercentage && (
          <span suppressHydrationWarning className="tabular-nums" style={{ fontSize: '0.75em', opacity: TEXT_OPACITY.tertiary }}>
            {clamped.toFixed(1)}%
          </span>
        )}
      </div>
      <div
        className="w-full rounded-full overflow-hidden relative"
        style={{ height: '8px', background: ink(0.08) }}
      >
        <div
          className="h-full rounded-full relative"
          suppressHydrationWarning
          style={{
            width: `${clamped}%`,
            background: hasAccent
              ? `linear-gradient(90deg, ${accentColor}90, ${accentColor})`
              : ink(0.7),
            boxShadow: hasAccent ? `0 0 8px ${accentColor}60` : undefined,
            transition: 'width 0.5s ease',
          }}
        >
          {hasAccent && (
            <span
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: '12px',
                height: '12px',
                // The glowing tip of an accent-coloured bar: white for the glow, chip ink.
                backgroundColor: '#fff',
                boxShadow: `0 0 6px ${accentColor}, 0 0 12px ${accentColor}80`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function YearProgressModule({ config, style, timezone }: YearProgressModuleProps) {
  const now = useTZClock(timezone);
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

  const showYear = config.showYear ?? true;
  const showMonth = config.showMonth ?? true;
  const showWeek = config.showWeek ?? true;
  const showDay = config.showDay ?? true;
  const showPercentage = config.showPercentage ?? true;
  const { accentColor, hasAccent } = resolveAccent(config);

  const { yearPercent, monthPercent, weekPercent, dayPercent, year } = getProgress(now);

  const monthName = formatDateSync(now, 'MMMM', { locale });
  const dayName = formatDateSync(now, 'EEEE', { locale });

  return (
    <ModuleWrapper style={style}>
      <div className="flex flex-col justify-center h-full" style={{ gap: '1.1em' }}>
        {showYear && (
          <ProgressBar label={String(year)} percent={yearPercent} showPercentage={showPercentage} accentColor={accentColor} hasAccent={hasAccent} />
        )}
        {showMonth && (
          <ProgressBar label={monthName} percent={monthPercent} showPercentage={showPercentage} accentColor={accentColor} hasAccent={hasAccent} />
        )}
        {showWeek && (
          <ProgressBar label={t('year-progress.week')} percent={weekPercent} showPercentage={showPercentage} accentColor={accentColor} hasAccent={hasAccent} />
        )}
        {showDay && (
          <ProgressBar label={dayName} percent={dayPercent} showPercentage={showPercentage} accentColor={accentColor} hasAccent={hasAccent} />
        )}
      </div>
    </ModuleWrapper>
  );
}
