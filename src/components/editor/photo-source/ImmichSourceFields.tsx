'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Toggle from '@/components/ui/Toggle';
import LabeledField from '@/components/ui/LabeledField';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorData } from '@/hooks/useEditorData';
import { useTranslate } from '@/i18n';
import type { ImmichAlbumSummary, ImmichPersonSummary } from '@/lib/immich';
import { missingImmichPermission } from '@/lib/immich-permissions';
import ImmichPermissionNote from './ImmichPermissionNote';
import { PHOTO_SOURCE_MEDIA_PATH, photoSourceParams } from '@/lib/photo-source';
import type { MediaListItem, PhotoSource } from '@/types/config';

interface ConnectionStatus {
  reachable: boolean;
  authenticated: boolean;
  version?: string;
}

type ImmichSource = Extract<PhotoSource, { kind: 'immich' }>;

interface Props {
  source: ImmichSource;
  onChange: (source: ImmichSource) => void;
}

/**
 * Immich's part of the photo source fields: the one copy of the connection
 * line and the album, person and favorites filters, used by slideshows and
 * rotating backgrounds alike. Album and person narrow the same search, and
 * choosing one clears the other.
 */
export function ImmichSourceFields({ source, onChange }: Props) {
  const t = useTranslate('editor');
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const albumId = source.albumId ?? '';
  const personId = source.personId ?? '';
  const favoritesOnly = source.favoritesOnly === true;
  const set = (patch: Partial<ImmichSource>) => {
    const next: ImmichSource = { ...source, ...patch };
    // Absent rather than empty, so the saved source reads the same as a fresh one.
    if (!next.albumId) delete next.albumId;
    if (!next.personId) delete next.personId;
    if (!next.favoritesOnly) delete next.favoritesOnly;
    onChange(next);
  };

  // Albums + people load once the connection authenticates; disabling the URL
  // (null) until then mirrors the old `if (!status?.authenticated) return`.
  const authed = !!status?.authenticated;
  const { data: albumsData, failure: albumsFailure } = useEditorData<ImmichAlbumSummary[]>(authed ? '/api/immich/albums' : null);
  const albums = albumsData ?? [];
  const { data: peopleData, failure: peopleFailure } = useEditorData<ImmichPersonSummary[]>(authed ? '/api/immich/people' : null);
  const people = peopleData ?? [];
  // A key that can show photos but not list albums or people: say which box
  // to tick instead of leaving the list at "Any album" with no reason.
  const albumsHidden = missingImmichPermission(albumsFailure);
  const peopleHidden = missingImmichPermission(peopleFailure);

  // Preview strip re-fetches whenever the filter-derived URL changes; the
  // hook's AbortController supersedes a stale answer.
  const previewParams = photoSourceParams(source);
  previewParams.set('count', '4');
  const { data: previewData } = useEditorData<MediaListItem[]>(authed ? `${PHOTO_SOURCE_MEDIA_PATH}?${previewParams}` : null);
  const previewImages = useMemo(
    () => (previewData ?? []).map((item) => item.url.replace('size=preview', 'size=thumbnail')),
    [previewData],
  );

  const selectedAlbum = albums.find((a) => a.id === albumId);
  const photoCount = selectedAlbum ? selectedAlbum.assetCount : null;

  const checkConnection = useCallback(async () => {
    setChecking(true);
    try {
      const res = await editorFetch('/api/immich/validate');
      if (res.ok) setStatus(await res.json());
      else setStatus({ reachable: false, authenticated: false });
    } catch {
      setStatus({ reachable: false, authenticated: false });
    }
    setChecking(false);
  }, []);

  useEffect(() => { checkConnection(); }, [checkConnection]);

  return (
    <div className="space-y-2">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            checking ? 'bg-hs-warning animate-pulse' :
            status?.authenticated ? 'bg-hs-success' :
            status?.reachable ? 'bg-hs-warning' : 'bg-hs-danger'
          }`}
        />
        <span className="text-xs text-hs-text-muted">
          {checking ? t('photoSources.immich.connecting') :
           status?.authenticated ? (status.version ? t('photoSources.immich.connectedWithVersion', { version: status.version }) : t('photoSources.immich.connected')) :
           status?.reachable ? t('photoSources.immich.apiKeyInvalid') : t('photoSources.immich.cannotReachServer')}
        </span>
        {!checking && !status?.authenticated && (
          <button
            onClick={checkConnection}
            className="text-[10px] text-hs-accent hover:text-hs-accent-hover"
          >
            {t('photoSources.immich.retry')}
          </button>
        )}
      </div>

      {status?.authenticated && (
        <>
          {/* Album picker */}
          <LabeledField label={t('photoSources.immich.album')}>
            {albumsHidden && <ImmichPermissionNote permission={albumsHidden} className="mb-1" />}
            <select
              value={albumId}
              onChange={(e) => set({ albumId: e.target.value || undefined, personId: undefined })}
              className={INPUT_CLASS}
            >
              <option value="">{t('photoSources.immich.anyAlbum')}</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.assetCount})
                </option>
              ))}
            </select>
          </LabeledField>

          {/* Person filter */}
          <LabeledField label={t('photoSources.immich.person')}>
            {peopleHidden && <ImmichPermissionNote permission={peopleHidden} className="mb-1" />}
            <div className="flex gap-1.5 items-center">
              <select
                value={personId}
                onChange={(e) => set({ personId: e.target.value || undefined, albumId: undefined })}
                className={`${INPUT_CLASS} flex-1`}
              >
                <option value="">{t('photoSources.immich.anyone')}</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {personId && people.find((p) => p.id === personId)?.thumbnailUrl && (
                <img
                  src={people.find((p) => p.id === personId)!.thumbnailUrl}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover border border-hs-border-strong"
                />
              )}
            </div>
          </LabeledField>

          {/* Favorites toggle */}
          <Toggle
            label={t('photoSources.immich.favoritesOnly')}
            checked={favoritesOnly}
            onChange={(v) => set({ favoritesOnly: v })}
          />

          {/* Preview strip */}
          {previewImages.length > 0 && (
            <div className="mt-1.5">
              {photoCount !== null && (
                <span className="text-[10px] text-hs-text-faint">
                  {t('photoSources.immich.photoInAlbum', { count: photoCount })}
                </span>
              )}
              <div className="flex gap-1 mt-1 overflow-x-auto">
                {previewImages.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    loading="lazy"
                    className="w-12 h-12 rounded object-cover flex-shrink-0 border border-hs-border-strong"
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
