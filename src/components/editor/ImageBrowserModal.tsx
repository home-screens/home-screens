'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Button from '@/components/ui/Button';
import { useImageLibrary, type DirectoryInfo } from '@/hooks/useImageLibrary';
import { editorFetch } from '@/lib/editor-fetch';
import ImageSearchBrowser, { type BrowsePhoto, type SearchResult } from './ImageSearchBrowser';
import { useTranslate } from '@/i18n';

interface UnsplashPhoto {
  id: string;
  description: string;
  thumb: string;
  regular: string;
  authorName: string;
  downloadUrl: string;
}

// Module-level base list with English `query` keywords (Unsplash search terms;
// the API expects English) and stable `key` slugs that map to translation
// strings inside the component via `useMemo`.
const UNSPLASH_CATEGORY_DEFS = [
  { key: 'nature', query: 'nature landscape' },
  { key: 'mountains', query: 'mountains scenic' },
  { key: 'ocean', query: 'ocean sea coast' },
  { key: 'holidays', query: 'holiday celebration' },
  { key: 'birthday', query: 'birthday party' },
  { key: 'flowers', query: 'flowers botanical' },
  { key: 'seasons', query: 'seasons autumn winter' },
  { key: 'abstract', query: 'abstract gradient dark' },
] as const;

interface ImageBrowserModalProps {
  mode: 'pick-image' | 'manage-directory';
  initialDirectory?: string;
  onSelectImage?: (serveUrl: string) => void;
  onSelectDirectory?: (directoryPath: string) => void;
  onClose: () => void;
}

