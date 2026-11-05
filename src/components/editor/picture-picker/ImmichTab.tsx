'use client';

import { useState } from 'react';
import { Heart, Image as ImageIcon } from 'lucide-react';
import { useEditorData } from '@/hooks/useEditorData';
import { useTranslate } from '@/i18n';
import type { ImmichAlbumSummary, ImmichPersonSummary } from '@/lib/immich';
import { missingImmichPermission } from '@/lib/immich-permissions';
import ImmichPermissionNote from '@/components/editor/photo-source/ImmichPermissionNote';
import { PickerEntry, PickerGroup, PickerSidebar } from './PickerSidebar';
import RemoteGrid, { PickerBar } from './RemoteGrid';
import SetupHint from './SetupHint';
import { usePickerBrowse } from './usePickerBrowse';
import { importPicture } from './import-picture';
import type { PickerTabProps } from './types';

interface ConnectionStatus { reachable: boolean; authenticated: boolean; version?: string }

/**
 * The household's Immich library: All photos, Favorites, every album and
 * every named person down the side like folders, newest first in the grid,
 * 60 at a time. Still pictures only. Select Image copies the photo into the
 * library's `immich` folder, so the wall never needs Immich up to show it.
 */
export default function ImmichTab({ selection, onSelect, copying }: PickerTabProps) {
  const t = useTranslate('editor');
  const [collection, setCollection] = useState('all');
  const connection = useEditorData<ConnectionStatus>('/api/immich/validate');
  const connected = connection.data?.authenticated === true;
  const albums = useEditorData<ImmichAlbumSummary[]>(connected ? '/api/immich/albums' : null);
  const people = useEditorData<ImmichPersonSummary[]>(connected ? '/api/immich/people' : null);
  const browse = usePickerBrowse({ kind: 'immich', collection, enabled: connected });

  if (connection.loading || (!connection.data && !connection.error)) {
    return <p className="flex-1 py-8 text-center text-xs text-hs-text-faint">{t('photoSources.immich.connecting')}</p>;
  }
  if (!connection.data?.reachable) {
    return (
      <div className="flex-1">
        <SetupHint
          text={`${t('photoSources.immich.unreachable')} ${t('photoSources.immich.unreachableHelp')}`}
          action={{ label: t('photoSources.picker.tryAgain'), onClick: connection.refetch }}
        />
      </div>
    );
  }
  if (!connected) {
    return <div className="flex-1"><SetupHint text={t('photoSources.immich.keyRejected')} /></div>;
  }

  const albumsHidden = missingImmichPermission(albums.failure);
  const peopleHidden = missingImmichPermission(people.failure);
  const photosHidden = missingImmichPermission(browse.failure);
  const album = collection.startsWith('album:') ? albums.data?.find((a) => `album:${a.id}` === collection) : undefined;
  const person = collection.startsWith('person:') ? people.data?.find((p) => `person:${p.id}` === collection) : undefined;
  const title = collection === 'all' ? t('photoSources.immich.allPhotos')
    : collection === 'favorites' ? t('photoSources.immich.favorites')
      : album?.name ?? person?.name ?? '';

  // Immich's album counts include videos, which this window leaves out, so
  // the bar says only the order rather than a number the grid won't match.
  const countLine = t('photoSources.immich.newestFirst');

  const choose = (collectionId: string) => {
    setCollection(collectionId);
    onSelect(null);
  };

  return (
    <div className="flex flex-1 min-h-0">
      <PickerSidebar footer={people.data && people.data.length > 0 ? t('photoSources.immich.namedPeopleOnly') : undefined}>
        <PickerEntry
          label={t('photoSources.immich.allPhotos')}
          selected={collection === 'all'}
          onClick={() => choose('all')}
          leading={<ImageIcon className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden="true" />}
          testId="immich-collection-all"
        />
        <PickerEntry
          label={t('photoSources.immich.favorites')}
          selected={collection === 'favorites'}
          onClick={() => choose('favorites')}
          leading={<Heart className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden="true" />}
          testId="immich-collection-favorites"
        />
        <PickerGroup title={t('photoSources.immich.albums')} />
        {albumsHidden && <ImmichPermissionNote permission={albumsHidden} className="mx-1" />}
        {(albums.data ?? []).map((a) => (
          <PickerEntry
            key={a.id}
            label={a.name}
            count={a.assetCount}
            selected={collection === `album:${a.id}`}
            onClick={() => choose(`album:${a.id}`)}
            testId={`immich-album-${a.id}`}
          />
        ))}
        {(peopleHidden || (people.data?.length ?? 0) > 0) && <PickerGroup title={t('photoSources.immich.people')} />}
        {peopleHidden && <ImmichPermissionNote permission={peopleHidden} className="mx-1" />}
        {(people.data ?? []).map((p) => (
          <PickerEntry
            key={p.id}
            label={p.name}
            selected={collection === `person:${p.id}`}
            onClick={() => choose(`person:${p.id}`)}
            leading={<img src={p.thumbnailUrl} alt="" className="h-[18px] w-[18px] shrink-0 rounded-full object-cover" />}
            testId={`immich-person-${p.id}`}
          />
        ))}
      </PickerSidebar>

      <div className="flex flex-1 flex-col min-w-0">
        <PickerBar>
          <span className="flex-1 truncate text-xs text-hs-text-muted" data-testid="picker-bar-label">
            {title}
            <span className="ml-1 text-hs-text-faint">({countLine})</span>
          </span>
        </PickerBar>
        <div className="flex-1 overflow-y-auto p-3">
          {photosHidden ? (
            <ImmichPermissionNote permission={photosHidden} />
          ) : (
            <RemoteGrid
              browse={browse}
              selectedKey={selection?.key ?? null}
              copying={copying}
              onChoose={(tile) => onSelect(selection?.key === tile.ref ? null : {
                key: tile.ref,
                resolve: () => importPicture('immich', tile.ref),
              })}
              empty={album && album.assetCount > 0 ? t('photoSources.immich.onlyVideos')
                : collection === 'favorites' ? t('photoSources.immich.favoritesEmpty')
                  : t('photoSources.immich.empty')}
              failed={(
                <SetupHint
                  text={t('photoSources.immich.loadFailed')}
                  action={{ label: t('photoSources.picker.tryAgain'), onClick: browse.retry }}
                />
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
