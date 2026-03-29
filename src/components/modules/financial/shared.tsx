import type { ReactNode } from 'react';
import FinancialCard from '../FinancialCard';
import TickerMarquee from '../TickerMarquee';

/** Format a price as USD: $1,234.56 */
export function formatUSD(price: number): string {
  return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

// ── Shared item shape for cards/ticker views ──

export interface FinancialItem {
  key: string;
  label: string;
  price: number;
  changeValue: number;
  changeLabel: string;
}

// ── Cards View ──

/** Shared cards view — grid of FinancialCards */
export function FinancialCardsView({ items, scale }: { items: FinancialItem[]; scale: number }) {
  return (
    <div className="flex flex-wrap items-center justify-center h-full gap-3 w-full">
      {items.map((item) => (
        <FinancialCard
          key={item.key}
          label={item.label}
          price={item.price}
          changeValue={item.changeValue}
          changeLabel={item.changeLabel}
          scale={scale}
        />
      ))}
    </div>
  );
}

// ── Ticker View ──

/** Shared ticker view — horizontal scrolling marquee */
export function FinancialTickerView({ items, speed }: { items: FinancialItem[]; speed: number }) {
  return (
    <TickerMarquee itemCount={items.length} speed={speed}>
      {items.map((item) => (
        <span key={item.key} className="inline-flex items-center gap-2" style={{ fontSize: '0.875em' }}>
          <span className="font-semibold opacity-80">{item.label}</span>
          <span className="font-bold">
            {formatUSD(item.price)}
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
          <tr className="opacity-50 text-left" style={{ fontSize: `${0.8 * scale}em` }}>
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
          <span className={`font-semibold opacity-80 ${labelWidth}`}>{row.label}</span>
          <span className="font-bold tabular-nums">{row.price}</span>
          {row.change}
        </div>
      ))}
    </div>
  );
}
