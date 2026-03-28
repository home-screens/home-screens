'use client';

import Slider from '@/components/ui/Slider';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, StockTickerView, CryptoView } from '@/types/config';

type FinancialView = StockTickerView | CryptoView;

const FINANCIAL_VIEWS: { value: FinancialView; label: string }[] = [
  { value: 'cards', label: 'Cards' },
  { value: 'ticker', label: 'Ticker (Scrolling)' },
  { value: 'table', label: 'Table' },
  { value: 'compact', label: 'Compact' },
];

interface FinancialConfigProps {
  mod: ModuleInstance;
  screenId: string;
  symbolsField: string;
  symbolsLabel: string;
  symbolsPlaceholder: string;
  tickerUnitText: string;
}

function FinancialConfigSectionInner({ mod, screenId, symbolsField, symbolsLabel, symbolsPlaceholder, tickerUnitText }: FinancialConfigProps) {
  const { config: c, set } = useModuleConfig<{ view?: FinancialView; refreshIntervalMs?: number; cardScale?: number; tickerSpeed?: number } & Record<string, unknown>>(mod, screenId);

  const view = c.view ?? 'cards';
  const symbolsValue = (c[symbolsField] as string) || symbolsPlaceholder;

  return (
    <>
      <label className="flex flex-col gap-0.5">
        <span className="text-xs text-neutral-400">{symbolsLabel}</span>
        <input
          type="text"
          value={symbolsValue}
          onChange={(e) => set({ [symbolsField]: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={FINANCIAL_VIEWS}
      />
      {view !== 'ticker' && (
        <Slider
          label="Scale"
          value={c.cardScale ?? 1}
          min={0.5}
          max={3}
          step={0.1}
          onChange={(v) => set({ cardScale: v })}
        />
      )}
      {view === 'ticker' && (
        <Slider
          label={`Ticker Speed (${tickerUnitText})`}
          value={c.tickerSpeed ?? 5}
          min={2}
          max={15}
          step={1}
          onChange={(v) => set({ tickerSpeed: v })}
        />
      )}
      <Slider
        label="Refresh (seconds)"
        value={(c.refreshIntervalMs ?? 60000) / 1000}
        min={30}
        max={600}
        step={30}
        onChange={(v) => set({ refreshIntervalMs: v * 1000 })}
      />
    </>
  );
}

export function StockTickerConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  return (
    <FinancialConfigSectionInner
      mod={mod}
      screenId={screenId}
      symbolsField="symbols"
      symbolsLabel="Symbols (comma-separated)"
      symbolsPlaceholder="AAPL,GOOGL,MSFT"
      tickerUnitText="sec/stock"
    />
  );
}

export function CryptoConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  return (
    <FinancialConfigSectionInner
      mod={mod}
      screenId={screenId}
      symbolsField="ids"
      symbolsLabel="Coin IDs (comma-separated, CoinGecko)"
      symbolsPlaceholder="bitcoin,ethereum"
      tickerUnitText="sec/coin"
    />
  );
}
