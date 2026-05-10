'use client';

import { useCallback, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore } from '@/stores/editor-store';
import { useTranslate } from '@/i18n';
import ImageSearchBrowser, { type BrowsePhoto, type CategoryDef, type SearchResult } from './ImageSearchBrowser';

interface UnsplashPhoto {
  id: string;
  description: string;
  thumb: string;
  small: string;
  regular: string;
  full: string;
  raw: string;
  authorName: string;
  authorUrl: string;
  downloadUrl: string;
}

/** Map from BrowsePhoto.id to the full UnsplashPhoto for use in the save handler */
let photoCache: Map<string, UnsplashPhoto> = new Map();

interface Props {
  selectedScreenId: string;
  hasUnsplashKey: boolean;
}

export default function UnsplashBrowser({ selectedScreenId, hasUnsplashKey }: Props) {
  const t = useTranslate('editor');
  const { updateScreen } = useEditorStore();

  const CATEGORIES: CategoryDef[] = useMemo(() => [
    { label: t('imageBrowsers.unsplash.categories.nature'), query: 'nature landscape' },
    { label: t('imageBrowsers.unsplash.categories.mountains'), query: 'mountains scenic' },
    { label: t('imageBrowsers.unsplash.categories.ocean'), query: 'ocean sea coast' },
    { label: t('imageBrowsers.unsplash.categories.forest'), query: 'forest trees' },
    { label: t('imageBrowsers.unsplash.categories.sky'), query: 'sky clouds sunset' },
    { label: t('imageBrowsers.unsplash.categories.space'), query: 'space galaxy nebula' },
    { label: t('imageBrowsers.unsplash.categories.city'), query: 'city skyline night' },
    { label: t('imageBrowsers.unsplash.categories.abstract'), query: 'abstract gradient dark' },
    { label: t('imageBrowsers.unsplash.categories.flowers'), query: 'flowers botanical' },
    { label: t('imageBrowsers.unsplash.categories.seasons'), query: 'seasons autumn winter' },
  ], [t]);

  const handleSearch = useCallback(async (query: string, pageNum: number): Promise<SearchResult> => {
    const res = await editorFetch(
      `/api/unsplash?query=${encodeURIComponent(query)}&page=${pageNum}&per_page=12&orientation=portrait`
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || t('imageBrowsers.unsplash.errors.search'));
    }
    const unsplashPhotos: UnsplashPhoto[] = data.photos ?? [];
    const newCache = new Map<string, UnsplashPhoto>();
    const browsePhotos: BrowsePhoto[] = unsplashPhotos.map((p) => {
      newCache.set(p.id, p);
      return {
        id: p.id,
        thumb: p.thumb,
        alt: p.description,
        overlayLabel: p.authorName,
      };
    });
    photoCache = newCache;
    return { photos: browsePhotos, totalPages: data.totalPages ?? 1 };
  }, [t]);

  const handleUsePhoto = useCallback(async (photo: BrowsePhoto) => {
    if (!selectedScreenId) return;
    const original = photoCache.get(photo.id);
    if (!original) return;

    const res = await editorFetch('/api/unsplash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: original.regular,
        downloadUrl: original.downloadUrl,
        filename: `unsplash-${original.id}`,
      }),
    });
    const data = await res.json();
    if (data.path) {
      updateScreen(selectedScreenId, { backgroundImage: data.path });
    }
  }, [selectedScreenId, updateScreen]);

  if (!hasUnsplashKey) {
    return (
      <div className="text-xs text-hs-text-faint bg-hs-hover rounded-md p-3 space-y-2">
        <p>{t('imageBrowsers.unsplash.notConfiguredPrefix')} <strong>{t('imageBrowsers.unsplash.settingsWord')}</strong> {t('imageBrowsers.unsplash.notConfiguredSuffix')}</p>
        <p className="text-hs-text-faint">
          {t('imageBrowsers.unsplash.apiKeyHint')}
        </p>
      </div>
    );
  }

  return (
    <ImageSearchBrowser
      categories={CATEGORIES}
      onSearch={handleSearch}
      onUsePhoto={handleUsePhoto}
      attribution={t('imageBrowsers.unsplash.attribution')}
      searchPlaceholder={t('imageBrowsers.unsplash.searchPlaceholder')}
    />
  );
}
