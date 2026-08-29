'use client';

import { useId, type ReactNode } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useFormattingLocale } from '@/i18n';
import { DEFAULT_LOCALE } from '@/i18n/manifest';
import FinancialCard from '../FinancialCard';
import TickerMarquee from '../TickerMarquee';

/**
 * Format a price as USD: $1,234.56
 *
 * `locale` controls thousands-separator / decimal style only — the `$`
 * prefix is hard-coded because the rest of the financial module assumes
 * USD pricing. Defaults to `DEFAULT_LOCALE` so out-of-scope callers
 * (StockTickerModule / CryptoModule, migrated in Tasks 4–5) keep
 * working unchanged.
 */
export function formatUSD(price: number, locale: string = DEFAULT_LOCALE): string {
  return `$${price.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a percentage value with sign prefix */
export function formatPercent(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

/** Colour-code a value: green for positive, red for negative */
export function ChangeColor({ value, children }: { value: number; children: ReactNode }) {
  return (
    <span className={value >= 0 ? 'text-green-400' : 'text-red-400'}>
      {children}
    </span>
  );
}

// ── Sparkline ──

interface SparklineProps {
  points: number[];
  positive: boolean;
  scale: number;
  /** Optional 0-1 x positions (session-time fractions). Shaded mode only. */
  xs?: number[];
  /** Chart width in em before scale; default 5.5. */
  widthEm?: number;
  /** Stretch to the container's width instead of a fixed em width (shaded layout). */
  fillWidth?: boolean;
  /** Shaded theme: backdrop + under-line tint + xs time scaling. */
  shaded?: boolean;
  /** Shade the region from this 0-1 x fraction to the right edge (week chart's last day). Shaded mode only. */
  highlightFromX?: number;
  /** Faint vertical ticks at these 0-1 x fractions (session boundaries). Shaded mode only. */
  dividers?: number[];
}

/** Tiny trend line — colour matches the change value, shape is the price series */
export function Sparkline({ points, positive, scale, xs, widthEm, fillWidth, shaded, highlightFromX, dividers }: SparklineProps) {
  const gradientId = useId();
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const positions =
    shaded && xs && xs.length === points.length
      ? xs
      : points.map((_, i) => i / (points.length - 1));
  const coordPairs = points.map((p, i) => {
    const x = positions[i] * 100;
    // 2-unit padding inside the 32-unit viewBox so the stroke never clips
    const y = range === 0 ? 16 : 30 - ((p - min) / range) * 28;
    // toFixed(2) strings, so the classic polyline stays byte-identical
    return { x: x.toFixed(2), y: y.toFixed(2) };
  });
  const coords = coordPairs.map((c) => `${c.x},${c.y}`).join(' ');
  const area =
    `M${coordPairs[0].x},31 ` +
    coordPairs.map((c) => `L${c.x},${c.y}`).join(' ') +
    ` L${coordPairs[coordPairs.length - 1].x},31 Z`;
  return (
    <svg
      className={`financial-sparkline ${shaded ? 'financial-sparkline-shaded ' : ''}${positive ? 'text-green-400' : 'text-red-400'}`}
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      style={{ width: fillWidth ? '100%' : `${(widthEm ?? 5.5) * scale}em`, height: `${1.4 * scale}em`, opacity: 0.85 }}
      aria-hidden="true"
    >
      {shaded && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="currentColor" stopOpacity={0.3} />
              <stop offset="1" stopColor="currentColor" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="100" height="32" fill="currentColor" opacity={0.1} />
          {highlightFromX !== undefined && highlightFromX >= 0 && highlightFromX < 1 && (
            <rect x={(highlightFromX * 100).toFixed(2)} y="0"
              width={(100 - highlightFromX * 100).toFixed(2)} height="32"
              fill="currentColor" opacity={0.15} />
          )}
          {dividers?.map((x) => (
            <line key={x} className="financial-sparkline-divider"
              x1={(x * 100).toFixed(2)} y1="0" x2={(x * 100).toFixed(2)} y2="32"
              stroke="currentColor" strokeOpacity={0.18} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill={`url(#${gradientId})`} />
        </>
      )}
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Shared item shape for cards/ticker views ──

/** Which chart(s) the cards view draws */
export type SparklineMode = 'day' | 'week' | 'both';
/** 'classic' keeps the plain line; 'shaded' adds backdrop + tint + xs scaling */
export type SparklineTheme = 'classic' | 'shaded';
/** Range captions drawn on the charts (already translated: 1D / 5D, 1T / 5T, ...) */
export interface SparklineLabels { day: string; week: string }

