'use client';

import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import LabeledInput from '@/components/ui/LabeledInput';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, StockTickerView, CryptoView } from '@/types/config';
import type { SparklineMode, SparklineTheme } from '@/components/modules/financial/shared';

type FinancialView = StockTickerView | CryptoView;

const STOCK_VIEWS: readonly StockTickerView[] = ['cards', 'ticker', 'table', 'compact', 'single'];
const CRYPTO_VIEWS: readonly CryptoView[] = ['cards', 'ticker', 'table', 'compact'];

interface FinancialConfigProps {
  mod: ModuleInstance;
  screenId: string;
  symbolsField: string;
  symbolsLabel: string;
  symbolsPlaceholder: string;
  tickerUnitText: string;
  showChartRange?: boolean;
  /** Views this module offers, in menu order. */
  views: readonly FinancialView[];
}

function FinancialConfigSectionInner({ mod, screenId, symbolsField, symbolsLabel, symbolsPlaceholder, tickerUnitText, showChartRange, views }: FinancialConfigProps) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<
    {
      view?: FinancialView;
      refreshIntervalMs?: number;
      cardScale?: number;
      tickerSpeed?: number;
      showSparkline?: boolean;
      sparklineMode?: SparklineMode;
      sparklineTheme?: SparklineTheme;
      sparklineLabels?: boolean;
    } & Record<string, unknown>
  >(mod, screenId);

  const VIEW_LABELS: Record<FinancialView, string> = {
    cards: t('configSections.financial.viewCards'),
    ticker: t('configSections.financial.viewTicker'),
    table: t('configSections.financial.viewTable'),
    compact: t('configSections.financial.viewCompact'),
    single: t('configSections.financial.viewSingle'),
  };
  const viewOptions = views.map((value) => ({ value, label: VIEW_LABELS[value] }));

  const CHART_THEMES = [
    { value: 'classic' as const, label: t('configSections.financial.chartThemeClassic') },
    { value: 'shaded' as const, label: t('configSections.financial.chartThemeShaded') },
  ];
  const CHART_CONTENTS = [
    { value: 'day' as const, label: t('configSections.financial.chartContentDay') },
    { value: 'week' as const, label: t('configSections.financial.chartContentWeek') },
    { value: 'both' as const, label: t('configSections.financial.chartContentBoth') },
  ];

  const view = c.view ?? 'cards';
  // The single tile shows one symbol and always draws its chart(s); cards
  // draw them only with the trend line on.
  const single = view === 'single';
  const chartsShown = single || (view === 'cards' && (c.showSparkline ?? true));
  const symbolsValue = (c[symbolsField] as string) || symbolsPlaceholder;

  return (
    <>
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={viewOptions}
      />
      <LabeledInput
        label={single ? t('configSections.financial.symbolLabel') : symbolsLabel}
        value={symbolsValue}
        onChange={(v) => set({ [symbolsField]: v })}
      />
      {!single && view !== 'ticker' && (
        <Slider
          label={t('configSections.financial.scale')}
          value={c.cardScale ?? 1}
          min={0.5}
          max={3}
          step={0.1}
          onChange={(v) => set({ cardScale: v })}
        />
      )}
      {view === 'cards' && (
        <Toggle
          label={t('configSections.financial.showSparkline')}
          checked={c.showSparkline ?? true}
          onChange={(v) => set({ showSparkline: v })}
        />
      )}
      {showChartRange && chartsShown && (
        <>
          <ViewSelect
            label={t('configSections.financial.chartTheme')}
            value={c.sparklineTheme ?? 'classic'}
            onChange={(v) => set({ sparklineTheme: v })}
            options={CHART_THEMES}
          />
          <ViewSelect
            label={t('configSections.financial.chartContent')}
            value={c.sparklineMode ?? 'day'}
            onChange={(v) => set({ sparklineMode: v })}
            options={CHART_CONTENTS}
          />
          <Toggle
            label={t('configSections.financial.chartLabels')}
            checked={c.sparklineLabels ?? false}
            onChange={(v) => set({ sparklineLabels: v })}
          />
        </>
      )}
      {view === 'ticker' && (
        <Slider
          label={t('configSections.financial.tickerSpeed', { unit: tickerUnitText })}
          value={c.tickerSpeed ?? 5}
          min={2}
          max={15}
          step={1}
          onChange={(v) => set({ tickerSpeed: v })}
        />
      )}
      <RefreshIntervalSlider
        value={c.refreshIntervalMs}
        onChange={(ms) => set({ refreshIntervalMs: ms })}
        fetchKey={mod.type}
        fallbackMs={30_000}
        unit="seconds"
        min={30}
        max={600}
        step={30}
      />
    </>
  );
}

export function StockTickerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  return (
    <FinancialConfigSectionInner
      mod={mod}
      screenId={screenId}
      symbolsField="symbols"
      symbolsLabel={t('configSections.financial.stockSymbolsLabel')}
      symbolsPlaceholder="AAPL,GOOGL,MSFT"
      tickerUnitText={t('configSections.financial.tickerUnitStock')}
      showChartRange
      views={STOCK_VIEWS}
    />
  );
}

export function CryptoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  return (
    <FinancialConfigSectionInner
      mod={mod}
      screenId={screenId}
      symbolsField="ids"
      symbolsLabel={t('configSections.financial.cryptoIdsLabel')}
      symbolsPlaceholder="bitcoin,ethereum"
      tickerUnitText={t('configSections.financial.tickerUnitCoin')}
      views={CRYPTO_VIEWS}
    />
  );
}
