'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import Button from '@/components/ui/Button';
import { useImageLibrary } from '@/hooks/useImageLibrary';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import type { DirectoryInfo } from '@/lib/library-client';
import type { MediaListItem } from '@/types/config';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { editorFetch } from '@/lib/editor-fetch';
import { displayCache } from '@/lib/display-cache';
import ImageSearchBrowser, { type BrowsePhoto, type SearchResult } from './ImageSearchBrowser';
import ICloudImportPanel from './ICloudImportPanel';
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
  /**
   * pick-image shows images only; pick-video shows videos only (confirm hands
   * back the library file PATH, matching VideoConfig.file); manage-directory
   * shows everything so videos are manageable alongside photos.
   */
  mode: 'pick-image' | 'pick-video' | 'manage-directory';
  initialDirectory?: string;
  onSelectImage?: (serveUrl: string) => void;
  onSelectVideo?: (filePath: string) => void;
  onSelectDirectory?: (directoryPath: string) => void;
  onClose: () => void;
}

/** Upload input `accept` per mode — the server validates MIME again anyway. */
const ACCEPT_BY_MODE = {
  'pick-image': 'image/*',
  'pick-video': 'video/mp4,video/webm,video/quicktime',
  'manage-directory': 'image/*,video/mp4,video/webm,video/quicktime',
} as const;