export interface FinancialItem {
  key: string;
  label: string;
  price: number;
  changeValue: number;
  changeLabel: string;
  sparkline?: number[];
  sparklineXs?: number[];
  weekSparkline?: number[];
  weekPositive?: boolean;
  weekHighlightFromX?: number;
}

// ── Cards View ──

/** Shared cards view — grid of FinancialCards. Equal grid tracks (not
 * flex-wrap) so cards on different rows stay column-aligned regardless
 * of how wide each card's price/change text is. */
export function FinancialCardsView({
  items, scale, showSparkline, sparklineMode = 'day', sparklineTheme = 'classic', sparklineLabels,
}: {
  items: FinancialItem[];
  scale: number;
  showSparkline?: boolean;
  sparklineMode?: SparklineMode;
  sparklineTheme?: SparklineTheme;
  sparklineLabels?: SparklineLabels;
}) {
  return (
    <div
      className="grid content-center h-full gap-3 w-full"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${9 * scale}em, 1fr))` }}
    >
      {items.map((item) => (
        <FinancialCard
          key={item.key}
          label={item.label}
          price={item.price}
          changeValue={item.changeValue}
          changeLabel={item.changeLabel}
          sparkline={showSparkline ? item.sparkline : undefined}
          sparklineXs={showSparkline ? item.sparklineXs : undefined}
          weekSparkline={showSparkline ? item.weekSparkline : undefined}
          weekPositive={showSparkline ? item.weekPositive : undefined}
          weekHighlightFromX={showSparkline ? item.weekHighlightFromX : undefined}
          sparklineMode={sparklineMode}
          sparklineTheme={sparklineTheme}
          sparklineLabels={showSparkline ? sparklineLabels : undefined}
          scale={scale}
        />
      ))}
    </div>
  );
}

// ── Ticker View ──

/** Shared ticker view — horizontal scrolling marquee */
export function FinancialTickerView({ items, speed }: { items: FinancialItem[]; speed: number }) {
  const locale = useFormattingLocale();
  return (
    <TickerMarquee itemCount={items.length} speed={speed}>
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-2" style={{ fontSize: '0.875em' }}>
          <span className="font-semibold" style={{ opacity: TEXT_OPACITY.heading }}>{item.label}</span>
          <span className="font-bold">
            {formatUSD(item.price, locale)}
          </span>
          <ChangeColor value={item.changeValue}>
            {item.changeLabel}
          </ChangeColor>
        </span>
      ))}
    </TickerMarquee>
  );
}

// ── Table View ──

export interface TableColumn<T> {
  header: string;
  align?: 'left' | 'right';
  render: (item: T, index: number) => ReactNode;
}

interface FinancialTableViewProps<T> {
  items: T[];
  columns: TableColumn<T>[];
  scale: number;
  itemKey: (item: T, index: number) => string;
}

/** Generic table view for financial data */
export function FinancialTableView<T>({ items, columns, scale, itemKey }: FinancialTableViewProps<T>) {
  return (
    <div className="flex items-center justify-center h-full w-full">
      <table
        className="border-collapse"
        style={{ fontSize: `${0.875 * scale}em` }}
      >
        <thead>
          <tr className="text-left" style={{ fontSize: `${0.8 * scale}em`, opacity: TEXT_OPACITY.dim }}>
            {columns.map((col, ci) => (
              <th
                key={ci}
                className={`pb-1 font-medium ${ci < columns.length - 1 ? 'pr-4' : ''} ${col.align === 'right' ? 'text-right' : ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={itemKey(item, i)}>
              {columns.map((col, ci) => (
                <td
                  key={ci}
                  className={`py-0.5 ${ci < columns.length - 1 ? 'pr-4' : ''} ${col.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {col.render(item, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Compact View ──

export interface CompactRow {
  key: string;
  label: ReactNode;
  price: ReactNode;
  change: ReactNode;
}

interface FinancialCompactViewProps {
  rows: CompactRow[];
  scale: number;
  labelWidth?: string;
}

/** Generic compact view for financial data */
export function FinancialCompactView({ rows, scale, labelWidth = 'w-20' }: FinancialCompactViewProps) {
  return (
    <div className="flex flex-col justify-center h-full w-full gap-1 px-2">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between"
          style={{ fontSize: `${0.85 * scale}em` }}
        >
          <span className={`font-semibold ${labelWidth}`} style={{ opacity: TEXT_OPACITY.heading }}>{row.label}</span>
          <span className="font-bold tabular-nums">{row.price}</span>
          {row.change}
        </div>
      ))}
    </div>
  );
}
