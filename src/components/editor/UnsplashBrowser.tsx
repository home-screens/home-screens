'use client';

import { useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore } from '@/stores/editor-store';
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

const CATEGORIES: CategoryDef[] = [
  { label: 'Nature', query: 'nature landscape' },
  { label: 'Mountains', query: 'mountains scenic' },
  { label: 'Ocean', query: 'ocean sea coast' },
  { label: 'Forest', query: 'forest trees' },
  { label: 'Sky', query: 'sky clouds sunset' },
  { label: 'Space', query: 'space galaxy nebula' },
  { label: 'City', query: 'city skyline night' },
  { label: 'Abstract', query: 'abstract gradient dark' },
  { label: 'Flowers', query: 'flowers botanical' },
  { label: 'Seasons', query: 'seasons autumn winter' },
];

/** Map from BrowsePhoto.id to the full UnsplashPhoto for use in the save handler */
let photoCache: Map<string, UnsplashPhoto> = new Map();

interface Props {
  selectedScreenId: string;
  hasUnsplashKey: boolean;
}

export default function UnsplashBrowser({ selectedScreenId, hasUnsplashKey }: Props) {
  const { updateScreen } = useEditorStore();

  const handleSearch = useCallback(async (query: string, pageNum: number): Promise<SearchResult> => {
    const res = await editorFetch(
      `/api/unsplash?query=${encodeURIComponent(query)}&page=${pageNum}&per_page=12&orientation=portrait`
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to search Unsplash');
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
  }, []);

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
        <p>Add a free Unsplash API key in <strong>Settings</strong> to browse thousands of HD backgrounds.</p>
        <p className="text-hs-text-faint">
          Get one at unsplash.com/developers
        </p>
      </div>
    );
  }

  return (
    <ImageSearchBrowser
      categories={CATEGORIES}
      onSearch={handleSearch}
      onUsePhoto={handleUsePhoto}
      attribution="Photos by Unsplash"
      searchPlaceholder="Search anything..."
    />
  );
}
