'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import { useTranslate } from '@/i18n';

export interface BrowsePhoto {
  id: string;
  thumb: string;
  alt: string;
  /** Primary overlay text (author name, title, etc.) */
  overlayLabel: string;
  /** Optional secondary overlay line (date, etc.) */
  overlaySecondary?: string;
}

export interface CategoryDef {
  label: string;
  query: string;
}

export interface SearchResult {
  photos: BrowsePhoto[];
  totalPages: number;
}

interface ImageSearchBrowserProps {
  categories: CategoryDef[];
  onSearch: (query: string, page: number) => Promise<SearchResult>;
  onUsePhoto: (photo: BrowsePhoto) => Promise<void>;
  attribution: string;
  searchPlaceholder?: string;
  /** Content rendered before the category pills (e.g. mode toggle) */
  headerSlot?: React.ReactNode;
  /** When true, categories and search bar are hidden (e.g. NASA APOD mode) */
  hideSearch?: boolean;
  /** Extra content rendered between the header/search and the photo grid */
  beforeGrid?: React.ReactNode;
  /** External trigger to re-run the current search (increment to trigger) */
  refreshKey?: number;
  /** Grid columns (default 2). Use 4 for wider containers. */
  columns?: 2 | 3 | 4;
}

export default function ImageSearchBrowser({
  categories,
  onSearch,
  onUsePhoto,
  attribution,
  searchPlaceholder,
  headerSlot,
  hideSearch = false,
  beforeGrid,
  refreshKey = 0,
  columns = 2,
}: ImageSearchBrowserProps) {
  const t = useTranslate('editor');
  const effectiveSearchPlaceholder = searchPlaceholder ?? t('imageBrowsers.search.placeholder');
  const [photos, setPhotos] = useState<BrowsePhoto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.query ?? '');
  const [customSearch, setCustomSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const runSearch = useCallback(async (query: string, pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await onSearch(query, pageNum);
      setPhotos(result.photos);
      setTotalPages(result.totalPages);
    } catch {
      setError(t('imageBrowsers.search.errors.load'));
      setPhotos([]);
    } finally {
      setIsLoading(false);
    }
  }, [onSearch, t]);

  useEffect(() => {
    runSearch(selectedCategory, page);
  }, [selectedCategory, page, runSearch, refreshKey]);

  const handleCategoryChange = (query: string) => {
    setSelectedCategory(query);
    setPage(1);
    setCustomSearch('');
  };

  const handleCustomSearch = () => {
    if (!customSearch.trim()) return;
    setSelectedCategory(customSearch.trim());
    setPage(1);
  };

  const handleUsePhoto = async (photo: BrowsePhoto) => {
    setIsSaving(photo.id);
    setError(null);
    try {
      await onUsePhoto(photo);
    } catch {
      setError(t('imageBrowsers.search.errors.save'));
    }
    setIsSaving(null);
  };

  return (
    <>
      {headerSlot}

      {!hideSearch && (
        <>
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <button
                key={cat.query}
                onClick={() => handleCategoryChange(cat.query)}
                className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
                  selectedCategory === cat.query
                    ? 'bg-hs-accent text-white'
                    : 'bg-hs-card text-hs-text-muted hover:text-hs-text-body'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5">
            <input
              type="text"
              value={customSearch}
              onChange={(e) => setCustomSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomSearch()}
              placeholder={effectiveSearchPlaceholder}
              className="flex-1 rounded-md bg-hs-card border border-hs-border-strong text-xs text-hs-text-body px-2 py-1.5 focus:outline-none focus:border-hs-accent"
            />
            <Button size="sm" onClick={handleCustomSearch}>
              {t('imageBrowsers.search.searchButton')}
            </Button>
          </div>
        </>
      )}

      {beforeGrid}

      {error && <p className="text-xs text-hs-danger">{error}</p>}

      {isLoading ? (
        <div className="text-xs text-hs-text-faint py-4 text-center">{t('common.loading')}</div>
      ) : (
        <div className={`grid gap-1.5 overflow-y-auto ${
          columns === 4 ? 'grid-cols-4' : columns === 3 ? 'grid-cols-3' : 'grid-cols-2 max-h-[300px]'
        }`}>
          {photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => handleUsePhoto(photo)}
              disabled={isSaving === photo.id}
              className="group relative aspect-[9/16] rounded overflow-hidden border border-hs-border-strong hover:border-hs-accent transition-colors"
            >
              <img
                src={photo.thumb}
                alt={photo.alt}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end">
                <span className="text-[9px] text-white/0 group-hover:text-white/80 px-1.5 pb-1 truncate w-full transition-colors">
                  {photo.overlayLabel}
                  {photo.overlaySecondary && (
                    <span className="block text-white/50">{photo.overlaySecondary}</span>
                  )}
                </span>
              </div>
              {isSaving === photo.id && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="text-xs text-white">{t('common.saving')}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {!hideSearch && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('imageBrowsers.search.prev')}
          </Button>
          <span className="text-[10px] text-hs-text-faint">
            {t('imageBrowsers.search.pageOf', { page, total: totalPages })}
          </span>
          <Button
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('imageBrowsers.search.next')}
          </Button>
        </div>
      )}

      <p className="text-[9px] text-hs-text-faint text-center">
        {attribution}
      </p>
    </>
  );
}
