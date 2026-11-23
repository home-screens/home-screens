'use client';

import { useMemo } from 'react';
import { GripVertical } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { dragEndIndices, useSortableSensors } from '@/hooks/useDndSensors';
import Combobox from '@/components/ui/Combobox';
import { useTranslate } from '@/i18n';
import { useEditorData } from '@/hooks/useEditorData';
import { SPORTS_LEAGUES, leagueLabel, leagueWallCode, type TeamOption } from '@/lib/espn';
import { MAX_FAVORITE_TEAMS, isFavoriteLeagueEnabled, parseTeamKey, teamKey } from '@/lib/sports-order';
import { TeamLogo } from '@/components/modules/shared/TeamLogo';
import type { ComboboxOption } from '@/lib/combobox-filter';
import FieldHint from '@/components/ui/FieldHint';
import IconButton from '@/components/ui/IconButton';

interface TeamRowProps {
  teamKeyId: string;
  name: string;
  logo: string;
  code: string;
  off: boolean;
  onRemove: () => void;
  removeLabel: string;
  dragLabel: string;
  hiddenLabel: string;
}

/** One picked team. The grip is the drag handle; the whole row moves with it. */
function SortableTeamRow({ teamKeyId, name, logo, code, off, onRemove, removeLabel, dragLabel, hiddenLabel }: TeamRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: teamKeyId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 rounded-md border border-hs-border bg-hs-card pl-1 pr-2 py-1.5 ${off ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-hs-text-faint hover:text-hs-text-muted shrink-0"
        aria-label={dragLabel}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <TeamLogo src={logo} alt="" size={16} />
      <span className="text-xs text-hs-text-body truncate flex-1">{name}</span>
      <span className="text-[11px] text-hs-text-muted shrink-0">{code}</span>
      {off && <span className="text-[10px] italic text-hs-text-muted shrink-0">{hiddenLabel}</span>}
      <IconButton label={removeLabel} onClick={onRemove} />
    </li>
  );
}

interface FavoriteTeamsPickerProps {
  /** Leagues the module shows; only their teams are offered. */
  leagues: string[];
  /** Picked `<league>:<ABBR>` keys in priority order. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Help line under the search box; the Team view says something different from the others. */
  help: string;
}

/**
 * One search box over every enabled league's roster, with the picked teams
 * as rows beneath it in priority order. Rosters come from /api/sports/teams
 * in one request; a picked team whose league is toggled off keeps its row,
 * marked, so the user sees why it is missing from the wall.
 */
export function FavoriteTeamsPicker({ leagues, value, onChange, help }: FavoriteTeamsPickerProps) {
  const t = useTranslate('editor');
  const sensors = useSortableSensors();
  const handleDragEnd = (event: DragEndEvent) => {
    const move = dragEndIndices(event, value);
    if (move) onChange(arrayMove(value, move.from, move.to));
  };
  const enabled = useMemo(() => new Set(leagues.map((l) => l.toLowerCase())), [leagues]);

  // Fetch the enabled leagues plus any league a picked team belongs to, so
  // every row can show its team's name even when its league is off.
  const wanted = useMemo(() => {
    const set = new Set(enabled);
    for (const key of value) {
      const parsed = parseTeamKey(key);
      if (parsed) set.add(parsed.league);
    }
    return [...set].filter((l) => SPORTS_LEAGUES.some((s) => s.id === l)).sort();
  }, [enabled, value]);
  const url = wanted.length ? `/api/sports/teams?leagues=${encodeURIComponent(wanted.join(','))}` : null;
  const { data, error, loading } = useEditorData<{ teams: TeamOption[] }>(url);

  const byKey = useMemo(
    () => new Map((data?.teams ?? []).map((team) => [teamKey(team.league, team.abbr), team])),
    [data],
  );
  const options = useMemo<ComboboxOption[]>(
    () => (data?.teams ?? [])
      .filter((team) => enabled.has(team.league) && !value.includes(teamKey(team.league, team.abbr)))
      .map((team) => ({ value: teamKey(team.league, team.abbr), label: team.name, description: leagueLabel(team.league) })),
    [data, enabled, value],
  );

  const placeholder = loading
    ? t('configSections.sports.favoriteTeamsLoading')
    : error
      ? t('configSections.sports.favoriteTeamsError')
      : t('configSections.sports.favoriteTeamsSearch');

  return (
    <div className="space-y-1.5" data-field-id="favoriteTeams">
      <span className="text-xs text-hs-text-muted">{t('configSections.sports.favoriteTeams')}</span>
      {value.length >= MAX_FAVORITE_TEAMS ? (
        <FieldHint>{t('configSections.sports.favoriteTeamsLimit', { count: MAX_FAVORITE_TEAMS })}</FieldHint>
      ) : (
        <Combobox
          value=""
          onChange={(key) => { if (key && !value.includes(key)) onChange([...value, key]); }}
          options={options}
          ariaLabel={t('configSections.sports.favoriteTeams')}
          placeholder={placeholder}
          noMatchText={t('common.noMatches')}
        />
      )}
      <FieldHint>{help}</FieldHint>
      {value.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1" aria-label={t('configSections.sports.favoriteTeams')}>
              {value.map((key) => {
                const parsed = parseTeamKey(key);
                const team = byKey.get(key);
                const name = team?.name ?? parsed?.abbr ?? key;
                return (
                  <SortableTeamRow
                    key={key}
                    teamKeyId={key}
                    name={name}
                    logo={team?.logo ?? ''}
                    code={leagueWallCode(parsed?.league ?? '')}
                    off={!isFavoriteLeagueEnabled(key, leagues)}
                    onRemove={() => onChange(value.filter((k) => k !== key))}
                    removeLabel={t('configSections.sports.favoriteTeamsRemove', { team: name })}
                    dragLabel={t('configSections.sports.favoriteTeamsDrag', { team: name })}
                    hiddenLabel={t('configSections.sports.favoriteTeamsHidden')}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
