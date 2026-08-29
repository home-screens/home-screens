'use client';

import type { ReactNode } from 'react';
import { useFormattingLocale } from '@/i18n';
import { Sparkline, formatUSD, formatPercent, formatChange, formatAxisValue, sparklineY } from './shared';
import type { SparklineMode, SparklineTheme } from './shared';

interface SingleTileProps {
  symbol: string;
  name?: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  sparkline?: number[];
  sparklineXs?: number[];
  /** Hour-mark x fractions from the API — the symbol's own exchange hours. */
  sparklineHourMarks?: number[];
  sparklineWeek?: number[];
  weekChangePercent?: number | null;
  weekLastDayStart?: number;
  weekDayBoundaries?: number[];
  sparklineMode: SparklineMode;
  sparklineTheme: SparklineTheme;
  /** Long-form range captions drawn above each chart when Label charts is on. */
  chartCaptions?: { day: string; week: string };
}

/** Map a value to a % height inside the chart box — sparklineY (the shared
 *  0..32 viewBox mapping, flat domains at the mid-line) scaled to percent. */
function yPercent(v: number, min: number, max: number): number {
  return (sparklineY(v, min, max) / 32) * 100;
}

/** The gutter's hidden sizer (the wider label fixes its width) plus the max/min
 * labels pinned to the levels' heights. Local, like FinancialCard's ChartCaption. */
/** The wider of the two formatted axis labels — sizes the gutter (and the
 *  captions row's matching spacer). */
function widerAxisLabel(min: number, max: number, locale: string): string {
  const tMax = formatAxisValue(max, locale);
  const tMin = formatAxisValue(min, locale);
  return tMax.length >= tMin.length ? tMax : tMin;
}

/** The gutter's hidden sizer (the wider label fixes its width) plus the max/min
 *  labels pinned to the levels' heights — one label at the mid-line for a flat
 *  domain, where max and min coincide. Local, like FinancialCard's ChartCaption. */
function AxisLabels({ min, max, locale }: { min: number; max: number; locale: string }) {
  const tMax = formatAxisValue(max, locale);
  const tMin = formatAxisValue(min, locale);
  const label = (text: string, top: number) => (
    <span className="financial-axis-label absolute left-0 -translate-y-1/2 tabular-nums"
      style={{ top: `${top}%`, fontSize: '0.72em', opacity: 0.55 }}>{text}</span>
  );
  return (
    <>
      <span className="financial-axis-label-sizer invisible" style={{ fontSize: '0.72em' }}>{widerAxisLabel(min, max, locale)}</span>
      {min === max
        ? label(tMin, yPercent(min, min, max))
        : <>{label(tMax, yPercent(max, min, max))}{label(tMin, yPercent(min, min, max))}</>}
    </>
  );
}

