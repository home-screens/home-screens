'use client';

import type { ReactNode } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale } from '@/i18n';
import { ContentCard } from './shared/ContentCard';
import { Sparkline } from './financial/shared';
import type { SparklineLabels, SparklineMode, SparklineTheme } from './financial/shared';

interface FinancialCardProps {
  label: string;
  price: number;
  changeValue: number;
  changeLabel: string;
  scale: number;
  sparkline?: number[];
  sparklineXs?: number[];
  weekSparkline?: number[];
  weekPositive?: boolean;
  weekHighlightFromX?: number;
  /** Day-boundary x fractions from the API (the week chart's session ticks). */
  weekDayBoundaries?: number[];
  sparklineMode?: SparklineMode;
  sparklineTheme?: SparklineTheme;
  /** When set, each chart is captioned with its range and the shaded week chart gets session ticks. */
  sparklineLabels?: SparklineLabels;
}

/**
 * The caption sits in whichever left corner the line leaves empty: a series
 * that starts in the upper half (a falling day) gets the caption below.
 */
function captionEdge(points: number[]): 'top' | 'bottom' {
  const min = Math.min(...points);
  const max = Math.max(...points);
  if (max === min) return 'top';
  return (points[0] - min) / (max - min) >= 0.5 ? 'bottom' : 'top';
}

function ChartCaption({ text, edge, scale }: { text: string; edge: 'top' | 'bottom'; scale: number }) {
  return (
    <span
      className="financial-sparkline-label absolute font-semibold tracking-wider pointer-events-none"
      style={{ fontSize: `${0.5 * scale}em`, lineHeight: 1, opacity: 0.55, left: '0.5em', [edge]: '0.35em' }}
    >
      {text}
    </span>
  );
}

export default function FinancialCard({
  label, price, changeValue, changeLabel, scale,
  sparkline, sparklineXs, weekSparkline, weekPositive, weekHighlightFromX, weekDayBoundaries,
  sparklineMode = 'day', sparklineTheme = 'classic', sparklineLabels,
}: FinancialCardProps) {
  const dayPositive = changeValue >= 0;
  const shaded = sparklineTheme === 'shaded';
  const locale = useFormattingLocale();

  // Each chart is colored by its own period's move whenever the data says so
  // (the week chart falls back to the day color without a week baseline).
  // The theme only changes the treatment: shaded adds the backdrop, tint,
  // session-time x scaling and the last-day band; classic is the plain line.
  const hasDay = !!sparkline && sparkline.length >= 2;
  const hasWeek = !!weekSparkline && weekSparkline.length >= 2;
  const weekColor = weekPositive ?? dayPositive;
  const dayXs = shaded ? sparklineXs : undefined;

  // Shaded charts stretch across the card's full width. The content box sits
  // 1em from the tile edges (0.75em below the charts), so the chart area
  // pulls 0.25em past the content box on each side to match that inset.
  // `alignSelf: stretch` (not width: 100%) is what lets the negative margins
  // widen the box: a percentage width would stay content-box wide and the
  // centered parent would just absorb the margins. Classic keeps its fixed
  // em widths untouched.
  const areaStyle = shaded
    ? { alignSelf: 'stretch' as const, marginInline: `${-0.25 * scale}em` }
    : undefined;

  // Labels: shaded charts get a caption overlaid in an empty corner (each
  // chart sits in a relative slot) and the week chart is ticked into its
  // sessions; classic charts get the caption centered underneath, since
  // there is no backdrop to sit on. Without labels the DOM is unchanged.
  const labels = sparklineLabels;
  const dividers = shaded && labels ? weekDayBoundaries : undefined;

  const dayChart = hasDay ? (
    <Sparkline points={sparkline} positive={dayPositive} scale={scale}
      xs={dayXs} shaded={shaded} fillWidth={shaded} />
  ) : null;
  const weekChart = hasWeek ? (
    <Sparkline points={weekSparkline} positive={weekColor} scale={scale}
      highlightFromX={shaded ? weekHighlightFromX : undefined}
      dividers={dividers}
      shaded={shaded} fillWidth={shaded} />
  ) : null;

  const shadedSlot = (chart: ReactNode, points: number[], text: string) => (
    <div className="financial-sparkline-slot relative flex-1 min-w-0">
      {chart}
      <ChartCaption text={text} edge={captionEdge(points)} scale={scale} />
    </div>
  );
  const classicSlot = (chart: ReactNode, text: string) => (
    <div className="financial-sparkline-slot flex flex-col items-center">
      {chart}
      <span className="financial-sparkline-label font-semibold tracking-wider"
        style={{ fontSize: `${0.5 * scale}em`, lineHeight: 1, opacity: 0.5, marginTop: `${0.1 * scale}em` }}>
        {text}
      </span>
    </div>
  );

  let charts: ReactNode;
  if (sparklineMode === 'both') {
    charts = hasDay || hasWeek ? (
      shaded ? (
        // Both charts stretch to 100% and flex-shrink to equal halves; the
        // row carries the shared side inset. Week sits left of day, so the
        // pair reads chronologically: the past week, then today.
        <div className="financial-sparkline-row flex items-center justify-center"
          style={{ gap: `${0.5 * scale}em`, ...areaStyle }}>
          {hasWeek && (labels ? shadedSlot(weekChart, weekSparkline, labels.week) : weekChart)}
          {hasDay && (labels ? shadedSlot(dayChart, sparkline, labels.day) : dayChart)}
        </div>
      ) : (
        <div className="financial-sparkline-row flex items-center justify-center w-full"
          style={{ gap: `${0.5 * scale}em` }}>
          {hasWeek && (() => {
            const chart = <Sparkline points={weekSparkline} positive={weekColor} scale={scale} widthEm={2.6} />;
            return labels ? classicSlot(chart, labels.week) : chart;
          })()}
          {hasDay && (() => {
            const chart = <Sparkline points={sparkline} positive={dayPositive} scale={scale} xs={dayXs} widthEm={2.6} />;
            return labels ? classicSlot(chart, labels.day) : chart;
          })()}
        </div>
      )
    ) : null;
  } else {
    // Single chart (day or week): shaded wraps it to fill the card width;
    // classic renders today's bare fixed-width Sparkline.
    const isWeek = sparklineMode === 'week';
    const single = isWeek ? weekChart : dayChart;
    const points = isWeek ? weekSparkline : sparkline;
    const text = isWeek ? labels?.week : labels?.day;
    if (shaded && single) {
      charts = (
        <div className="financial-sparkline-area relative" style={areaStyle}>
          {single}
          {text && points && <ChartCaption text={text} edge={captionEdge(points)} scale={scale} />}
        </div>
      );
    } else {
      charts = single && text ? classicSlot(single, text) : single;
    }
  }

  return (
    <ContentCard
      className="flex flex-col items-center justify-center"
      style={{
        padding: `${0.75 * scale}em ${1 * scale}em`,
        gap: `${0.25 * scale}em`,
      }}
    >
      <span className="font-semibold tracking-wider" style={{ fontSize: `${0.75 * scale}em`, opacity: TEXT_OPACITY.secondary }}>{label}</span>
      <span className="font-bold whitespace-nowrap tabular-nums" style={{ fontSize: `${1.25 * scale}em` }}>${price.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      <span className={`whitespace-nowrap tabular-nums ${dayPositive ? 'text-green-400' : 'text-red-400'}`} style={{ fontSize: `${0.75 * scale}em` }}>
        {changeLabel}
      </span>
      {charts}
    </ContentCard>
  );
}
