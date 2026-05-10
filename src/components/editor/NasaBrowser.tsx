'use client';

import { useState, useCallback, useMemo } from 'react';
import { editorFetch } from '@/lib/editor-fetch';
import { useEditorStore, getActiveScreens } from '@/stores/editor-store';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';
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
  const t = useTranslate('editor');
  const [mode, setMode] = useState<'library' | 'apod'>(hasNasaKey ? 'apod' : 'library');
  const [apodRefreshKey, setApodRefreshKey] = useState(0);
  const { config, selectedDisplayId, updateScreen } = useEditorStore();

  const CATEGORIES: CategoryDef[] = useMemo(() => [
    { label: t('imageBrowsers.nasa.categories.nebula'), query: 'nebula' },
    { label: t('imageBrowsers.nasa.categories.galaxy'), query: 'galaxy' },
    { label: t('imageBrowsers.nasa.categories.earth'), query: 'earth from space' },
    { label: t('imageBrowsers.nasa.categories.mars'), query: 'mars surface' },
    { label: t('imageBrowsers.nasa.categories.moon'), query: 'moon' },
    { label: t('imageBrowsers.nasa.categories.saturn'), query: 'saturn rings' },
    { label: t('imageBrowsers.nasa.categories.jupiter'), query: 'jupiter' },
    { label: t('imageBrowsers.nasa.categories.sun'), query: 'sun solar' },
    { label: t('imageBrowsers.nasa.categories.aurora'), query: 'aurora borealis' },
    { label: t('imageBrowsers.nasa.categories.iss'), query: 'international space station' },
  ], [t]);

  const handleLibrarySearch = useCallback(async (query: string, pageNum: number): Promise<SearchResult> => {
    const url = `/api/nasa?type=search&query=${encodeURIComponent(query)}&page=${pageNum}`;
    const res = await editorFetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || t('imageBrowsers.nasa.errors.fetch'));
    }
    const nasaPhotos: NasaPhoto[] = data.photos ?? [];
    return { photos: toBrowsePhotos(nasaPhotos), totalPages: data.totalPages ?? 1 };
  }, [t]);

  const handleApodSearch = useCallback(async (): Promise<SearchResult> => {
    if (!hasNasaKey) {
      return { photos: [], totalPages: 1 };
    }
    const url = '/api/nasa?type=apod&count=12';
    const res = await editorFetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || t('imageBrowsers.nasa.errors.fetch'));
    }
    const nasaPhotos: NasaPhoto[] = data.photos ?? [];
    return { photos: toBrowsePhotos(nasaPhotos), totalPages: 1 };
  }, [hasNasaKey, t]);

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
      throw new Error(data.error || t('imageBrowsers.nasa.errors.save'));
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
  }, [selectedScreenId, config, selectedDisplayId, updateScreen, t]);

  const modeToggle = (
    <div className="flex gap-1 bg-hs-card rounded-md p-0.5">
      <button
        onClick={() => { setMode('apod'); }}
        className={`flex-1 text-[10px] py-1 rounded ${
          mode === 'apod' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
        }`}
      >
        {t('imageBrowsers.nasa.modes.apod')}
      </button>
      <button
        onClick={() => { setMode('library'); }}
        className={`flex-1 text-[10px] py-1 rounded ${
          mode === 'library' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
        }`}
      >
        {t('imageBrowsers.nasa.modes.library')}
      </button>
    </div>
  );

  const nasaNote = (
    <p className="text-[11px] text-hs-text-faint leading-snug">
      {t('imageBrowsers.nasa.watermarkNote')}
    </p>
  );

  const apodBeforeGrid = (
    <>
      {!hasNasaKey && (
        <div className="text-xs text-hs-text-faint bg-hs-hover rounded-md p-3 space-y-2">
          <p>{t('imageBrowsers.nasa.notConfiguredPrefix')} <strong>{t('imageBrowsers.nasa.settingsWord')}</strong> {t('imageBrowsers.nasa.notConfiguredSuffix')}</p>
          <p className="text-hs-text-faint">{t('imageBrowsers.nasa.apiKeyHint')}</p>
        </div>
      )}
      {hasNasaKey && (
        <Button size="sm" onClick={() => setApodRefreshKey((k) => k + 1)} className="self-start">
          {t('imageBrowsers.nasa.refresh')}
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
        attribution={t('imageBrowsers.nasa.attribution')}
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
      attribution={t('imageBrowsers.nasa.attribution')}
      searchPlaceholder={t('imageBrowsers.nasa.searchPlaceholder')}
      headerSlot={modeToggle}
      beforeGrid={nasaNote}
    />
  );
}