export default function ImageBrowserModal({
  mode,
  initialDirectory = '',
  onSelectImage,
  onSelectDirectory,
  onClose,
}: ImageBrowserModalProps) {
  const t = useTranslate('editor');
  const lib = useImageLibrary({ initialDirectory });
  const [tab, setTab] = useState<'local' | 'unsplash'>('local');
  const [hasUnsplashKey, setHasUnsplashKey] = useState(false);

  // Translated category list. Categories are stable per-locale; rebuild only
  // when `t` changes (i.e. on locale switch).
  const unsplashCategories = useMemo(
    () =>
      UNSPLASH_CATEGORY_DEFS.map((c) => ({
        label: t(`imageBrowserModal.unsplashCategories.${c.key}`),
        query: c.query,
      })),
    [t],
  );

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Check if Unsplash key is configured (only in pick-image mode)
  useEffect(() => {
    if (mode !== 'pick-image') return;
    async function checkKey() {
      try {
        const res = await editorFetch('/api/secrets');
        if (res.ok) {
          const data: Record<string, boolean> = await res.json();
          setHasUnsplashKey(!!data.unsplash_access_key);
        }
      } catch { /* ignore */ }
    }
    checkKey();
  }, [mode]);

  const handleConfirm = () => {
    if (mode === 'pick-image' && lib.selectedImage) {
      onSelectImage?.(lib.selectedImage);
    } else if (mode === 'manage-directory') {
      onSelectDirectory?.(lib.selectedDir);
    }
    onClose();
  };

  // --- Unsplash search & save ---
  const photoCacheRef = useRef(new Map<string, UnsplashPhoto>());

  const handleUnsplashSearch = useCallback(async (query: string, pageNum: number): Promise<SearchResult> => {
    const res = await editorFetch(
      `/api/unsplash?query=${encodeURIComponent(query)}&page=${pageNum}&per_page=16&orientation=portrait`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to search Unsplash');

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
    photoCacheRef.current = newCache;
    return { photos: browsePhotos, totalPages: data.totalPages ?? 1 };
  }, []);

  const handleUnsplashUsePhoto = useCallback(async (photo: BrowsePhoto) => {
    const original = photoCacheRef.current.get(photo.id);
    if (!original) return;

    // Download image locally via POST /api/unsplash
    const res = await editorFetch('/api/unsplash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: original.regular,
        downloadUrl: original.downloadUrl,
        filename: `unsplash-${original.id}`,
      }),
    });
    if (!res.ok) throw new Error('Failed to save image');
    const data = await res.json();
    if (data.path) {
      onSelectImage?.(data.path);
      onClose();
    }
  }, [onSelectImage, onClose]);

  const currentDirInfo = lib.directories.find((d) => d.path === lib.selectedDir);

  // Build a tree structure for directories
  const rootDirs = lib.directories.filter(
    (d) => d.path !== '' && !d.path.includes('/'),
  );
  const getSubDirs = (parentPath: string) =>
    lib.directories.filter(
      (d) => d.path.startsWith(parentPath + '/') && !d.path.slice(parentPath.length + 1).includes('/'),
    );

  const isConfirmDisabled =
    mode === 'pick-image' ? !lib.selectedImage : false;

  const showTabs = mode === 'pick-image' && hasUnsplashKey;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-hs-panel border border-hs-border-strong rounded-xl w-full max-w-3xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hs-border-strong">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-hs-text-primary">
              {t('imageBrowserModal.title')}
            </h2>
            {showTabs && (
              <div className="flex gap-0.5 bg-hs-card rounded-md p-0.5">
                <button
                  onClick={() => setTab('local')}
                  className={`text-xs px-2.5 py-1 rounded ${
                    tab === 'local' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
                  }`}
                >
                  {t('imageBrowserModal.tabs.local')}
                </button>
                <button
                  onClick={() => setTab('unsplash')}
                  className={`text-xs px-2.5 py-1 rounded ${
                    tab === 'unsplash' ? 'bg-hs-hover text-hs-text-primary' : 'text-hs-text-muted hover:text-hs-text-secondary'
                  }`}
                >
                  {t('imageBrowserModal.tabs.unsplash')}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-hs-text-muted hover:text-hs-text-body text-lg leading-none"
            aria-label={t('modal.closeAriaLabel')}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        {tab === 'local' ? (
          <div className="flex flex-1 min-h-0">
            {/* Sidebar — Directory Tree */}
            <DirectorySidebar
              directories={lib.directories}
              rootDirs={rootDirs}
              selectedDir={lib.selectedDir}
              onSelectDir={lib.setSelectedDir}
              getSubDirs={getSubDirs}
              loadingDirs={lib.loadingDirs}
              showNewFolder={lib.showNewFolder}
              setShowNewFolder={lib.setShowNewFolder}
              newFolderName={lib.newFolderName}
              setNewFolderName={lib.setNewFolderName}
              onCreateFolder={lib.handleCreateFolder}
              newFolderInputRef={lib.newFolderInputRef}
            />

            {/* Main area — Image Grid */}
            <ImageGrid
              images={lib.images}
              selectedImage={lib.selectedImage}
              onSelectImage={(img) => {
                if (mode === 'pick-image') {
                  lib.setSelectedImage(lib.selectedImage === img ? null : img);
                }
              }}
              loadingImages={lib.loadingImages}
              deletingImage={lib.deletingImage}
              onDeleteImage={lib.handleDeleteImage}
              currentDirName={currentDirInfo?.name || t('imageBrowserModal.allPhotos')}
              selectedDir={lib.selectedDir}
              uploading={lib.uploading}
              uploadProgress={lib.uploadProgress}
              onUpload={lib.handleUpload}
              onDeleteFolder={lib.handleDeleteFolder}
              fileInputRef={lib.fileInputRef}
              error={lib.error}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <ImageSearchBrowser
              categories={unsplashCategories}
              onSearch={handleUnsplashSearch}
              onUsePhoto={handleUnsplashUsePhoto}
              attribution={t('imageBrowserModal.unsplashAttribution')}
              searchPlaceholder={t('imageBrowserModal.unsplashSearchPlaceholder')}
              columns={4}
            />
          </div>
        )}

        {/* Footer — only show for local tab */}
        {tab === 'local' && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-hs-border-strong">
            <Button size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleConfirm}
              disabled={isConfirmDisabled}
            >
              {mode === 'pick-image'
                ? t('imageBrowserModal.confirmSelectImage')
                : t('imageBrowserModal.confirmUseFolder')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Directory Sidebar ──────────────────── */

function DirectorySidebar({
  directories,
  rootDirs,
  selectedDir,
  onSelectDir,
  getSubDirs,
  loadingDirs,
  showNewFolder,
  setShowNewFolder,
  newFolderName,
  setNewFolderName,
  onCreateFolder,
  newFolderInputRef,
}: {
  directories: DirectoryInfo[];
  rootDirs: DirectoryInfo[];
  selectedDir: string;
  onSelectDir: (path: string) => void;
  getSubDirs: (parentPath: string) => DirectoryInfo[];
  loadingDirs: boolean;
  showNewFolder: boolean;
  setShowNewFolder: (show: boolean) => void;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  onCreateFolder: () => void;
  newFolderInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const t = useTranslate('editor');
  return (
    <div className="w-[180px] border-r border-hs-border-strong flex flex-col">
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loadingDirs ? (
          <p className="text-xs text-hs-text-faint p-2">{t('common.loading')}</p>
        ) : (
          <>
            {/* Root (All Photos) */}
            <DirectoryButton
              name={t('imageBrowserModal.allPhotos')}
              imageCount={directories.find((d) => d.path === '')?.imageCount ?? 0}
              selected={selectedDir === ''}
              onClick={() => onSelectDir('')}
              depth={0}
            />
            {/* Top-level directories */}
            {rootDirs.map((d) => (
              <DirectoryTreeNode
                key={d.path}
                dir={d}
                selectedDir={selectedDir}
                onSelect={onSelectDir}
                getSubDirs={getSubDirs}
                depth={1}
              />
            ))}
          </>
        )}
      </div>

      {/* New Folder */}
      <div className="p-2 border-t border-hs-border-strong">
        {showNewFolder ? (
          <div className="flex gap-1">
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateFolder();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setShowNewFolder(false);
                  setNewFolderName('');
                }
              }}
              placeholder={t('imageBrowserModal.newFolderPlaceholder')}
              className="flex-1 min-w-0 px-1.5 py-0.5 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-body"
            />
            <button
              onClick={onCreateFolder}
              className="px-1.5 py-0.5 text-xs bg-hs-accent hover:bg-hs-accent text-white rounded"
            >
              {t('imageBrowserModal.newFolderConfirm')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewFolder(true)}
            className="w-full text-xs text-hs-text-muted hover:text-hs-text-body py-1"
          >
            {t('imageBrowserModal.newFolderButton')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Image Grid ──────────────────── */

function ImageGrid({
  images,
  selectedImage,
  onSelectImage,
  loadingImages,
  deletingImage,
  onDeleteImage,
  currentDirName,
  selectedDir,
  uploading,
  uploadProgress,
  onUpload,
  onDeleteFolder,
  fileInputRef,
  error,
}: {
  images: string[];
  selectedImage: string | null;
  onSelectImage: (img: string) => void;
  loadingImages: boolean;
  deletingImage: string | null;
  onDeleteImage: (imageUrl: string) => void;
  currentDirName: string;
  selectedDir: string;
  uploading: boolean;
  uploadProgress: string;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteFolder: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  error: string | null;
}) {
  const t = useTranslate('editor');
  const photoCountLabel = images.length === 1
    ? t('imageBrowserModal.photoCountSingular', { count: images.length })
    : t('imageBrowserModal.photoCountPlural', { count: images.length });
  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hs-border">
        <span className="text-xs text-hs-text-muted flex-1">
          {currentDirName}
          {!loadingImages && (
            <span className="text-hs-text-faint ml-1">
              ({photoCountLabel})
            </span>
          )}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onUpload}
          className="hidden"
        />
        {selectedDir && images.length === 0 && !loadingImages && (
          <Button
            size="sm"
            variant="danger"
            onClick={onDeleteFolder}
          >
            {t('imageBrowserModal.deleteFolderButton')}
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? (uploadProgress || t('imageBrowserModal.uploadingButton'))
            : t('imageBrowserModal.uploadButton')}
        </Button>
      </div>

      {/* Image grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {loadingImages ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-hs-text-faint">{t('imageBrowserModal.loadingImages')}</p>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-xs text-hs-text-faint">{t('imageBrowserModal.emptyPhotos')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img) => (
              <div key={img} className="relative group">
                <button
                  onClick={() => onSelectImage(img)}
                  className={`aspect-square w-full rounded-md overflow-hidden border-2 transition-colors ${
                    selectedImage === img
                      ? 'border-hs-accent'
                      : 'border-transparent hover:border-hs-border-strong'
                  }`}
                >
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteImage(img);
                  }}
                  disabled={deletingImage === img}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-hs-text-secondary hover:bg-hs-danger hover:text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                >
                  {deletingImage === img ? '...' : '×'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 pb-2">
          <p className="text-xs text-hs-danger">{error}</p>
        </div>
      )}
    </div>
  );
}

/* ─── Directory tree helpers ──────────────────── */

function DirectoryButton({
  name,
  imageCount,
  selected,
  onClick,
  depth,
}: {
  name: string;
  imageCount: number;
  selected: boolean;
  onClick: () => void;
  depth: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-xs px-2 py-1 rounded transition-colors truncate ${
        selected
          ? 'bg-hs-accent/20 text-hs-accent-hover'
          : 'text-hs-text-secondary hover:bg-hs-card'
      }`}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
      title={`${name} (${imageCount})`}
    >
      <span className="truncate">{name}</span>
      <span className="text-hs-text-faint ml-1 text-[10px]">{imageCount}</span>
    </button>
  );
}

function DirectoryTreeNode({
  dir,
  selectedDir,
  onSelect,
  getSubDirs,
  depth,
}: {
  dir: DirectoryInfo;
  selectedDir: string;
  onSelect: (path: string) => void;
  getSubDirs: (parentPath: string) => DirectoryInfo[];
  depth: number;
}) {
  const subDirs = getSubDirs(dir.path);

  return (
    <>
      <DirectoryButton
        name={dir.name}
        imageCount={dir.imageCount}
        selected={selectedDir === dir.path}
        onClick={() => onSelect(dir.path)}
        depth={depth}
      />
      {subDirs.map((sub) => (
        <DirectoryTreeNode
          key={sub.path}
          dir={sub}
          selectedDir={selectedDir}
          onSelect={onSelect}
          getSubDirs={getSubDirs}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
