'use client';

import { TEXT_OPACITY } from '@/lib/constants';
import type { CryptoConfig, ModuleStyle } from '@/types/config';
import {
  formatUSD,
  formatPercent,
  ChangeColor,
} from './financial/shared';
import type { TableColumn, FinancialItem, CompactRow } from './financial/shared';
import FinancialDataModule from './financial/FinancialDataModule';
import { cryptoUrl } from '@/lib/fetch-keys';

interface CryptoModuleProps {
  config: CryptoConfig;
  style: ModuleStyle;
}

interface CryptoData {
  name: string;
  price: number;
  change24h: number;
}

function toFinancialItems(coins: CryptoData[]): FinancialItem[] {
  return coins.map((coin) => ({
    key: coin.name,
    label: coin.name,
    price: coin.price,
    changeValue: coin.change24h,
    changeLabel: formatPercent(coin.change24h),
  }));
}

function toCompactRows(coins: CryptoData[]): CompactRow[] {
  return coins.map((coin) => ({
    key: coin.name,
    label: coin.name,
    price: formatUSD(coin.price),
    change: (
      <ChangeColor value={coin.change24h}>
        <span className="tabular-nums w-20 text-right">{formatPercent(coin.change24h)}</span>
      </ChangeColor>
    ),
  }));
}

const cryptoTableColumns: TableColumn<CryptoData>[] = [
  {
    header: 'Coin',
    render: (coin) => <span className="font-semibold" style={{ opacity: TEXT_OPACITY.heading }}>{coin.name}</span>,
  },
  {
    header: 'Price',
    align: 'right',
    render: (coin) => (
      <span className="font-bold">
        {formatUSD(coin.price)}
      </span>
    ),
  },
  {
    header: '24h %',
    align: 'right',
    render: (coin) => (
      <ChangeColor value={coin.change24h}>{formatPercent(coin.change24h)}</ChangeColor>
    ),
  },
];

export default function CryptoModule({ config, style }: CryptoModuleProps) {
  return (
    <FinancialDataModule<CryptoData>
      url={cryptoUrl(config) ?? ''}
      refreshIntervalMs={config.refreshIntervalMs ?? 60000}
      dataKey="prices"
      toFinancialItems={toFinancialItems}
      toCompactRows={toCompactRows}
      tableColumns={cryptoTableColumns}
      tableItemKey={(coin) => coin.name}
      view={config.view ?? 'cards'}
      cardScale={config.cardScale ?? 1}
      tickerSpeed={config.tickerSpeed ?? 5}
      style={style}
      loadingMessage="Loading…"
      emptyMessage="No crypto data"
      compactLabelWidth="w-24"
    />
  );
}
