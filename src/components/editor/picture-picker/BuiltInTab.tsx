'use client';

import { useState } from 'react';
import { useTranslate } from '@/i18n';
import { useEditorStore, getActiveFullscreenTheme } from '@/stores/editor-store';
import { FULLSCREEN_THEMES } from '@/lib/fullscreen-themes';
import { STARTER_BACKGROUNDS_URL, starterBackgroundsIn, type StarterBackgroundGroup } from '@/lib/starter-backgrounds';
import { STARTER_DAY_ART, STARTER_DAY_ART_URL } from '@/lib/starter-day-art';
import { PickerEntry, PickerSidebar } from './PickerSidebar';
import { PickerBar } from './RemoteGrid';
import type { PickerTabProps } from './types';

export type BuiltInSet = 'backgrounds' | 'day-art';

/** Whether a stored picture is one of the built-in ones, so the picker opens on this tab. */
export function isBuiltInPicture(set: BuiltInSet, value: string | undefined): boolean {
  if (!value) return false;
  return value.startsWith(`${set === 'backgrounds' ? STARTER_BACKGROUNDS_URL : STARTER_DAY_ART_URL}/`);
}

interface Tile { id: string; path: string; name: string; note?: string }

/**
 * The pictures that ship with Home Screens, first in the picker where a spot
 * has them: a screen's backgrounds (theme walls, colors, patterns) or a day
 * rule's day pictures. They are always there, so nothing is copied.
 */
export default function BuiltInTab({ set, currentValue, orientation, selection, onSelect }: PickerTabProps & {
  set: BuiltInSet;
  currentValue?: string;
  orientation?: 'portrait' | 'landscape';
}) {
  const t = useTranslate('editor');
  const { config, selectedDisplayId } = useEditorStore();
  const groups: { id: string; title: string; tiles: Tile[] }[] = [];

  if (set === 'backgrounds') {
    // The theme the selected display paints its full-screen modules with comes first.
    const themeInUse = (config ? getActiveFullscreenTheme(config, selectedDisplayId) : undefined) ?? 'linen';
    const themeWalls = starterBackgroundsIn('theme');
    const ordered = [...themeWalls.filter((bg) => bg.themeId === themeInUse), ...themeWalls.filter((bg) => bg.themeId !== themeInUse)];
    const named = (group: StarterBackgroundGroup) => starterBackgroundsIn(group).map((bg) => ({ id: bg.id, path: bg.path, name: t(`backgroundPicker.starters.${bg.id}`) }));
    groups.push(
      {
        id: 'theme',
        title: t('photoSources.builtIn.themeWalls'),
        tiles: ordered.map((bg) => ({
          id: bg.id,
          path: bg.path,
          name: FULLSCREEN_THEMES.find((th) => th.id === bg.themeId)?.name ?? bg.id,
          note: bg.themeId === themeInUse ? t('backgroundPicker.inUse') : undefined,
        })),
      },
      { id: 'color', title: t('photoSources.builtIn.colors'), tiles: named('color') },
      { id: 'pattern', title: t('photoSources.builtIn.patterns'), tiles: named('pattern') },
    );
  } else {
    groups.push({
      id: 'day-art',
      title: t('photoSources.builtIn.dayPictures'),
      tiles: STARTER_DAY_ART.map((art) => ({ id: art.id, path: art.path, name: t(`configSections.calendarRules.artNames.${art.id}`) })),
    });
  }

  // Open on the group holding the current picture.
  const [groupId, setGroupId] = useState(() => groups.find((g) => g.tiles.some((tile) => tile.path === currentValue))?.id ?? groups[0].id);
  const group = groups.find((g) => g.id === groupId) ?? groups[0];
  const wide = set === 'backgrounds' && orientation === 'landscape';
  const tileShape = set === 'day-art' ? 'aspect-square' : wide ? 'aspect-video' : 'aspect-[9/16]';
  const columns = set === 'day-art' || wide ? 'grid-cols-3' : 'grid-cols-4';
  const chosen = selection?.key ?? currentValue;

  return (
    <div className="flex flex-1 min-h-0">
      <PickerSidebar footer={t('photoSources.builtIn.sidebarNote')}>
        {groups.map((g) => (
          <PickerEntry
            key={g.id}
            label={g.title}
            count={g.tiles.length}
            selected={g.id === group.id}
            onClick={() => setGroupId(g.id)}
            testId={`builtin-group-${g.id}`}
          />
        ))}
      </PickerSidebar>
      <div className="flex flex-1 flex-col min-w-0">
        <PickerBar>
          <span className="flex-1 truncate text-xs text-hs-text-muted">{group.title}</span>
        </PickerBar>
        <div className="flex-1 overflow-y-auto p-3">
          <div className={`grid gap-2 ${columns}`} data-testid="picker-grid">
            {group.tiles.map((tile) => {
              const on = chosen === tile.path;
              return (
                <div key={tile.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(selection?.key === tile.path ? null : { key: tile.path, resolve: async () => tile.path })}
                    aria-pressed={on}
                    title={tile.name}
                    data-testid={`starter-picture-${tile.id}`}
                    className={`block w-full overflow-hidden rounded-md border-2 ${tileShape} ${on ? 'border-hs-accent' : 'border-transparent hover:border-hs-border-strong'}`}
                  >
                    {/* The thumbnail is the picture's own file, so it cannot drift from what the wall paints. */}
                    <img src={tile.path} alt="" className="h-full w-full object-cover" />
                  </button>
                  <div className={`mt-0.5 truncate text-center text-[10px] leading-tight ${on ? 'text-hs-accent-hover' : 'text-hs-text-muted'}`}>
                    {tile.name}{tile.note ? ` · ${tile.note}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
