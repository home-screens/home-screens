'use client';

import { useState, useCallback } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import Button from '@/components/ui/Button';
import ImageSearchBrowser, { type BrowsePhoto, type CategoryDef, type SearchResult } from './ImageSearchBrowser';

interface NasaPhoto {
  id: string;
  title: string;
  description: string;
  date: string;
  thumb: string;
  url?: string;
  hdurl?: string;
  nasaId?: string;
}

const CATEGORIES: CategoryDef[] = [
  { label: 'Nebula', query: 'nebula' },
  { label: 'Galaxy', query: 'galaxy' },
  { label: 'Earth', query: 'earth from space' },
  { label: 'Mars', query: 'mars surface' },
  { label: 'Moon', query: 'moon' },
  { label: 'Saturn', query: 'saturn rings' },
  { label: 'Jupiter', query: 'jupiter' },
  { label: 'Sun', query: 'sun solar' },
  { label: 'Aurora', query: 'aurora borealis' },
  { label: 'ISS', query: 'international space station' },
];

/** Map from BrowsePhoto.id to the full NasaPhoto for use in the save handler */
let photoCache: Map<string, NasaPhoto> = new Map();

function toBrowsePhotos(nasaPhotos: NasaPhoto[]): BrowsePhoto[] {
  const newCache = new Map<string, NasaPhoto>();
  const result = nasaPhotos.map((p) => {
    newCache.set(p.id, p);
    return {
      id: p.id,
      thumb: p.thumb,
      alt: p.title,
      overlayLabel: p.title,
      overlaySecondary: p.date ? p.date.slice(0, 10) : undefined,
    };
  });
  photoCache = newCache;
  return result;
}

interface Props {
  selectedScreenId: string;
  hasNasaKey: boolean;
}

export default function NasaBrowser({ selectedScreenId, hasNasaKey }: Props) {
  const [mode, setMode] = useState<'library' | 'apod'>(hasNasaKey ? 'apod' : 'library');
  const [apodRefreshKey, setApodRefreshKey] = useState(0);
  const { config, selectedDisplayId, updateScreen } = useEditorStore();

  const handleLibrarySearch = useCallback(async (query: string, pageNum: number): Promise<SearchResult> => {
    const url = `/api/nasa?type=search&query=${encodeURIComponent(query)}&page=${pageNum}`;
    const res = await editorFetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch NASA images');
    }
    const nasaPhotos: NasaPhoto[] = data.photos ?? [];
    return { photos: toBrowsePhotos(nasaPhotos), totalPages: data.totalPages ?? 1 };
  }, []);

  const handleApodSearch = useCallback(async (): Promise<SearchResult> => {
    if (!hasNasaKey) {
      return { photos: [], totalPages: 1 };
    }
    const url = '/api/nasa?type=apod&count=12';
    const res = await editorFetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch NASA images');
    }
    const nasaPhotos: NasaPhoto[] = data.photos ?? [];
    return { photos: toBrowsePhotos(nasaPhotos), totalPages: 1 };
  }, [hasNasaKey]);

  const handleUsePhoto = useCallback(async (photo: BrowsePhoto) => {
    if (!selectedScreenId) return;
    const original = photoCache.get(photo.id);
    if (!original) return;

    let imageUrl: string;
    if (original.hdurl) {
      imageUrl = original.hdurl;
    } else if (original.nasaId) {
      const assetRes = await editorFetch(
        `/api/nasa/asset?nasaId=${encodeURIComponent(original.nasaId)}`
      );
      if (assetRes.ok) {
        const assetData = await assetRes.json();
        imageUrl = assetData.imageUrl || original.thumb;
      } else {
        imageUrl = original.thumb;
      }
    } else {
      imageUrl = original.thumb;
    }

    const res = await editorFetch('/api/nasa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        filename: `nasa-${original.id}`,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to save image');
    }
    if (data.path) {
      const activeScreens = config ? getActiveScreens(config, selectedDisplayId) : [];
      const currentScreen = activeScreens.find((s) => s.id === selectedScreenId);
      const updates: Record<string, unknown> = { backgroundImage: data.path };
      if (currentScreen?.backgroundRotation?.enabled) {
        updates.backgroundRotation = { ...currentScreen.backgroundRotation, enabled: false };
      }
      updateScreen(selectedScreenId, updates);
    }
  }, [selectedScreenId, config, selectedDisplayId, updateScreen]);

  const modeToggle = (
    <div className="flex gap-1 bg-neutral-800 rounded-md p-0.5">
      <button
        onClick={() => { setMode('apod'); }}
        className={`flex-1 text-[10px] py-1 rounded ${
          mode === 'apod' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'
        }`}
      >
        Picture of the Day
      </button>
      <button
        onClick={() => { setMode('library'); }}
        className={`flex-1 text-[10px] py-1 rounded ${
          mode === 'library' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-400 hover:text-neutral-300'
        }`}
      >
        Image Library
      </button>
    </div>
  );

  const nasaNote = (
    <p className="text-[11px] text-neutral-500 leading-snug">
      Note: Some NASA images include embedded timestamps or watermarks that cannot be removed.
    </p>
  );

  const apodBeforeGrid = (
    <>
      {!hasNasaKey && (
        <div className="text-xs text-neutral-500 bg-neutral-800/50 rounded-md p-3 space-y-2">
          <p>Add a free NASA API key in <strong>Settings</strong> to browse Astronomy Picture of the Day.</p>
          <p className="text-neutral-600">Get one at api.nasa.gov</p>
        </div>
      )}
      {hasNasaKey && (
        <Button size="sm" onClick={() => setApodRefreshKey((k) => k + 1)} className="self-start">
          Refresh
        </Button>
      )}
      {nasaNote}
    </>
  );

  if (mode === 'apod') {
    return (
      <ImageSearchBrowser
        categories={[]}
        onSearch={handleApodSearch}
        onUsePhoto={handleUsePhoto}
        attribution="Images courtesy of NASA"
        hideSearch
        headerSlot={modeToggle}
        beforeGrid={apodBeforeGrid}
        refreshKey={apodRefreshKey}
      />
    );
  }

  return (
    <ImageSearchBrowser
      categories={CATEGORIES}
      onSearch={handleLibrarySearch}
      onUsePhoto={handleUsePhoto}
      attribution="Images courtesy of NASA"
      searchPlaceholder="Search NASA images..."
      headerSlot={modeToggle}
      beforeGrid={nasaNote}
    />
  );
}
