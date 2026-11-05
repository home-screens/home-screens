'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import LabeledSelect from '@/components/ui/LabeledSelect';
import { useEditorData } from '@/hooks/useEditorData';
import { useEditorStore } from '@/stores/editor-store';
import { getActiveDimensions } from '@/lib/editor-multi-display';
import type { ImmichAlbumSummary } from '@/lib/immich';
import { MAX_PICKED_PICTURES } from '@/lib/photo-source';
import { useTranslate } from '@/i18n';
import SearchBox from '@/components/editor/picture-picker/SearchBox';
import { usePickerBrowse } from '@/components/editor/picture-picker/usePickerBrowse';
import { PickGrid, PickTile } from '@/components/editor/PickTile';

/**
 * Photos picked one by one from Immich or Unsplash, as a source: the same
 * pages the Image Library browses, with a tick on each chosen tile. Immich
 * offers its albums and favorites to browse; Unsplash takes search words.
 * The picks are ids, downloaded when their turn comes, so nothing is saved
 * until a wall shows it.
 */
export default function PickedPicturesFields({ kind, ids, onChange, searchWords = 'nature landscape' }: {
  kind: 'immich' | 'unsplash';
  ids: string[];
  onChange: (ids: string[]) => void;
  /** The words the Unsplash search starts from. */
  searchWords?: string;
}) {
  const t = useTranslate('editor');
  const { config, selectedDisplayId } = useEditorStore();
  const dims = config ? getActiveDimensions(config, selectedDisplayId) : null;
  const orientation = dims && dims.width > dims.height ? 'landscape' : 'portrait';
  const [collection, setCollection] = useState(kind === 'immich' ? 'all' : 'search');
  const [query, setQuery] = useState(kind === 'unsplash' ? searchWords : '');
  const { data: albums } = useEditorData<ImmichAlbumSummary[]>(kind === 'immich' ? '/api/immich/albums' : null);
  const browse = usePickerBrowse({ kind, collection, query, orientation, enabled: kind === 'immich' || query.trim() !== '' });
  const chosen = new Set(ids);
  const full = ids.length >= MAX_PICKED_PICTURES;

  const toggle = (ref: string) => {
    if (chosen.has(ref)) onChange(ids.filter((id) => id !== ref));
    else if (!full) onChange([...ids, ref]);
  };

  return (
    <div className="space-y-2" data-testid={`${kind}-picked-pictures`}>
      {kind === 'immich' ? (
        <LabeledSelect
          label={t('photoSources.immich.album')}
          value={collection}
          onChange={setCollection}
          options={[
            { value: 'all', label: t('photoSources.immich.allPhotos') },
            { value: 'favorites', label: t('photoSources.immich.favorites') },
            ...(albums ?? []).map((album) => ({ value: `album:${album.id}`, label: `${album.name} (${album.assetCount})` })),
          ]}
        />
      ) : (
        <SearchBox value={query} placeholder={t('photoSources.unsplash.searchPlaceholder')} onSearch={setQuery} />
      )}
      <p className="text-[10px] leading-relaxed text-hs-text-faint">
        {ids.length === 0 ? t('photoSources.picked.none') : t('photoSources.picked.count', { count: ids.length })}
        {' '}{t('photoSources.picked.help')}
      </p>
      {browse.loading ? (
        <p className="py-4 text-center text-xs text-hs-text-faint">{t('photoSources.picked.loading')}</p>
      ) : browse.failure && browse.tiles.length === 0 ? (
        <p className="text-[10px] text-hs-danger">
          {browse.failure.status === 429 ? t('photoSources.unsplash.rateLimited') : t('photoSources.picker.loadFailed')}
          {' '}<button type="button" onClick={browse.retry} className="text-hs-accent hover:text-hs-accent-hover">{t('photoSources.onedrive.retry')}</button>
        </p>
      ) : browse.tiles.length === 0 ? (
        <p className="text-[10px] text-hs-text-faint">{t(kind === 'immich' ? 'photoSources.immich.empty' : 'photoSources.unsplash.empty')}</p>
      ) : (
        <PickGrid scroll columns={3}>
          {browse.tiles.map((tile) => (
            <PickTile
              key={tile.ref}
              thumb={tile.thumbUrl}
              alt={tile.label ?? ''}
              label={tile.credit?.name ?? tile.label}
              secondary={tile.secondary}
              square
              chosen={chosen.has(tile.ref)}
              disabled={full && !chosen.has(tile.ref)}
              onClick={() => toggle(tile.ref)}
              ariaLabel={t(chosen.has(tile.ref) ? 'photoSources.picked.takeOut' : 'photoSources.picked.add', { name: tile.label || tile.ref })}
              testId={`${kind}-pick-${tile.ref}`}
            />
          ))}
        </PickGrid>
      )}
      {browse.hasMore && (
        <div className="flex justify-center">
          <Button size="sm" onClick={browse.more} disabled={browse.loadingMore}>{t('photoSources.picker.showMore')}</Button>
        </div>
      )}
    </div>
  );
}
