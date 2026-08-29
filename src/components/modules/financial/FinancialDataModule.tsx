'use client';

import type { ReactNode } from 'react';
import type { ModuleStyle } from '@/types/config';
import ModuleWrapper from '../ModuleWrapper';
import { moduleGate } from '../ModuleStates';
import {
  FinancialCardsView,
  FinancialTickerView,
  FinancialTableView,
  FinancialCompactView,
} from './shared';
import type { FinancialItem, TableColumn, CompactRow, SparklineLabels, SparklineMode, SparklineTheme } from './shared';
import { useFetchData } from '@/hooks/useFetchData';

interface FinancialDataModuleProps<TItem> {
  url: string;
  refreshIntervalMs: number;
  dataKey: string;
  toFinancialItems: (items: TItem[]) => FinancialItem[];
  toCompactRows: (items: TItem[]) => CompactRow[];
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
  /** When set, renders a single-item layout instead of the shared views.
   * Receives the first item; only called after the loading/empty gates pass. */
  renderSingle?: (item: TItem) => ReactNode;
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
  renderSingle,
}: FinancialDataModuleProps<TItem>) {
  const [data, error] = useFetchData<Record<string, TItem[]>>(url, refreshIntervalMs);
  const items = (data?.[dataKey] as TItem[] | undefined) ?? [];

  const gate = moduleGate({
    style, data, error,
    loadingMessage,
    empty: items.length === 0 && emptyMessage,
  });
  if (gate) return gate;

  if (renderSingle) {
    return (
      <ModuleWrapper style={style}>
        {items.length > 0 ? renderSingle(items[0]) : null}
      </ModuleWrapper>
    );
  }

  return (
    <ModuleWrapper style={style}>
      {view === 'cards' && (
        <FinancialCardsView items={toFinancialItems(items)} scale={cardScale} showSparkline={showSparkline}
          sparklineMode={sparklineMode}
          sparklineTheme={sparklineTheme}
          sparklineLabels={sparklineLabels} />
      )}
      {view === 'ticker' && <FinancialTickerView items={toFinancialItems(items)} speed={tickerSpeed} />}
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
          rows={toCompactRows(items)}
          scale={cardScale}
          labelWidth={compactLabelWidth}
        />
      )}
    </ModuleWrapper>
  );
}
