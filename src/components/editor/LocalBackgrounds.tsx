'use client';

import { useId } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveScreens, getActiveDimensions } from '@/lib/editor-multi-display';
import { useTranslate } from '@/i18n';
import {
  starterBackgroundsIn,
  type StarterRotationBackground,
  type StarterRotationGroup,
} from '@/lib/starter-backgrounds';
import { useGroupOpen } from './useGroupOpen';
import { isRotationActive } from '@/lib/screen-background';

interface Props {
  selectedScreenId: string;
}

/** Heading checkbox switches the group's tiles from "pick one" to "rotate through the selection". */
function StarterGroup({ id, title, count, checked, hint, onChange, children }: {
  id: StarterRotationGroup; title: string; count: string; checked: boolean; hint?: string;
  onChange: (checked: boolean) => void; children: React.ReactNode;
}) {
  const [open, setOpen] = useGroupOpen(id);
  const panelId = useId();
  const toggle = () => setOpen(!open);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div data-testid={`starter-source-${id}`} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-hs-text-body">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-hs-border-strong" />
          <span>{title}</span>
        </label>
        <button id={`starter-group-${id}`} type="button" onClick={toggle} aria-expanded={open}
          aria-controls={panelId} data-testid={`starter-group-${id}`}
          aria-label={checked ? `${title} ${count}` : title} className="flex items-center gap-1 rounded px-1 text-[10px] text-hs-text-muted hover:bg-hs-hover">
          <span>{checked ? count : ''}</span><Chevron size={11} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div id={panelId} className="space-y-1.5">
          {checked && hint && <p className="text-[10px] leading-relaxed text-hs-text-faint" data-testid={`starter-hint-${id}`}>{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

export default function LocalBackgrounds({ selectedScreenId }: Props) {
  const t = useTranslate('editor');
  const { config, selectedDisplayId, pickScreenBackground, updateScreenRotation } = useEditorStore();

  const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
  const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);

  if (!currentScreen || !config) return null;

  const rotation = currentScreen.backgroundRotation;
  const selectedSources = rotation?.sources ?? [];
  const selectSource = (id: StarterRotationGroup, checked: boolean) => {
    const sources = checked
      ? [...selectedSources.filter((source) => source !== id), id]
      : selectedSources.filter((source) => source !== id);
    updateScreenRotation(selectedScreenId, {
      sources, query: rotation?.query || 'nature landscape', intervalMinutes: rotation?.intervalMinutes || 60,
    });
  };
  // Walls are opt-in: nothing is in rotation until the user picks it.
  const selections = rotation?.starterBackgroundIds;
  const selectedIds = (group: StarterRotationGroup) => {
    const ids = selections?.[group] ?? [];
    return starterBackgroundsIn(group).filter((wall) => ids.includes(wall.id)).map((wall) => wall.id);
  };
  const setIncluded = (bg: StarterRotationBackground, include: boolean) => {
    const group = bg.group;
    const ids = selectedIds(group);
    const next = include ? [...ids, bg.id] : ids.filter((id) => id !== bg.id);
    updateScreenRotation(selectedScreenId, { starterBackgroundIds: { ...selections, [group]: next } });
  };
  const selectionCount = (group: StarterRotationGroup) => `${selectedIds(group).length}/${starterBackgroundsIn(group).length}`;
  const rotating = (group: StarterRotationGroup) => selectedSources.includes(group);
  const groupHint = (group: StarterRotationGroup) => (selectedIds(group).length === 0 ? t('backgroundPicker.pickToRotate') : undefined);

  const pick = (backgroundImage: string) => pickScreenBackground(selectedScreenId, backgroundImage);

  // Tiles follow the selected display's orientation, so a landscape wall's
  // thumbnails are landscape too.
  const dims = getActiveDimensions(config, selectedDisplayId);
  const landscape = dims.width > dims.height;
  const tileAspect = landscape ? 'aspect-video' : 'aspect-[9/16]';
  const tileGrid = landscape ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-4 gap-1.5';
  const isCurrent = (path: string) => currentScreen.backgroundImage === path;
  const isIncluded = (bg: StarterRotationBackground) => selectedIds(bg.group).includes(bg.id);
  // Group in rotation mode: a tile is highlighted when it is in the rotation. Otherwise it is highlighted when it is the fixed wall.
  const isMarked = (bg: StarterRotationBackground) =>
    rotating(bg.group) ? isIncluded(bg) : isCurrent(bg.path) && !isRotationActive(currentScreen.backgroundRotation);
  const onTile = (bg: StarterRotationBackground) => (rotating(bg.group) ? setIncluded(bg, !isIncluded(bg)) : pick(bg.path));
  const tileLabel = (bg: StarterRotationBackground, name: string) =>
    t(rotating(bg.group) ? 'backgroundPicker.includeInRotation' : 'backgroundPicker.useFixed', { name });

  const colorWalls = starterBackgroundsIn('color');
  const patternWalls = starterBackgroundsIn('pattern');

  const wallTile = (bg: StarterRotationBackground) => {
    const name = t(`backgroundPicker.starters.${bg.id}`);
    const marked = isMarked(bg);
    return (
      <button
        key={bg.id}
        type="button"
        aria-label={tileLabel(bg, name)}
        aria-pressed={marked}
        onClick={() => onTile(bg)}
        title={name}
        data-testid={`starter-background-${bg.id}`}
        className={`relative block w-full overflow-hidden rounded border ${tileAspect} ${marked ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong'}`}
      >
        {/* The thumbnail is the wall's own file, so it cannot drift from what the display paints. */}
        <img src={bg.path} alt="" className="h-full w-full object-cover" />
        {marked && rotating(bg.group) && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-hs-accent text-white" aria-hidden="true">
            <Check size={10} />
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <StarterGroup id="color" title={t('backgroundPicker.groups.color')} count={selectionCount('color')}
        hint={groupHint('color')} checked={selectedSources.includes('color')} onChange={(checked) => selectSource('color', checked)}>
        <div className={tileGrid}>
          <div>
            <button
              type="button"
              aria-pressed={!currentScreen.backgroundImage && !isRotationActive(currentScreen.backgroundRotation)}
              onClick={() => pick('')}
              data-testid="starter-background-none"
              className={`block w-full rounded border text-[10px] text-hs-text-faint ${tileAspect} ${
                !currentScreen.backgroundImage && !isRotationActive(currentScreen.backgroundRotation) ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong'
              }`}
            >
              {t('settings.localBackgrounds.none')}
            </button>
          </div>
          {colorWalls.map(wallTile)}
        </div>
      </StarterGroup>

      <StarterGroup id="pattern" title={t('backgroundPicker.groups.pattern')} count={selectionCount('pattern')}
        hint={groupHint('pattern')} checked={selectedSources.includes('pattern')} onChange={(checked) => selectSource('pattern', checked)}>
        <div className={tileGrid}>{patternWalls.map(wallTile)}</div>
      </StarterGroup>
    </>
  );
}
