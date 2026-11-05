'use client';

import { useCallback, useMemo, useRef } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { localImageFileOf } from '@/lib/local-images';
import { useTranslate } from '@/i18n';
import type { BackgroundRotation } from '@/types/config';
import { SourceHint } from './SourceModeToggle';
import ImageSearchBrowser, { type BrowsePhoto, type SearchResult } from './ImageSearchBrowser';

/** Hand-picked photos are saved under this name so they stay out of the library and are cleaned up once unchosen. */
const PICK_PREFIX = 'rotation-unsplash-pick-';
const RESULTS_PER_PAGE = 8;
const DEFAULT_QUERY = 'nature landscape';

interface UnsplashPhoto {
  id: string;
  description: string;
  thumb: string;
  regular: string;
  authorName: string;
  downloadUrl: string;
}

/** The Unsplash photo id behind a saved pick, or null for any other file. */
export function pickedPhotoId(servePath: string): string | null {
  const file = decodeURIComponent(localImageFileOf(servePath));
  return file.startsWith(PICK_PREFIX) ? file.slice(PICK_PREFIX.length).replace(/\.[a-z0-9]+$/i, '') : null;
}

/** Search Unsplash and pick one or more photos; each is saved once and shown or rotated by the screen. */
export default function UnsplashSearchPicker({ rotation, onChange }: {
  rotation: BackgroundRotation;
  onChange: (updates: Partial<BackgroundRotation>) => void;
}) {
  const t = useTranslate('editor');
  const picked = useMemo(() => rotation.unsplashImages ?? [], [rotation.unsplashImages]);
  const selectedIds = useMemo(
    () => new Set(picked.map(pickedPhotoId).filter((id): id is string => !!id)),
    [picked],
  );
  const photoCache = useRef(new Map<string, UnsplashPhoto>());

  const search = useCallback(async (query: string, page: number): Promise<SearchResult> => {
    const res = await editorFetch(
      `/api/unsplash?query=${encodeURIComponent(query)}&page=${page}&per_page=${RESULTS_PER_PAGE}&orientation=portrait`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    const photos: UnsplashPhoto[] = data.photos ?? [];
    photoCache.current = new Map(photos.map((photo) => [photo.id, photo]));
    return {
      photos: photos.map((photo) => ({ id: photo.id, thumb: photo.thumb, alt: photo.description, overlayLabel: photo.authorName })),
      totalPages: data.totalPages ?? 1,
    };
  }, []);

  const toggle = useCallback(async (photo: BrowsePhoto) => {
    if (selectedIds.has(photo.id)) {
      onChange({ unsplashImages: picked.filter((url) => pickedPhotoId(url) !== photo.id) });
      return;
    }
    const original = photoCache.current.get(photo.id);
    if (!original) return;
    const res = await editorFetch('/api/unsplash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: original.regular,
        downloadUrl: original.downloadUrl,
        filename: `${PICK_PREFIX}${original.id}`,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.path) throw new Error(data.error || 'Save failed');
    onChange({ unsplashImages: [...picked, data.path as string] });
  }, [onChange, picked, selectedIds]);

  return (
    <div className="space-y-2" data-testid="unsplash-search-picker">
      <SourceHint>{t('backgroundPicker.picturesHint')}</SourceHint>
      <ImageSearchBrowser
        categories={[]}
        hideCategories
        pagerAbove
        selectedIds={selectedIds}
        initialQuery={rotation.query || DEFAULT_QUERY}
        onSearchSubmit={(query) => onChange({ query })}
        onSearch={search}
        onUsePhoto={toggle}
        searchPlaceholder={t('imageBrowsers.unsplash.searchPlaceholder')}
      />
    </div>
  );
}