export default function SingleTile({
  symbol, name, price, change, changePercent,
  sparkline, sparklineXs, sparklineHourMarks, sparklineWeek, weekChangePercent, weekLastDayStart, weekDayBoundaries,
  sparklineMode, sparklineTheme, chartCaptions,
}: SingleTileProps) {
  const locale = useFormattingLocale();
  const dayPositive = (change ?? 0) >= 0;
  const shaded = sparklineTheme === 'shaded';
  const wantsDay = sparklineMode !== 'week';
  const wantsWeek = sparklineMode !== 'day';
  const dayPoints = sparkline ?? [];
  const weekPoints = sparklineWeek ?? [];
  const hasDay = wantsDay && dayPoints.length >= 2;
  const hasWeek = wantsWeek && weekPoints.length >= 2;

  // Shared vertical scale in both-mode: min/max across both series.
  let domain: { min: number; max: number } | undefined;
  if (hasDay && hasWeek) {
    const all = [...dayPoints, ...weekPoints];
    domain = { min: Math.min(...all), max: Math.max(...all) };
  }

  const chartsDomain = domain
    ?? (hasDay
      ? { min: Math.min(...dayPoints), max: Math.max(...dayPoints) }
      : hasWeek ? { min: Math.min(...weekPoints), max: Math.max(...weekPoints) } : undefined);

  const dayChart = hasDay ? (
    <Sparkline points={dayPoints} positive={dayPositive} scale={1} shaded={shaded} fillWidth fillHeight
      xs={shaded ? sparklineXs : undefined}
      domain={domain} showLevelLines flushBottomFill dividersOverFill
      dividers={shaded && sparklineXs ? sparklineHourMarks : undefined} />
  ) : null;
  const weekPositive = weekChangePercent == null ? dayPositive : weekChangePercent >= 0;
  const weekChart = hasWeek ? (
    <Sparkline points={weekPoints} positive={weekPositive} scale={1}
      shaded={shaded} fillWidth fillHeight domain={domain} showLevelLines
      flushBottomFill dividersOverFill
      highlightFromX={shaded ? weekLastDayStart : undefined}
      dividers={weekDayBoundaries} />
  ) : null;

  // Each chart fills a relative slot so the 100%-height svg has a sized box.
  // The slot is a flex container so the inline svg blockifies — no text
  // baseline gap underneath the chart.
  const slot = (chart: ReactNode) => (
    <div className="financial-single-slot relative flex flex-1 min-w-0 min-h-0">{chart}</div>
  );

  // The captions row sits ABOVE the chart block (its own line, outside the
  // charts). Its left spacer mirrors the gutter's hidden sizer at the same
  // font size so each caption centers over its own chart column.
  const gutterSpacer = chartsDomain ? (
    <span className="invisible whitespace-nowrap" style={{ fontSize: '0.72em' }}>
      {widerAxisLabel(chartsDomain.min, chartsDomain.max, locale)}
    </span>
  ) : null;
  const caption = (text: string) => (
    <span className="financial-single-caption flex-1 text-center whitespace-nowrap"
      style={{ fontSize: '0.54em', lineHeight: 1, opacity: 0.55 }}>{text}</span>
  );

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="flex items-baseline whitespace-nowrap min-w-0" style={{ gap: '0.5em' }}>
        <span className="financial-single-sym font-bold" style={{ fontSize: '1.15em', letterSpacing: '0.04em' }}>{symbol}</span>
        {name && (
          <span className="financial-single-name flex-1 min-w-0 overflow-hidden text-ellipsis"
            style={{ fontSize: '0.9em', opacity: 0.55 }}>{name}</span>
        )}
      </div>
      <div className="flex items-baseline" style={{ gap: '0.6em', marginTop: '0.35em' }}>
        <span className="financial-single-price font-bold tabular-nums" style={{ fontSize: '2.3em', lineHeight: 1 }}>
          {formatUSD(price ?? 0, locale)}
        </span>
        {change == null || changePercent == null ? (
          // No prior close to measure from: the house en dash, no color (formatChangeLabel's convention)
          <span className="financial-single-delta tabular-nums" style={{ fontSize: '1.15em' }}>{'–'}</span>
        ) : (
          <span className={`financial-single-delta tabular-nums ${dayPositive ? 'text-green-400' : 'text-red-400'}`} style={{ fontSize: '1.15em' }}>
            {formatChange(change)} ({formatPercent(changePercent)})
          </span>
        )}
      </div>
      {chartsDomain && chartCaptions && (hasDay || hasWeek) && (
        <div className="flex" style={{ gap: '1em', margin: '0.1em -0.25em 0 0' }}>
          {gutterSpacer}
          <div className="flex flex-1 min-w-0" style={{ gap: '0.5em' }}>
            {hasWeek && caption(chartCaptions.week)}
            {hasDay && caption(chartCaptions.day)}
          </div>
        </div>
      )}
      {chartsDomain && (
        <div className="financial-single-block flex flex-1 min-h-0" style={{ gap: '1em', margin: '-0.5em -0.25em 0 0' }}>
          <div className="relative shrink-0">
            <AxisLabels min={chartsDomain.min} max={chartsDomain.max} locale={locale} />
          </div>
          <div className="flex flex-1 min-w-0 min-h-0" style={{ gap: '0.5em' }}>
            {hasWeek && slot(weekChart)}
            {hasDay && slot(dayChart)}
          </div>
        </div>
      )}
    </div>
  );
}
