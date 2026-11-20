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
import { useTranslate, useFormattingLocale } from '@/i18n';

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

/**
 * The source's line is the last seven days, while the number beside it is
 * the last 24 hours. So the line goes in the week slot and takes its color
 * from its own first and last point: a coin down on the week and up today
 * draws a falling red line beside a green number.
 */
function toFinancialItems(coins: CryptoData[], locale: string): FinancialItem[] {
  return coins.map((coin) => {
    const week = coin.sparkline && coin.sparkline.length >= 2 ? coin.sparkline : undefined;
    return {
      key: coin.name,
      label: coin.name,
      price: coin.price,
      changeValue: coin.change24h,
      changeLabel: formatPercent(coin.change24h, locale),
      weekSparkline: week,
      weekPositive: week ? week[week.length - 1] >= week[0] : undefined,
    };
  });
}

function toCompactRows(coins: CryptoData[], locale: string): CompactRow[] {
  return coins.map((coin) => ({
    key: coin.name,
    label: coin.name,
    price: formatUSD(coin.price, locale),
    change: (
      <ChangeColor value={coin.change24h}>
        <span className="tabular-nums w-20 text-right">{formatPercent(coin.change24h, locale)}</span>
      </ChangeColor>
    ),
  }));
}

export default function CryptoModule({ config, style }: CryptoModuleProps) {
  const t = useTranslate('modules');
  const locale = useFormattingLocale();

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
          {formatUSD(coin.price, locale)}
        </span>
      ),
    },
    {
      header: t('crypto.headers.percent'),
      align: 'right',
      render: (coin) => (
        <ChangeColor value={coin.change24h}>{formatPercent(coin.change24h, locale)}</ChangeColor>
      ),
    },
  ], [t, locale]);

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
      sparklineMode="week"
      sparklineTheme={config.sparklineTheme ?? 'classic'}
      sparklineLabels={config.sparklineLabels ? { day: '', week: t('crypto.chartLabels.week') } : undefined}
      style={style}
      loadingMessage={t('crypto.loading')}
      emptyMessage={t('crypto.empty')}
      compactLabelWidth="w-24"
    />
  );
}
