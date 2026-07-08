'use client';

import Slider from '@/components/ui/Slider';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import LabeledInput from '@/components/ui/LabeledInput';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { useTranslate } from '@/i18n';
import type { ModuleInstance, StockTickerView, CryptoView } from '@/types/config';

type FinancialView = StockTickerView | CryptoView;

interface FinancialConfigProps {
  mod: ModuleInstance;
  screenId: string;
  symbolsField: string;
  symbolsLabel: string;
  symbolsPlaceholder: string;
  tickerUnitText: string;
}

function FinancialConfigSectionInner({ mod, screenId, symbolsField, symbolsLabel, symbolsPlaceholder, tickerUnitText }: FinancialConfigProps) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{ view?: FinancialView; refreshIntervalMs?: number; cardScale?: number; tickerSpeed?: number } & Record<string, unknown>>(mod, screenId);

  const FINANCIAL_VIEWS: { value: FinancialView; label: string }[] = [
    { value: 'cards', label: t('configSections.financial.viewCards') },
    { value: 'ticker', label: t('configSections.financial.viewTicker') },
    { value: 'table', label: t('configSections.financial.viewTable') },
    { value: 'compact', label: t('configSections.financial.viewCompact') },
  ];

  const view = c.view ?? 'cards';
  const symbolsValue = (c[symbolsField] as string) || symbolsPlaceholder;

  return (
    <>
      <LabeledInput
        label={symbolsLabel}
        value={symbolsValue}
        onChange={(v) => set({ [symbolsField]: v })}
      />
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={FINANCIAL_VIEWS}
      />
      {view !== 'ticker' && (
        <Slider
          label={t('configSections.financial.scale')}
          value={c.cardScale ?? 1}
          min={0.5}
          max={3}
          step={0.1}
          onChange={(v) => set({ cardScale: v })}
        />
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
    />
  );
}
