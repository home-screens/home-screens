'use client';

import type { ReactNode } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale } from '@/i18n';
import { ContentCard } from './shared/ContentCard';
import { Sparkline } from './financial/shared';
import type { SparklineMode, SparklineTheme } from './financial/shared';

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
  sparklineMode?: SparklineMode;
  sparklineTheme?: SparklineTheme;
}

export default function FinancialCard({
  label, price, changeValue, changeLabel, scale,
  sparkline, sparklineXs, weekSparkline, weekPositive, weekHighlightFromX,
  sparklineMode = 'day', sparklineTheme = 'classic',
}: FinancialCardProps) {
  const dayPositive = changeValue >= 0;
  const shaded = sparklineTheme === 'shaded';
  const locale = useFormattingLocale();

  // Classic keeps today's color for every chart; shaded colors each chart by
  // its own period's move (week falls back to the day color without data).
  const hasDay = !!sparkline && sparkline.length >= 2;
  const hasWeek = !!weekSparkline && weekSparkline.length >= 2;
  const weekColor = shaded ? (weekPositive ?? dayPositive) : dayPositive;
  const dayXs = shaded ? sparklineXs : undefined;

  // Shaded charts stretch across the card's full width. The content box sits
  // 1em from the tile edges (0.75em below the charts), so the chart area
  // pulls 0.25em past the content box on each side to match that inset.
  // Classic keeps its fixed em widths untouched.
  const areaStyle = shaded ? { marginInline: `${-0.25 * scale}em` } : undefined;

  const dayChart = hasDay ? (
    <Sparkline points={sparkline} positive={dayPositive} scale={scale}
      xs={dayXs} shaded={shaded} fillWidth={shaded} />
  ) : null;
  const weekChart = hasWeek ? (
    <Sparkline points={weekSparkline} positive={weekColor} scale={scale}
      highlightFromX={shaded ? weekHighlightFromX : undefined}
      shaded={shaded} fillWidth={shaded} />
  ) : null;

  let charts: ReactNode;
  if (sparklineMode === 'both') {
    charts = hasDay || hasWeek ? (
      shaded ? (
        // Both charts stretch to 100% and flex-shrink to equal halves; the
        // row carries the shared side inset.
        <div className="financial-sparkline-row flex items-center justify-center w-full"
          style={{ gap: `${0.5 * scale}em`, ...areaStyle }}>
          {hasDay && <Sparkline points={sparkline} positive={dayPositive} scale={scale}
            xs={dayXs} shaded fillWidth />}
          {hasWeek && <Sparkline points={weekSparkline} positive={weekColor}
            scale={scale} highlightFromX={weekHighlightFromX} shaded fillWidth />}
        </div>
      ) : (
        <div className="financial-sparkline-row flex items-center justify-center w-full"
          style={{ gap: `${0.5 * scale}em` }}>
          {hasDay && <Sparkline points={sparkline} positive={dayPositive} scale={scale}
            xs={dayXs} shaded={shaded} widthEm={2.6} />}
          {hasWeek && <Sparkline points={weekSparkline} positive={weekColor}
            scale={scale} shaded={shaded} widthEm={2.6} />}
        </div>
      )
    ) : null;
  } else {
    // Single chart (day or week): shaded wraps it to fill the card width;
    // classic renders today's bare fixed-width Sparkline.
    const single = sparklineMode === 'week' ? weekChart : dayChart;
    charts = shaded && single ? (
      <div className="w-full" style={areaStyle}>{single}</div>
    ) : single;
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
