'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import type { StockTickerConfig, ModuleStyle } from '@/types/config';
import {
  formatUSD,
  formatPercent,
  ChangeColor,
} from './financial/shared';
import type { TableColumn, FinancialItem, CompactRow } from './financial/shared';
import FinancialDataModule from './financial/FinancialDataModule';
import { stocksUrl } from '@/lib/fetch-keys';

interface StockTickerModuleProps {
  config: StockTickerConfig;
  style: ModuleStyle;
}

interface StockData {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
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

const stockTableColumns: TableColumn<StockData>[] = [
  {
    header: 'Symbol',
    render: (stock) => <span className="font-semibold" style={{ opacity: TEXT_OPACITY.heading }}>{stock.symbol}</span>,
  },
  {
    header: 'Price',
    align: 'right',
    render: (stock) => (
      <span className="font-bold">
        {formatUSD(stock.price ?? 0)}
      </span>
    ),
  },
  {
    header: 'Change',
    align: 'right',
    render: (stock) => {
      const change = stock.change ?? 0;
      return <ChangeColor value={change}>{formatChange(change)}</ChangeColor>;
    },
  },
  {
    header: '%',
    align: 'right',
    render: (stock) => {
      const changePercent = stock.changePercent ?? 0;
      return <ChangeColor value={changePercent}>{formatPercent(changePercent)}</ChangeColor>;
    },
  },
];

export default function StockTickerModule({ config, style }: StockTickerModuleProps) {
  return (
    <FinancialDataModule<StockData>
      url={stocksUrl(config) ?? ''}
      refreshIntervalMs={config.refreshIntervalMs ?? 60000}
      dataKey="stocks"
      toFinancialItems={toFinancialItems}
      toCompactRows={toCompactRows}
      tableColumns={stockTableColumns}
      tableItemKey={(stock, i) => `${stock.symbol}-${i}`}
      view={config.view ?? 'cards'}
      cardScale={config.cardScale ?? 1}
      tickerSpeed={config.tickerSpeed ?? 5}
      style={style}
      loadingMessage="Loading…"
      emptyMessage="No stock data"
    />
  );
}