export default function ImageBrowserModal({
  mode,
  initialDirectory = '',
  onSelectImage,
  onSelectVideo,
  onSelectDirectory,
  onClose,
}: ImageBrowserModalProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const lib = useImageLibrary({ initialDirectory });
  const [tab, setTab] = useState<'local' | 'unsplash'>('local');
  // Unsplash key gates the second tab, which only exists in pick-image mode.
  const { status: secretStatus } = useSecretStatus(mode === 'pick-image');
  const hasUnsplashKey = !!secretStatus.unsplash_access_key;

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

  useEscapeKey(onClose);

  const handleConfirm = () => {
    if (mode === 'pick-image' && lib.selectedImage) {
      onSelectImage?.(lib.selectedImage);
    } else if (mode === 'pick-video' && lib.selectedImage) {
      // VideoConfig stores the library file path, not the (token-bearing)
      // serve URL — the module re-resolves a fresh URL from the media list.
      const file = new URL(lib.selectedImage, 'http://local').searchParams.get('file');
      if (file) onSelectVideo?.(file);
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
    if (!res.ok) throw new Error(data.error || t('imageBrowserModal.errors.searchUnsplash'));

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
  }, [t]);

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
    if (!res.ok) throw new Error(t('imageBrowsers.errors.saveImage'));
    const data = await res.json();
    if (data.path) {
      // The Unsplash save wrote a new file into the library.
      displayCache.invalidateByPrefix('/api/backgrounds');
      onSelectImage?.(data.path);
      onClose();
    }
  }, [onSelectImage, onClose, t]);

  const currentDirInfo = lib.directories.find((d) => d.path === lib.selectedDir);

  // Filter the typed media list to what this mode can pick/manage.
  const visibleItems = useMemo(() => {
    if (mode === 'pick-image') return lib.items.filter((i) => i.type === 'image');
    if (mode === 'pick-video') return lib.items.filter((i) => i.type === 'video');
    return lib.items;
  }, [mode, lib.items]);

  // Mode-specific wording: the image picker stays photo-branded, the video
  // picker video-branded, and the mixed management view says "media".
  const rootLabel = mode === 'pick-video'
    ? t('imageBrowserModal.allVideos')
    : mode === 'manage-directory'
      ? t('imageBrowserModal.allMedia')
      : t('imageBrowserModal.allPhotos');

  // Build a tree structure for directories
  const rootDirs = lib.directories.filter(
    (d) => d.path !== '' && !d.path.includes('/'),
  );
  const getSubDirs = (parentPath: string) =>
    lib.directories.filter(
      (d) => d.path.startsWith(parentPath + '/') && !d.path.slice(parentPath.length + 1).includes('/'),
    );

  const isConfirmDisabled =
    mode === 'manage-directory' ? false : !lib.selectedImage;

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
              {mode === 'pick-video' && t('imageBrowserModal.titleVideos')}
              {mode === 'pick-image' && t('imageBrowserModal.title')}
              {mode === 'manage-directory' && t('imageBrowserModal.titleMedia')}
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
              mode={mode}
              rootLabel={rootLabel}
              showNewFolder={lib.showNewFolder}
              setShowNewFolder={lib.setShowNewFolder}
              newFolderName={lib.newFolderName}
              setNewFolderName={lib.setNewFolderName}
              onCreateFolder={lib.handleCreateFolder}
              newFolderInputRef={lib.newFolderInputRef}
            />

            {/* Main area — Media Grid. The iCloud import strip is available in
                every mode: the pick-video and pick-image libraries are the
                same library, and "get my stuff in here" applies equally. */}
            <div className="flex-1 flex flex-col min-w-0">
              <ICloudImportPanel selectedDir={lib.selectedDir} onImported={lib.refresh} />
              <MediaGrid
                items={visibleItems}
                mode={mode}
                selectedUrl={lib.selectedImage}
                onSelectItem={(url) => {
                  if (mode !== 'manage-directory') {
                    lib.setSelectedImage(lib.selectedImage === url ? null : url);
                  }
                }}
                loadingImages={lib.loadingImages}
                deletingImage={lib.deletingImage}
                onDeleteItem={lib.handleDeleteImage}
                // The directories endpoint names the root "All Photos"; override
                // with the mode label rather than echo its image-centric name.
                currentDirName={lib.selectedDir === '' ? rootLabel : currentDirInfo?.name || rootLabel}
                selectedDir={lib.selectedDir}
                uploading={lib.uploading}
                uploadProgress={lib.uploadProgress}
                onUpload={lib.handleUpload}
                onDeleteFolder={lib.handleDeleteFolder}
                fileInputRef={lib.fileInputRef}
                error={lib.error}
              />
            </div>
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
              {tCore('actions.cancel')}
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleConfirm}
              disabled={isConfirmDisabled}
            >
              {mode === 'pick-image' && t('imageBrowserModal.confirmSelectImage')}
              {mode === 'pick-video' && t('imageBrowserModal.confirmSelectVideo')}
              {mode === 'manage-directory' && t('imageBrowserModal.confirmUseFolder')}
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
  mode,
  rootLabel,
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
  mode: 'pick-image' | 'pick-video' | 'manage-directory';
  rootLabel: string;
  showNewFolder: boolean;
  setShowNewFolder: (show: boolean) => void;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  onCreateFolder: () => void;
  newFolderInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  // The directory endpoint counts images only, so its numbers mislead
  // whenever videos are in view — show them only in the image-only picker.
  const showCounts = mode === 'pick-image';
  return (
    <div className="w-[180px] border-r border-hs-border-strong flex flex-col">
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loadingDirs ? (
          <p className="text-xs text-hs-text-faint p-2">{tCore('loading')}</p>
        ) : (
          <>
            {/* Root (All Photos / All Videos / All Media) */}
            <DirectoryButton
              name={rootLabel}
              imageCount={showCounts ? directories.find((d) => d.path === '')?.imageCount ?? 0 : null}
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
                showCounts={showCounts}
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

/* ─── Media Grid ──────────────────── */

function MediaGrid({
  items,
  mode,
  selectedUrl,
  onSelectItem,
  loadingImages,
  deletingImage,
  onDeleteItem,
  currentDirName,
  selectedDir,
  uploading,
  uploadProgress,
  onUpload,
  onDeleteFolder,
  fileInputRef,
  error,
}: {
  items: MediaListItem[];
  mode: 'pick-image' | 'pick-video' | 'manage-directory';
  selectedUrl: string | null;
  onSelectItem: (url: string) => void;
  loadingImages: boolean;
  deletingImage: string | null;
  onDeleteItem: (url: string) => void;
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
  const tCore = useTranslate('core');
  const photoCount = items.filter((i) => i.type === 'image').length;
  const videoCount = items.filter((i) => i.type === 'video').length;
  const countParts: string[] = [];
  if (photoCount > 0 || videoCount === 0) {
    countParts.push(photoCount === 1
      ? t('imageBrowserModal.photoCountSingular', { count: photoCount })
      : t('imageBrowserModal.photoCountPlural', { count: photoCount }));
  }
  if (videoCount > 0) {
    countParts.push(videoCount === 1
      ? t('imageBrowserModal.videoCountSingular', { count: videoCount })
      : t('imageBrowserModal.videoCountPlural', { count: videoCount }));
  }
  const emptyMessage = mode === 'pick-video'
    ? t('configSections.video.noVideosYet')
    : t('imageBrowserModal.emptyPhotos');
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hs-border">
        <span className="text-xs text-hs-text-muted flex-1">
          {currentDirName}
          {!loadingImages && (
            <span className="text-hs-text-faint ml-1">
              ({countParts.join(', ')})
            </span>
          )}
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_BY_MODE[mode]}
          multiple
          onChange={onUpload}
          className="hidden"
        />
        {selectedDir && items.length === 0 && !loadingImages && (
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
          {uploading && (uploadProgress || t('imageBrowserModal.uploadingButton'))}
          {!uploading && mode === 'pick-video' && t('imageBrowserModal.uploadVideosButton')}
          {!uploading && mode === 'pick-image' && t('imageBrowserModal.uploadButton')}
          {!uploading && mode === 'manage-directory' && t('imageBrowserModal.uploadMediaButton')}
        </Button>
      </div>

      {/* Media grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {loadingImages ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs text-hs-text-faint">{t('imageBrowserModal.loadingImages')}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-xs text-hs-text-faint">{emptyMessage}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => (
              <div key={item.url} className="relative group" data-media-type={item.type}>
                <button
                  onClick={() => onSelectItem(item.url)}
                  className={`aspect-square w-full rounded-md overflow-hidden border-2 transition-colors ${
                    selectedUrl === item.url
                      ? 'border-hs-accent'
                      : 'border-transparent hover:border-hs-border-strong'
                  }`}
                >
                  {item.type === 'video' ? (
                    <>
                      {/* First frame as the thumbnail — no server-side thumbnailer needed.
                          The editor session cookie authenticates the metadata fetch. */}
                      <video
                        src={item.url}
                        preload="metadata"
                        muted
                        playsInline
                        className="w-full h-full object-cover pointer-events-none"
                      />
                      <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="w-8 h-8 rounded-full bg-black/55 flex items-center justify-center">
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </span>
                    </>
                  ) : (
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteItem(item.url);
                  }}
                  disabled={deletingImage === item.url}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-hs-text-secondary hover:bg-hs-danger hover:text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  title={tCore('actions.delete')}
                  aria-label={tCore('actions.delete')}
                >
                  {deletingImage === item.url ? '...' : '×'}
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
  /** null hides the count (video mode — the endpoint only counts images). */
  imageCount: number | null;
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
      title={imageCount === null ? name : `${name} (${imageCount})`}
    >
      <span className="truncate">{name}</span>
      {imageCount !== null && (
        <span className="text-hs-text-faint ml-1 text-[10px]">{imageCount}</span>
      )}
    </button>
  );
}

function DirectoryTreeNode({
  dir,
  selectedDir,
  onSelect,
  getSubDirs,
  depth,
  showCounts,
}: {
  dir: DirectoryInfo;
  selectedDir: string;
  onSelect: (path: string) => void;
  getSubDirs: (parentPath: string) => DirectoryInfo[];
  depth: number;
  showCounts: boolean;
}) {
  const subDirs = getSubDirs(dir.path);

  return (
    <>
      <DirectoryButton
        name={dir.name}
        imageCount={showCounts ? dir.imageCount : null}
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
          showCounts={showCounts}
        />
      ))}
    </>
  );
}
