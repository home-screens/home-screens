'use client';

import type { ReactNode } from 'react';
import { useFormattingLocale } from '@/i18n';
import { Sparkline, formatUSD, formatAxisLabels, sparklineY } from './shared';
import type { FinancialItem, SparklineLabels, SparklineMode, SparklineTheme } from './shared';

interface SingleTileProps {
  item: FinancialItem;
  sparklineMode: SparklineMode;
  sparklineTheme: SparklineTheme;
  /** Range captions drawn above each chart (already translated). */
  labels?: SparklineLabels;
}

/** Map a value to a % height inside the chart box — sparklineY (the shared
 *  0..32 viewBox mapping, flat domains at the mid-line) scaled to percent. */
function yPercent(v: number, min: number, max: number): number {
  return (sparklineY(v, min, max) / 32) * 100;
}

/** The gutter's hidden sizer (the wider label fixes its width) plus the max/min
 *  labels pinned to the levels' heights — one label at the mid-line for a flat
 *  domain, where max and min coincide. Local, like FinancialCard's ChartCaption. */
function AxisLabels({ min, max, locale }: { min: number; max: number; locale: string }) {
  const text = formatAxisLabels(min, max, locale);
  const label = (t: string, top: number) => (
    <span className="financial-axis-label absolute left-0 -translate-y-1/2 tabular-nums"
      style={{ top: `${top}%`, fontSize: '0.72em', opacity: 0.55 }}>{t}</span>
  );
  return (
    <>
      <span className="financial-axis-label-sizer invisible" style={{ fontSize: '0.72em' }}>
        {text.max.length >= text.min.length ? text.max : text.min}
      </span>
      {min === max
        ? label(text.min, yPercent(min, min, max))
        : <>{label(text.max, yPercent(max, min, max))}{label(text.min, yPercent(min, min, max))}</>}
    </>
  );
}

/** One symbol filling the tile: symbol + name, large price with today's move,
 *  and the chart(s) with a shared axis gutter. */
export default function SingleTile({ item, sparklineMode, sparklineTheme, labels }: SingleTileProps) {
  const locale = useFormattingLocale();
  const dayPositive = item.changeValue >= 0;
  const shaded = sparklineTheme === 'shaded';
  const dayPoints = item.sparkline ?? [];
  const weekPoints = item.weekSparkline ?? [];
  const hasDay = sparklineMode !== 'week' && dayPoints.length >= 2;
  const hasWeek = sparklineMode !== 'day' && weekPoints.length >= 2;

  // One vertical scale for whatever is drawn: both series share it in
  // both-mode, so the same price sits at the same height on either chart.
  const shown = [...(hasDay ? dayPoints : []), ...(hasWeek ? weekPoints : [])];
  const domain = shown.length > 0 ? { min: Math.min(...shown), max: Math.max(...shown) } : undefined;

  // Time-based marks (hour lines, day lines, the last-day band) need the
  // shaded theme's time-scaled x axis; classic spreads points evenly and
  // draws a bare line on both charts.
  const dayChart = hasDay ? (
    <Sparkline points={dayPoints} positive={dayPositive} scale={1} shaded={shaded} layout="single"
      xs={shaded ? item.sparklineXs : undefined}
      domain={domain}
      dividers={shaded ? item.sparklineHourMarks : undefined} />
  ) : null;
  const weekChart = hasWeek ? (
    <Sparkline points={weekPoints} positive={item.weekPositive ?? dayPositive} scale={1} shaded={shaded} layout="single"
      domain={domain}
      highlightFromX={shaded ? item.weekHighlightFromX : undefined}
      dividers={shaded ? item.weekDayBoundaries : undefined} />
  ) : null;

  // Each chart fills a relative slot so the 100%-height svg has a sized box.
  // The slot is a flex container so the inline svg blockifies — no text
  // baseline gap underneath the chart.
  const slot = (chart: ReactNode) => (
    <div className="financial-single-slot relative flex flex-1 min-w-0 min-h-0">{chart}</div>
  );
  const caption = (text: string) => (
    <span className="financial-single-caption flex-1 text-center whitespace-nowrap"
      style={{ fontSize: '0.54em', lineHeight: 1, opacity: 0.55 }}>{text}</span>
  );

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="flex items-baseline whitespace-nowrap min-w-0" style={{ gap: '0.5em' }}>
        <span className="financial-single-sym font-bold" style={{ fontSize: '1.15em', letterSpacing: '0.04em' }}>{item.label}</span>
        {item.name && (
          <span className="financial-single-name flex-1 min-w-0 overflow-hidden text-ellipsis"
            style={{ fontSize: '0.9em', opacity: 0.55 }}>{item.name}</span>
        )}
      </div>
      {/* A narrow tile drops the change onto its own line under the price,
          whole; it never splits inside the label. */}
      <div className="flex flex-wrap items-baseline" style={{ columnGap: '0.6em', marginTop: '0.35em' }}>
        <span className="financial-single-price font-bold tabular-nums" style={{ fontSize: '2.3em', lineHeight: 1 }}>
          {formatUSD(item.price, locale)}
        </span>
        <span className={`financial-single-delta whitespace-nowrap tabular-nums ${dayPositive ? 'text-green-400' : 'text-red-400'}`} style={{ fontSize: '1.15em', lineHeight: 1 }}>
          {item.changeLabel}
        </span>
      </div>
      {domain && (
        // A two-column grid: the axis gutter (sized by its hidden label) and
        // the charts. The captions row shares the gutter column, so each
        // caption centers over its own chart without a second sizer. The top
        // axis label hangs half above the chart row, so the block needs only
        // a sliver of clearance under the price row (a bit more without the
        // captions row to absorb it).
        <div className="financial-single-block grid flex-1 min-h-0"
          style={{
            gridTemplateColumns: 'auto 1fr',
            gridTemplateRows: labels ? 'auto 1fr' : '1fr',
            columnGap: '1em',
            margin: `${labels ? '0.1em' : '0.35em'} -0.25em 0 0`,
          }}>
          {labels && (
            <>
              <span />
              <div className="flex min-w-0" style={{ gap: '0.5em' }}>
                {hasWeek && caption(labels.week)}
                {hasDay && caption(labels.day)}
              </div>
            </>
          )}
          <div className="relative min-h-0">
            <AxisLabels min={domain.min} max={domain.max} locale={locale} />
          </div>
          <div className="flex min-w-0 min-h-0" style={{ gap: '0.5em' }}>
            {hasWeek && slot(weekChart)}
            {hasDay && slot(dayChart)}
          </div>
        </div>
      )}
    </div>
  );
}
