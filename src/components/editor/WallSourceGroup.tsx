'use client';

import { Check } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveDimensions } from '@/lib/editor-multi-display';
import { useTranslate } from '@/i18n';
import { starterBackgroundsIn, type StarterRotationGroup } from '@/lib/starter-backgrounds';
import type { PhotoSource } from '@/types/config';
import SourceRow from './photo-source/SourceRow';

type WallSource = Extract<PhotoSource, { kind: 'wall' }>;

/**
 * One group of the walls that come with Home Screens (the colors or the
 * patterns) as a rotation source: the row's checkbox puts the group in the
 * rotation, and the tiles pick which of its walls take part. A click on a
 * tile only ever changes that; the screen's own fixed picture is chosen in
 * the Image Library.
 */
export default function WallSourceGroup({ group, source, onChange }: {
  group: StarterRotationGroup;
  /** The group's entry in the rotation, or null while it is unticked. */
  source: WallSource | null;
  onChange: (source: WallSource | null) => void;
}) {
  const t = useTranslate('editor');
  const { config, selectedDisplayId } = useEditorStore();
  const walls = starterBackgroundsIn(group);
  const ids = source?.ids ?? [];
  const chosen = new Set(ids);

  // Tiles follow the selected display's orientation, so a landscape wall's
  // thumbnails are landscape too.
  const dims = config ? getActiveDimensions(config, selectedDisplayId) : null;
  const landscape = !!dims && dims.width > dims.height;
  const tileAspect = landscape ? 'aspect-video' : 'aspect-[9/16]';
  const tileGrid = landscape ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-4 gap-1.5';

  const toggle = (id: string) => {
    const next = chosen.has(id) ? ids.filter((wall) => wall !== id) : [...ids, id];
    onChange({ kind: 'wall', group, ids: next });
  };

  return (
    <SourceRow
      id={group}
      label={t(`backgroundPicker.groups.${group}`)}
      checked={source !== null}
      onCheck={(checked) => onChange(checked ? { kind: 'wall', group, ids } : null)}
      extra={source && <span className="text-[10px] text-hs-text-muted" data-testid={`starter-count-${group}`}>{ids.length}/{walls.length}</span>}
      note={source && ids.length === 0 ? t('backgroundPicker.pickToRotate') : undefined}
    >
      <div className={tileGrid}>
        {walls.map((wall) => {
          const name = t(`backgroundPicker.starters.${wall.id}`);
          const marked = chosen.has(wall.id);
          return (
            <button
              key={wall.id}
              type="button"
              aria-label={t('backgroundPicker.includeInRotation', { name })}
              aria-pressed={marked}
              onClick={() => toggle(wall.id)}
              title={name}
              data-testid={`starter-background-${wall.id}`}
              className="block w-full min-w-0 text-left"
            >
              <span className={`relative block w-full overflow-hidden rounded border ${tileAspect} ${marked ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong'}`}>
                {/* The thumbnail is the wall's own file, so it cannot drift from what the display paints. */}
                <img src={wall.path} alt="" className="h-full w-full object-cover" />
                {marked && (
                  <span className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-hs-accent text-white" aria-hidden="true">
                    <Check size={10} />
                  </span>
                )}
              </span>
              {/* The name under the tile, as the Image Library prints it: Midnight and Ocean look alike at this size. */}
              <span className={`mt-0.5 block truncate text-[9px] leading-tight ${marked ? 'text-hs-text-body' : 'text-hs-text-faint'}`} aria-hidden="true">{name}</span>
            </button>
          );
        })}
      </div>
    </SourceRow>
  );
}
