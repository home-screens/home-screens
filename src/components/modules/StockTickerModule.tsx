'use client';

import { useMemo } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import type { StockTickerConfig, ModuleStyle } from '@/types/config';
import { useTranslate } from '@/i18n';
import {
  formatUSD,
  formatPercent,
  ChangeColor,
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
  price: number | null;
  change: number | null;
  changePercent: number | null;
  sparkline?: number[];
}

function formatChange(val: number) {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}`;
}

function toFinancialItems(stocks: StockData[]): FinancialItem[] {
  return stocks.map((stock, i) => {
    const change = stock.change ?? 0;
    const changePercent = stock.changePercent ?? 0;
    return {
      key: `${stock.symbol}-${i}`,
      label: stock.symbol,
      price: stock.price ?? 0,
      changeValue: change,
      changeLabel: `${formatChange(change)} (${formatPercent(changePercent)})`,
      sparkline: stock.sparkline,
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
      style={style}
      loadingMessage={t('stock-ticker.loading')}
      emptyMessage={t('stock-ticker.empty')}
    />
  );
}
