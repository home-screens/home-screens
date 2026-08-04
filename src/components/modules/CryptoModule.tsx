'use client';

import { useMemo } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import type { CryptoConfig, ModuleStyle } from '@/types/config';
import {
  formatUSD,
  formatPercent,
  ChangeColor,
} from './financial/shared';
import type { TableColumn, FinancialItem, CompactRow } from './financial/shared';
import FinancialDataModule from './financial/FinancialDataModule';
import { cryptoUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import { useTranslate } from '@/i18n';

interface CryptoModuleProps {
  config: CryptoConfig;
  style: ModuleStyle;
}

const DEFAULT_REFRESH_MS = FETCH_KEY_REGISTRY['crypto']?.ttlMs ?? 30_000;

interface CryptoData {
  name: string;
  price: number;
  change24h: number;
  sparkline?: number[];
}

function toFinancialItems(coins: CryptoData[]): FinancialItem[] {
  return coins.map((coin) => ({
    key: coin.name,
    label: coin.name,
    price: coin.price,
    changeValue: coin.change24h,
    changeLabel: formatPercent(coin.change24h),
    sparkline: coin.sparkline,
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

export default function CryptoModule({ config, style }: CryptoModuleProps) {
  const t = useTranslate('modules');

  const cryptoTableColumns = useMemo<TableColumn<CryptoData>[]>(() => [
    {
      header: t('crypto.headers.coin'),
      render: (coin) => <span className="font-semibold" style={{ opacity: TEXT_OPACITY.heading }}>{coin.name}</span>,
    },
    {
      header: t('crypto.headers.price'),
      align: 'right',
      render: (coin) => (
        <span className="font-bold">
          {formatUSD(coin.price)}
        </span>
      ),
    },
    {
      header: t('crypto.headers.percent'),
      align: 'right',
      render: (coin) => (
        <ChangeColor value={coin.change24h}>{formatPercent(coin.change24h)}</ChangeColor>
      ),
    },
  ], [t]);

  return (
    <FinancialDataModule<CryptoData>
      url={cryptoUrl(config) ?? ''}
      refreshIntervalMs={config.refreshIntervalMs ?? DEFAULT_REFRESH_MS}
      dataKey="prices"
      toFinancialItems={toFinancialItems}
      toCompactRows={toCompactRows}
      tableColumns={cryptoTableColumns}
      tableItemKey={(coin) => coin.name}
      view={config.view ?? 'cards'}
      cardScale={config.cardScale ?? 1}
      tickerSpeed={config.tickerSpeed ?? 5}
      showSparkline={config.showSparkline ?? true}
      style={style}
      loadingMessage={t('crypto.loading')}
      emptyMessage={t('crypto.empty')}
      compactLabelWidth="w-24"
    />
  );
}
