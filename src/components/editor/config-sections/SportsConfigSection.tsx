'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import type { ModuleInstance, SportsView } from '@/types/config';

const SPORTS_VIEWS: { value: SportsView; label: string }[] = [
  { value: 'scoreboard', label: 'Scoreboard' },
  { value: 'cards', label: 'Cards' },
  { value: 'list', label: 'List' },
  { value: 'ticker', label: 'Ticker' },
];

export function SportsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{
    view?: SportsView;
    leagues?: string[];
    refreshIntervalMs?: number;
    tickerSpeed?: number;
  }>(mod, screenId);

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
        <span className="text-xs text-neutral-400">Leagues</span>
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
          label="Ticker Speed (sec/game)"
          value={c.tickerSpeed ?? 4}
          min={2}
          max={10}
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
