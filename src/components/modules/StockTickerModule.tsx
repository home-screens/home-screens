'use client';

import { useMemo } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import type { StockTickerConfig, ModuleStyle } from '@/types/config';
import { useTranslate, useFormattingLocale } from '@/i18n';
import {
  formatUSD,
  formatPercent,
  formatChange,
  ChangeColor,
  NO_CHANGE,
} from './financial/shared';
import type { TableColumn, FinancialItem, CompactRow } from './financial/shared';
import FinancialDataModule from './financial/FinancialDataModule';
import { stocksUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';

interface StockTickerModuleProps {
  config: StockTickerConfig;
  style: ModuleStyle;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['stock-ticker']?.ttlMs ?? 30_000;

interface StockData {
  symbol: string;
  name?: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  sparkline?: number[];
  sparklineXs?: number[];
  sparklineHourMarks?: number[];
  sparklineWeek?: number[];
  weekChangePercent?: number | null;
  weekLastDayStart?: number;
  weekDayBoundaries?: number[];
}

/** Today's move as text; an en dash when the API had no prior close to measure from. */
function formatChangeLabel(change: number | null, changePercent: number | null, locale: string): string {
  if (change == null || changePercent == null) return NO_CHANGE;
  return `${formatChange(change, locale)} (${formatPercent(changePercent, locale)})`;
}

/** A change cell: the signed number in green or red, or a plain dash when there is none. */
function ChangeCell({ value, text, className }: { value: number | null | undefined; text: (value: number) => string; className?: string }) {
  if (value == null) return <span className={className} style={{ opacity: TEXT_OPACITY.dim }}>{NO_CHANGE}</span>;
  return (
    <ChangeColor value={value}>
      {className ? <span className={className}>{text(value)}</span> : text(value)}
    </ChangeColor>
  );
}

function toFinancialItems(stocks: StockData[], locale: string): FinancialItem[] {
  return stocks.map((stock, i) => {
    return {
      key: `${stock.symbol}-${i}`,
      label: stock.symbol,
      name: stock.name,
      price: stock.price ?? 0,
      changeValue: stock.change ?? 0,
      changeLabel: formatChangeLabel(stock.change ?? null, stock.changePercent ?? null, locale),
      sparkline: stock.sparkline,
      sparklineXs: stock.sparklineXs,
      sparklineHourMarks: stock.sparklineHourMarks,
      weekSparkline: stock.sparklineWeek,
      weekPositive: stock.weekChangePercent == null ? undefined : stock.weekChangePercent >= 0,
      weekHighlightFromX: stock.weekLastDayStart,
      weekDayBoundaries: stock.weekDayBoundaries,
    };
  });
}

function toCompactRows(stocks: StockData[], locale: string): CompactRow[] {
  return stocks.map((stock, i) => ({
    key: `${stock.symbol}-${i}`,
    label: stock.symbol,
    price: formatUSD(stock.price ?? 0, locale),
    change: (
      <ChangeCell value={stock.changePercent} text={(v) => formatPercent(v, locale)} className="tabular-nums w-20 text-right" />
    ),
  }));
}

export default function StockTickerModule({ config, style }: StockTickerModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

  const stockTableColumns = useMemo<TableColumn<StockData>[]>(() => [
    {
      header: t('stock-ticker.headers.symbol'),
      render: (stock) => <span className="font-semibold" style={{ opacity: TEXT_OPACITY.heading }}>{stock.symbol}</span>,
    },
    {
      header: t('stock-ticker.headers.price'),
      align: 'right',
      render: (stock) => (
        <span className="font-bold">
          {formatUSD(stock.price ?? 0, locale)}
        </span>
      ),
    },
    {
      header: t('stock-ticker.headers.change'),
      align: 'right',
      render: (stock) => <ChangeCell value={stock.change} text={(v) => formatChange(v, locale)} />,
    },
    {
      header: t('stock-ticker.headers.percent'),
      align: 'right',
      render: (stock) => <ChangeCell value={stock.changePercent} text={(v) => formatPercent(v, locale)} />,
    },
  ], [t, locale]);

  const view = config.view ?? 'cards';
  // Cards caption with the terse 1D / 5D; the single tile has room for the
  // long form (1-day / 5-days) above each chart.
  const labelKey = view === 'single' ? 'chartCaptions' : 'chartLabels';

  return (
    <FinancialDataModule<StockData>
      url={stocksUrl(config) ?? ''}
      refreshIntervalMs={config.refreshIntervalMs ?? DEFAULT_REFRESH_MS}
      dataKey="stocks"
      toFinancialItems={toFinancialItems}
      toCompactRows={toCompactRows}
      tableColumns={stockTableColumns}
      tableItemKey={(stock, i) => `${stock.symbol}-${i}`}
      view={view}
      cardScale={config.cardScale ?? 1}
      tickerSpeed={config.tickerSpeed ?? 5}
      showSparkline={config.showSparkline ?? true}
      sparklineMode={config.sparklineMode ?? 'day'}
      sparklineTheme={config.sparklineTheme ?? 'classic'}
      sparklineLabels={config.sparklineLabels
        ? { day: t(`stock-ticker.${labelKey}.day`), week: t(`stock-ticker.${labelKey}.week`) }
        : undefined}
      style={style}
      loadingMessage={t('stock-ticker.loading')}
      emptyMessage={t('stock-ticker.empty')}
    />
  );
}
