'use client';

import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { INPUT_CLASS } from '@/components/editor/PropertyPanel';
import type { ModuleInstance, StandingsView, StandingsGrouping } from '@/types/config';

const STANDINGS_VIEWS: { value: StandingsView; label: string }[] = [
  { value: 'table', label: 'Table' },
  { value: 'compact', label: 'Compact' },
  { value: 'conference', label: 'Conference' },
];

const STANDINGS_GROUPINGS: { value: StandingsGrouping; label: string }[] = [
  { value: 'division', label: 'By Division' },
  { value: 'conference', label: 'By Conference' },
  { value: 'league', label: 'Full League' },
];

const STANDINGS_LEAGUES: { value: string; label: string }[] = [
  { value: 'nfl', label: 'NFL' },
  { value: 'nba', label: 'NBA' },
  { value: 'mlb', label: 'MLB' },
  { value: 'nhl', label: 'NHL' },
  { value: 'wnba', label: 'WNBA' },
  { value: 'mls', label: 'MLS' },
  { value: 'epl', label: 'Premier League' },
  { value: 'laliga', label: 'La Liga' },
  { value: 'bundesliga', label: 'Bundesliga' },
  { value: 'seriea', label: 'Serie A' },
  { value: 'ligue1', label: 'Ligue 1' },
  { value: 'liga_mx', label: 'Liga MX' },
];

export function StandingsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const { config: c, set } = useModuleConfig<{
    view?: StandingsView;
    league?: string;
    grouping?: StandingsGrouping;
    teamsToShow?: number;
    showPlayoffLine?: boolean;
    rotationIntervalMs?: number;
    refreshIntervalMs?: number;
  }>(mod, screenId);

  return (
    <>
      <ViewSelect
        value={c.view ?? 'table'}
        onChange={(v) => set({ view: v })}
        options={STANDINGS_VIEWS}
      />
      <div className="space-y-1">
        <span className="text-xs text-neutral-400">League</span>
        <select
          value={c.league ?? 'nba'}
          onChange={(e) => set({ league: e.target.value })}
          className={INPUT_CLASS}
        >
          {STANDINGS_LEAGUES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <span className="text-xs text-neutral-400">Grouping</span>
        <select
          value={c.grouping ?? 'conference'}
          onChange={(e) => set({ grouping: e.target.value as StandingsGrouping })}
          className={INPUT_CLASS}
        >
          {STANDINGS_GROUPINGS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
      </div>
      <Toggle
        label="Playoff Cutoff Line"
        checked={c.showPlayoffLine !== false}
        onChange={(v) => set({ showPlayoffLine: v })}
      />
      <Slider
        label="Teams to Show (0 = all)"
        value={c.teamsToShow ?? 0}
        min={0}
        max={32}
        step={1}
        onChange={(v) => set({ teamsToShow: v })}
      />
      <Slider
        label="Rotation (seconds)"
        value={(c.rotationIntervalMs ?? 10000) / 1000}
        min={5}
        max={60}
        step={5}
        onChange={(v) => set({ rotationIntervalMs: v * 1000 })}
      />
      <Slider
        label="Refresh (minutes)"
        value={(c.refreshIntervalMs ?? 300000) / 60000}
        min={1}
        max={60}
        step={1}
        onChange={(v) => set({ refreshIntervalMs: v * 60000 })}
      />
    </>
  );
}
