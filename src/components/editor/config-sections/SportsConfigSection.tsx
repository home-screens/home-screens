'use client';

import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance, SportsView } from '@/types/config';

export function SportsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{
    view?: SportsView;
    leagues?: string[];
    refreshIntervalMs?: number;
    tickerSpeed?: number;
  }>(mod, screenId);

  const SPORTS_VIEWS: { value: SportsView; label: string }[] = [
    { value: 'scoreboard', label: t('configSections.sports.viewScoreboard') },
    { value: 'cards', label: t('configSections.sports.viewCards') },
    { value: 'list', label: t('configSections.sports.viewList') },
    { value: 'ticker', label: t('configSections.sports.viewTicker') },
  ];

  const leagueOptions = ['nfl', 'nba', 'mlb', 'nhl', 'mls', 'epl'];
  const selectedLeagues = c.leagues ?? ['nba', 'nfl'];
  const view = c.view ?? 'scoreboard';

  return (
    <>
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={SPORTS_VIEWS}
      />
      <div className="space-y-1">
        <span className="text-xs text-hs-text-muted">{t('configSections.sports.leagues')}</span>
        {leagueOptions.map((league) => (
          <Toggle
            key={league}
            label={league.toUpperCase()}
            checked={selectedLeagues.includes(league)}
            onChange={(checked) => {
              const next = checked
                ? [...selectedLeagues, league]
                : selectedLeagues.filter((l) => l !== league);
              set({ leagues: next });
            }}
          />
        ))}
      </div>
      {view === 'ticker' && (
        <Slider
          label={t('configSections.sports.tickerSpeed')}
          value={c.tickerSpeed ?? 4}
          min={2}
          max={10}
          step={1}
          onChange={(v) => set({ tickerSpeed: v })}
        />
      )}
      <RefreshIntervalSlider
        value={c.refreshIntervalMs}
        onChange={(ms) => set({ refreshIntervalMs: ms })}
        fetchKey="sports"
        fallbackMs={60_000}
        unit="seconds"
        min={30}
        max={600}
        step={30}
      />
    </>
  );
}
