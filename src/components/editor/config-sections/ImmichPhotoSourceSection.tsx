'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Slider from '@/components/ui/Slider';
import Toggle from '@/components/ui/Toggle';
import LabeledField from '@/components/ui/LabeledField';
import { INPUT_CLASS } from '@/components/ui/input-classes';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorData } from '@/hooks/useEditorData';
import { useTranslate } from '@/i18n';
import type { ImmichAlbumSummary, ImmichPersonSummary } from '@/lib/immich';

interface ConnectionStatus {
  reachable: boolean;
  authenticated: boolean;
  version?: string;
}

interface Props {
  config: Record<string, unknown>;
  set: (updates: Record<string, unknown>) => void;
}

export function ImmichPhotoSourceSection({ config, set }: Props) {
  const t = useTranslate('editor');
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const albumId = (config.immichAlbumId as string) || '';
  const personId = (config.immichPersonId as string) || '';
  const favoritesOnly = (config.immichFavoritesOnly as boolean) || false;
  const count = (config.immichCount as number) || 50;

  // Albums + people load once the connection authenticates; disabling the URL
  // (null) until then mirrors the old `if (!status?.authenticated) return`.
  const authed = !!status?.authenticated;
  const { data: albumsData } = useEditorData<ImmichAlbumSummary[]>(authed ? '/api/immich/albums' : null);
  const albums = albumsData ?? [];
  const { data: peopleData } = useEditorData<ImmichPersonSummary[]>(authed ? '/api/immich/people' : null);
  const people = peopleData ?? [];

  // Preview strip re-fetches whenever the filter-derived URL changes; the
  // hook's AbortController supersedes the old manual `cancelled` guard.
  const previewParams = new URLSearchParams();
  if (albumId) previewParams.set('albumId', albumId);
  if (personId) previewParams.set('personId', personId);
  if (favoritesOnly) previewParams.set('favorites', 'true');
  previewParams.set('count', '4');
  const { data: previewData } = useEditorData<string[]>(authed ? `/api/immich/photos?${previewParams}` : null);
  const previewImages = useMemo(
    () => (previewData ?? []).map((u) => u.replace('size=preview', 'size=thumbnail')),
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
          {checking ? t('configSections.immichSource.connecting') :
           status?.authenticated ? (status.version ? t('configSections.immichSource.connectedWithVersion', { version: status.version }) : t('configSections.immichSource.connected')) :
           status?.reachable ? t('configSections.immichSource.apiKeyInvalid') : t('configSections.immichSource.cannotReachServer')}
        </span>
        {!checking && !status?.authenticated && (
          <button
            onClick={checkConnection}
            className="text-[10px] text-hs-accent hover:text-hs-accent-hover"
          >
            {t('configSections.immichSource.retry')}
          </button>
        )}
      </div>

      {status?.authenticated && (
        <>
          {/* Album picker */}
          <LabeledField label={t('configSections.immichSource.album')}>
            <select
              value={albumId}
              onChange={(e) => set({ immichAlbumId: e.target.value || undefined, immichPersonId: undefined })}
              className={INPUT_CLASS}
            >
              <option value="">{t('configSections.immichSource.anyAlbum')}</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.assetCount})
                </option>
              ))}
            </select>
          </LabeledField>

          {/* Person filter */}
          <LabeledField label={t('configSections.immichSource.person')}>
            <div className="flex gap-1.5 items-center">
              <select
                value={personId}
                onChange={(e) => set({ immichPersonId: e.target.value || undefined, immichAlbumId: undefined })}
                className={`${INPUT_CLASS} flex-1`}
              >
                <option value="">{t('configSections.immichSource.anyone')}</option>
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
            label={t('configSections.immichSource.favoritesOnly')}
            checked={favoritesOnly}
            onChange={(v) => set({ immichFavoritesOnly: v })}
          />

          {/* Photo count slider */}
          <Slider
            label={t('configSections.immichSource.photosPerRefresh')}
            value={count}
            min={10}
            max={200}
            step={10}
            onChange={(v) => set({ immichCount: v })}
          />

          {/* Preview strip */}
          {previewImages.length > 0 && (
            <div className="mt-1.5">
              {photoCount !== null && (
                <span className="text-[10px] text-hs-text-faint">
                  {photoCount === 1
                    ? t('configSections.immichSource.photoInAlbumSingular', { count: photoCount })
                    : t('configSections.immichSource.photoInAlbumPlural', { count: photoCount })}
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
