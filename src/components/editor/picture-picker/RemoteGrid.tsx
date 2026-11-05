'use client';

import type { ReactNode } from 'react';
import { Heart } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
import type { PickerBrowse } from './usePickerBrowse';
import type { BrowseTile } from './types';

/**
 * The grid every browsed source shares, drawn like the Local tab's: three
 * square tiles across, a blue border on the chosen one, Show more at the
 * bottom. Clicking a tile chooses it; Select Image in the footer copies it.
 */
export default function RemoteGrid({ browse, selectedKey, copying, onChoose, empty, failed, caption }: {
  browse: PickerBrowse;
  selectedKey: string | null;
  copying: boolean;
  onChoose: (tile: BrowseTile) => void;
  /** What an empty first page says. */
  empty: ReactNode;
  /** What a failed load says, when the tab has nothing more specific. */
  failed: ReactNode;
  /** A small line on the tile (a photographer, a date). */
  caption?: (tile: BrowseTile) => string | undefined;
}) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  if (browse.loading) {
    return <p className="py-8 text-center text-xs text-hs-text-faint">{tCore('loading')}</p>;
  }
  if (browse.failure && browse.tiles.length === 0) return <>{failed}</>;
  if (browse.tiles.length === 0) {
    return <div className="flex h-full items-center justify-center px-10 text-center text-xs text-hs-text-faint">{empty}</div>;
  }
  return (
    <>
      <div className="grid grid-cols-3 gap-2" data-testid="picker-grid">
        {browse.tiles.map((tile) => {
          const chosen = selectedKey === tile.ref;
          const line = caption?.(tile);
          return (
            <button
              key={tile.ref}
              type="button"
              onClick={() => onChoose(tile)}
              disabled={copying}
              aria-pressed={chosen}
              title={tile.label || line}
              data-ref={tile.ref}
              className={`group relative aspect-square w-full overflow-hidden rounded-md border-2 transition-colors ${
                chosen ? 'border-hs-accent' : 'border-transparent hover:border-hs-border-strong'
              }`}
            >
              <img src={tile.thumbUrl} alt={tile.label ?? ''} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              {tile.favorite && (
                <Heart className="absolute bottom-1.5 left-1.5 h-4 w-4 fill-white text-white drop-shadow" aria-label={t('photoSources.picker.favorite')} />
              )}
              {line && (
                <span className={`absolute inset-x-0 bottom-0 truncate bg-black/45 px-1.5 py-0.5 text-left text-[10px] text-white/90 ${chosen ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                  {line}
                </span>
              )}
              {chosen && copying && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white">
                  {t('photoSources.picker.copying')}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {browse.hasMore && (
        <div className="flex justify-center pt-3">
          <Button size="sm" onClick={browse.more} disabled={browse.loadingMore}>
            {browse.loadingMore ? tCore('loading') : t('photoSources.picker.showMore')}
          </Button>
        </div>
      )}
      {browse.failure && <p className="pt-2 text-center text-xs text-hs-danger">{t('photoSources.picker.loadFailed')}</p>}
    </>
  );
}

/** The bar above a grid: what is showing, and room for a search box. */
export function PickerBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[41px] items-center gap-2 border-b border-hs-border px-3 py-2">{children}</div>
  );
}
