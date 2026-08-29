'use client';

import { useMemo } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import type { StockTickerConfig, ModuleStyle } from '@/types/config';
import { useTranslate } from '@/i18n';
import {
  formatUSD,
  formatPercent,
  formatChange,
  ChangeColor,
} from './financial/shared';
import type { TableColumn, FinancialItem, CompactRow } from './financial/shared';
import FinancialDataModule from './financial/FinancialDataModule';
import SingleTile from './financial/SingleTile';
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
function formatChangeLabel(change: number | null, changePercent: number | null): string {
  if (change == null || changePercent == null) return '\u2013';
  return `${formatChange(change)} (${formatPercent(changePercent)})`;
}

function toFinancialItems(stocks: StockData[]): FinancialItem[] {
  return stocks.map((stock, i) => {
    return {
      key: `${stock.symbol}-${i}`,
      label: stock.symbol,
      price: stock.price ?? 0,
      changeValue: stock.change ?? 0,
      changeLabel: formatChangeLabel(stock.change ?? null, stock.changePercent ?? null),
      sparkline: stock.sparkline,
      sparklineXs: stock.sparklineXs,
      weekSparkline: stock.sparklineWeek,
      weekPositive: stock.weekChangePercent == null ? undefined : stock.weekChangePercent >= 0,
      weekHighlightFromX: stock.weekLastDayStart,
      weekDayBoundaries: stock.weekDayBoundaries,
    };
  });
}

function toCompactRows(stocks: StockData[]): CompactRow[] {
  return stocks.map((stock, i) => {
    const changePercent = stock.changePercent ?? 0;
    return {
      key: `${stock.symbol}-${i}`,
      label: stock.symbol,
      price: formatUSD(stock.price ?? 0),
      change: (
        <ChangeColor value={changePercent}>
          <span className="tabular-nums w-20 text-right">{formatPercent(changePercent)}</span>
        </ChangeColor>
      ),
    };
  });
}

export default function StockTickerModule({ config, style }: StockTickerModuleProps) {
  const t = useTranslate('modules');

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
          {formatUSD(stock.price ?? 0)}
        </span>
      ),
    },
    {
      header: t('stock-ticker.headers.change'),
      align: 'right',
      render: (stock) => {
        const change = stock.change ?? 0;
        return <ChangeColor value={change}>{formatChange(change)}</ChangeColor>;
      },
    },
    {
      header: t('stock-ticker.headers.percent'),
      align: 'right',
      render: (stock) => {
        const changePercent = stock.changePercent ?? 0;
        return <ChangeColor value={changePercent}>{formatPercent(changePercent)}</ChangeColor>;
      },
    },
  ], [t]);

  const displayMode = config.displayMode ?? 'multiple';
  const sparklineMode = config.sparklineMode ?? 'day';
  const sparklineTheme = config.sparklineTheme ?? 'classic';

  return (
    <FinancialDataModule<StockData>
      url={stocksUrl(config) ?? ''}
      refreshIntervalMs={config.refreshIntervalMs ?? DEFAULT_REFRESH_MS}
      dataKey="stocks"
      toFinancialItems={toFinancialItems}
      toCompactRows={toCompactRows}
      tableColumns={stockTableColumns}
      tableItemKey={(stock, i) => `${stock.symbol}-${i}`}
      view={config.view ?? 'cards'}
      cardScale={config.cardScale ?? 1}
      tickerSpeed={config.tickerSpeed ?? 5}
      showSparkline={config.showSparkline ?? true}
      sparklineMode={sparklineMode}
      sparklineTheme={sparklineTheme}
      sparklineLabels={config.sparklineLabels
        ? { day: t('stock-ticker.chartLabels.day'), week: t('stock-ticker.chartLabels.week') }
        : undefined}
      style={style}
      loadingMessage={t('stock-ticker.loading')}
      emptyMessage={t('stock-ticker.empty')}
      renderSingle={displayMode === 'single'
        ? (stock) => (
          <SingleTile
            symbol={stock.symbol}
            name={stock.name}
            price={stock.price}
            change={stock.change}
            changePercent={stock.changePercent}
            sparkline={stock.sparkline}
            sparklineXs={stock.sparklineXs}
            sparklineHourMarks={stock.sparklineHourMarks}
            sparklineWeek={stock.sparklineWeek}
            weekChangePercent={stock.weekChangePercent}
            weekLastDayStart={stock.weekLastDayStart}
            weekDayBoundaries={stock.weekDayBoundaries}
            sparklineMode={sparklineMode}
            sparklineTheme={sparklineTheme}
            chartCaptions={config.sparklineLabels
              ? { day: t('stock-ticker.chartCaptions.day'), week: t('stock-ticker.chartCaptions.week') }
              : undefined}
          />
        )
        : undefined}
    />
  );
}
