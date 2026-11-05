'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { localImageFileOf } from '@/lib/local-images';
import { useTranslate } from '@/i18n';
import type { BackgroundRotation } from '@/types/config';
import { SourceHint } from './SourceModeToggle';
import ImageSearchBrowser, { type BrowsePhoto, type SearchResult } from './ImageSearchBrowser';

/** Hand-picked photos are saved under this name so they stay out of the library and are cleaned up once unchosen. */
const PICK_PREFIX = 'rotation-immich-pick-';

interface ImmichAlbumOption { id: string; name: string; assetCount: number }

/** The Immich asset id behind a saved pick, or null for any other file. */
export function pickedAssetId(servePath: string): string | null {
  const file = decodeURIComponent(localImageFileOf(servePath));
  return file.startsWith(PICK_PREFIX) ? file.slice(PICK_PREFIX.length).replace(/\.[a-z0-9]+$/i, '') : null;
}

/** Browse the Immich library (all photos or one album) and pick one or more; each is saved once and shown or rotated by the screen. */
export default function ImmichPickPicker({ rotation, onChange }: {
  rotation: BackgroundRotation;
  onChange: (updates: Partial<BackgroundRotation>) => void;
}) {
  const t = useTranslate('editor');
  const [albums, setAlbums] = useState<ImmichAlbumOption[]>([]);
  const [albumId, setAlbumId] = useState('');
  const picked = useMemo(() => rotation.immichImages ?? [], [rotation.immichImages]);
  const selectedIds = useMemo(
    () => new Set(picked.map(pickedAssetId).filter((id): id is string => !!id)),
    [picked],
  );

  useEffect(() => {
    let cancelled = false;
    editorFetch('/api/immich/albums')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => { if (!cancelled) setAlbums(Array.isArray(data) ? data : []); })
      .catch(() => { /* the dropdown just offers All photos */ });
    return () => { cancelled = true; };
  }, []);

  const search = useCallback(async (_query: string, page: number): Promise<SearchResult> => {
    const params = new URLSearchParams({ page: String(page) });
    if (albumId) params.set('albumId', albumId);
    const res = await editorFetch(`/api/immich/search?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    // Immich reports no reliable total (search `total` is the page size, album
    // `assetCount` includes videos), so only whether a next page exists is known.
    return {
      photos: (data.photos ?? []).map((photo: { id: string; thumb: string; alt: string; date: string }) => ({
        id: photo.id, thumb: photo.thumb, alt: photo.alt, overlayLabel: photo.alt, overlaySecondary: photo.date,
      })),
      hasNext: !!data.hasNext,
    };
  }, [albumId]);

  const toggle = useCallback(async (photo: BrowsePhoto) => {
    if (selectedIds.has(photo.id)) {
      onChange({ immichImages: picked.filter((url) => pickedAssetId(url) !== photo.id) });
      return;
    }
    const res = await editorFetch('/api/immich/pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: photo.id }),
    });
    const data = await res.json();
    if (!res.ok || !data.path) throw new Error(data.error || 'Save failed');
    onChange({ immichImages: [...picked, data.path as string] });
  }, [onChange, picked, selectedIds]);

  const albumSelect = (
    <select
      value={albumId}
      onChange={(e) => setAlbumId(e.target.value)}
      aria-label={t('backgroundPicker.immich.albumLabel')}
      data-testid="immich-pick-album"
      className="w-full rounded-md bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1.5 focus:outline-none focus:border-hs-accent"
    >
      <option value="">{t('imageBrowsers.immich.allPhotos')}</option>
      {albums.map((album) => (
        <option key={album.id} value={album.id}>
          {t('backgroundPicker.immich.albumOption', { name: album.name, count: album.assetCount })}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-2" data-testid="immich-pick-picker">
      <SourceHint>{t('backgroundPicker.picturesHint')}</SourceHint>
      {/* Remount per album so the pager starts again at page 1. */}
      <ImageSearchBrowser
        key={albumId}
        categories={[]}
        hideCategories
        hideSearchBox
        pagerAbove
        headerSlot={albumSelect}
        selectedIds={selectedIds}
        initialQuery={albumId}
        onSearch={search}
        onUsePhoto={toggle}
      />
    </div>
  );
}
