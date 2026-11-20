'use client';

import type { ModuleStyle } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';
import { moduleGate } from '../ModuleStates';
import {
  FinancialCardsView,
  FinancialTickerView,
  FinancialTableView,
  FinancialCompactView,
} from './shared';
import SingleTile from './SingleTile';
import type { FinancialItem, TableColumn, CompactRow, SparklineLabels, SparklineMode, SparklineTheme } from './shared';
import { useFetchData } from '@/hooks/useFetchData';
import { useFormattingLocale } from '@/i18n';

interface FinancialDataModuleProps<TItem> {
  url: string;
  refreshIntervalMs: number;
  dataKey: string;
  /** Both take the number format (`useFormattingLocale`) every view prints in. */
  toFinancialItems: (items: TItem[], locale: string) => FinancialItem[];
  toCompactRows: (items: TItem[], locale: string) => CompactRow[];
  tableColumns: TableColumn<TItem>[];
  tableItemKey: (item: TItem, index: number) => string;
  view: string;
  cardScale: number;
  tickerSpeed: number;
  showSparkline?: boolean;
  sparklineMode?: SparklineMode;
  sparklineTheme?: SparklineTheme;
  sparklineLabels?: SparklineLabels;
  style: ModuleStyle;
  loadingMessage: string;
  emptyMessage: string;
  compactLabelWidth?: string;
}

export default function FinancialDataModule<TItem>({
  url,
  refreshIntervalMs,
  dataKey,
  toFinancialItems,
  toCompactRows,
  tableColumns,
  tableItemKey,
  view,
  cardScale,
  tickerSpeed,
  showSparkline,
  sparklineMode,
  sparklineTheme,
  sparklineLabels,
  style,
  loadingMessage,
  emptyMessage,
  compactLabelWidth,
}: FinancialDataModuleProps<TItem>) {
  const locale = useFormattingLocale();
  const [data, error] = useFetchData<Record<string, TItem[]>>(url, refreshIntervalMs);
  const items = (data?.[dataKey] as TItem[] | undefined) ?? [];

  const gate = moduleGate({
    style, data, error,
    loadingMessage,
    empty: items.length === 0 && emptyMessage,
  });
  if (gate) return gate;

  return (
    <ModuleWrapper style={style}>
      {view === 'single' && (
        <SingleTile item={toFinancialItems(items, locale)[0]}
          sparklineMode={sparklineMode ?? 'day'}
          sparklineTheme={sparklineTheme ?? 'classic'}
          labels={sparklineLabels} />
      )}
      {view === 'cards' && (
        <FinancialCardsView items={toFinancialItems(items, locale)} scale={cardScale} showSparkline={showSparkline}
          sparklineMode={sparklineMode}
          sparklineTheme={sparklineTheme}
          sparklineLabels={sparklineLabels} />
      )}
      {view === 'ticker' && <FinancialTickerView items={toFinancialItems(items, locale)} speed={tickerSpeed} />}
      {view === 'table' && (
        <FinancialTableView
          items={items}
          columns={tableColumns}
          scale={cardScale}
          itemKey={tableItemKey}
        />
      )}
      {view === 'compact' && (
        <FinancialCompactView
          rows={toCompactRows(items, locale)}
          scale={cardScale}
          labelWidth={compactLabelWidth}
        />
      )}
    </ModuleWrapper>
  );
}
