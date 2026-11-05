'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveDimensions } from '@/lib/editor-multi-display';
import { useTranslate } from '@/i18n';

/** Tile aspect matching the active display: portrait walls get tall tiles, landscape walls wide ones. */
export function useTileAspect(): string {
  const { config, selectedDisplayId } = useEditorStore();
  const dims = config ? getActiveDimensions(config, selectedDisplayId) : null;
  return dims && dims.width > dims.height ? 'aspect-video' : 'aspect-[9/16]';
}

/** The tile grid shared by every "pictures" picker: two display-shaped tiles across, or three square ones. */
export function PickGrid({ children, scroll = false, columns = 2 }: { children: ReactNode; scroll?: boolean; columns?: 2 | 3 }) {
  return <div className={`grid ${columns === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 ${scroll ? 'max-h-[400px] overflow-y-auto' : ''}`}>{children}</div>;
}

/** One pickable picture: highlighted with a check when chosen. */
export function PickTile({ thumb, alt, label, secondary, chosen, saving, disabled, onClick, ariaLabel, testId, square = false }: {
  thumb: string; alt: string; label?: string; secondary?: string;
  chosen: boolean; saving?: boolean; disabled?: boolean;
  onClick: () => void; ariaLabel?: string; testId: string;
  /** A photo is shown whole-ish in a square, like the Image Library's grid; a wall keeps the display's shape. */
  square?: boolean;
}) {
  const displayAspect = useTileAspect();
  const aspect = square ? 'aspect-square' : displayAspect;
  const tCore = useTranslate('core');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={chosen}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`group relative ${aspect} rounded overflow-hidden border transition-colors ${
        chosen ? 'border-hs-accent ring-1 ring-hs-accent' : 'border-hs-border-strong hover:border-hs-accent'
      }`}
    >
      <img src={thumb} alt={alt} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      {label && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
          <span className="text-[9px] text-white/0 group-hover:text-white/80 px-1.5 pb-1 truncate w-full transition-colors">
            {label}
            {secondary && <span className="block text-white/50">{secondary}</span>}
          </span>
        </div>
      )}
      {chosen && (
        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-hs-accent text-white" aria-hidden="true">
          <Check size={11} />
        </span>
      )}
      {saving && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <span className="text-xs text-white">{tCore('status.saving')}</span>
        </div>
      )}
    </button>
  );
}
