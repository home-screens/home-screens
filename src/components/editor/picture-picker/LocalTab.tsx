'use client';

import Button from '@/components/ui/Button';
import type { useImageLibrary } from '@/hooks/useImageLibrary';
import { useGooglePhotosImport } from '@/hooks/useGooglePhotosImport';
import type { DirectoryInfo } from '@/lib/library-client';
import type { MediaListItem } from '@/types/config';
import { tileThumbnailUrl } from '@/lib/media-paths';
import ICloudImportPanel from '@/components/editor/ICloudImportPanel';
import { GooglePhotosAction, GooglePhotosProgress } from '@/components/editor/photo-source/GooglePhotosAdd';
import { useTranslate } from '@/i18n';

export type PickerMode = 'pick-image' | 'pick-video' | 'manage-directory';

/** Upload input `accept` per mode; the server checks the type again anyway. */
const ACCEPT_BY_MODE = {
  'pick-image': 'image/*',
  'pick-video': 'video/mp4,video/webm,video/quicktime',
  'manage-directory': 'image/*,video/mp4,video/webm,video/quicktime',
} as const;

/**
 * The household's own library: folders down the side, the folder's pictures
 * (or videos) in the grid, upload, and the two ways to add from elsewhere
 * into the selected folder: an iCloud link and Google Photos. Every mode
 * shows them, since the picture, video and folder choosers are the same
 * library.
 */
export default function LocalTab({ mode, lib }: { mode: PickerMode; lib: ReturnType<typeof useImageLibrary> }) {
  const t = useTranslate('editor');
  const google = useGooglePhotosImport({ folder: lib.selectedDir, onImported: () => lib.refresh() });
  const currentDirInfo = lib.directories.find((d) => d.path === lib.selectedDir);

  // Filter the typed media list to what this mode can pick or manage.
  const visibleItems = mode === 'pick-image' ? lib.items.filter((i) => i.type === 'image')
    : mode === 'pick-video' ? lib.items.filter((i) => i.type === 'video')
      : lib.items;

  // Mode-specific wording: the image picker stays photo-branded, the video
  // picker video-branded, and the mixed management view says "media".
  const rootLabel = mode === 'pick-video'
    ? t('imageBrowserModal.allVideos')
    : mode === 'manage-directory'
      ? t('imageBrowserModal.allMedia')
      : t('imageBrowserModal.allPhotos');

  const rootDirs = lib.directories.filter((d) => d.path !== '' && !d.path.includes('/'));
  const getSubDirs = (parentPath: string) =>
    lib.directories.filter(
      (d) => d.path.startsWith(parentPath + '/') && !d.path.slice(parentPath.length + 1).includes('/'),
    );

  return (
    <div className="flex flex-1 min-h-0">
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

      <div className="flex-1 flex flex-col min-w-0">
        <ICloudImportPanel
          selectedDir={lib.selectedDir}
          onImported={lib.refresh}
          trailing={<GooglePhotosAction google={google} />}
          below={<GooglePhotosProgress google={google} folderLabel={lib.selectedDir || rootLabel} />}
        />
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
          // A folder that doesn't exist yet (calendar-art before its first
          // picture) is still where an upload lands, so it is named, not
          // shown as the top level.
          currentDirName={lib.selectedDir === '' ? rootLabel : currentDirInfo?.name || lib.selectedDir.split('/').pop() || rootLabel}
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
  mode: PickerMode;
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
  mode: PickerMode;
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
        {selectedDir && items.length === 0 && !loadingImages && mode !== 'manage-directory' && (
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
                      src={tileThumbnailUrl(item.url)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>
                {/* Delete button. Not while picking a folder: that window
                    only chooses where a source reads from, and a mis-click
                    on a tile must not take a family photo with it. Files
                    are managed on Settings > Pictures & videos. */}
                {mode !== 'manage-directory' && (
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
                )}
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
