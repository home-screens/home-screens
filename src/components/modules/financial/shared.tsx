'use client';

import type { ReactNode } from 'react';
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
}

/** Tiny trend line — colour matches the change value, shape is the price series */
export function Sparkline({ points, positive, scale }: SparklineProps) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      // 2-unit padding inside the 32-unit viewBox so the stroke never clips
      const y = range === 0 ? 16 : 30 - ((p - min) / range) * 28;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  return (
    <svg
      className={`financial-sparkline ${positive ? 'text-green-400' : 'text-red-400'}`}
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      style={{ width: `${5.5 * scale}em`, height: `${1.4 * scale}em`, opacity: 0.85 }}
      aria-hidden="true"
    >
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

export interface FinancialItem {
  key: string;
  label: string;
  price: number;
  changeValue: number;
  changeLabel: string;
  sparkline?: number[];
}

// ── Cards View ──

/** Shared cards view — grid of FinancialCards */
export function FinancialCardsView({ items, scale, showSparkline }: { items: FinancialItem[]; scale: number; showSparkline?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-center h-full gap-3 w-full">
      {items.map((item) => (
        <FinancialCard
          key={item.key}
          label={item.label}
          price={item.price}
          changeValue={item.changeValue}
          changeLabel={item.changeLabel}
          sparkline={showSparkline ? item.sparkline : undefined}
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
