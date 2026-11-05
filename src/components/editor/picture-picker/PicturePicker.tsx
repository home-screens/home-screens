'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useImageLibrary } from '@/hooks/useImageLibrary';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { libraryFileFromServeUrl } from '@/lib/library-client';
import { isReady, offeredFor, type PhotoSourceKind } from '@/lib/photo-source';
import { useTranslate } from '@/i18n';
import LocalTab, { type PickerMode } from './LocalTab';
import ImmichTab from './ImmichTab';
import UnsplashTab from './UnsplashTab';
import NasaTab from './NasaTab';
import BuiltInTab, { isBuiltInPicture, type BuiltInSet } from './BuiltInTab';
import { PictureImportError } from './import-picture';
import { missingImmichPermission } from '@/lib/immich-permissions';
import SetupHint from './SetupHint';
import type { PickerSelection } from './types';

type TabId = 'builtin' | PhotoSourceKind;

interface PicturePickerProps {
  /**
   * pick-image shows pictures and every source; pick-video shows the
   * library's videos (confirm hands back the library file PATH, matching
   * VideoConfig.file); manage-directory chooses a folder and shows
   * everything in it. Only pick-image has source tabs.
   */
  mode: PickerMode;
  initialDirectory?: string;
  /** The pictures that ship with Home Screens for this spot, as the first tab. */
  builtIn?: BuiltInSet;
  /** The picture the spot holds now: the picker opens on the tab holding it. */
  currentValue?: string;
  /** The shape of the wall the picture goes on, for built-in tiles and Unsplash searches. */
  orientation?: 'portrait' | 'landscape';
  /** A footer line for the Local tab (what this spot can upload). */
  localHint?: string;
  onSelectImage?: (serveUrl: string) => void;
  onSelectVideo?: (filePath: string) => void;
  onSelectDirectory?: (directoryPath: string) => void;
  onClose: () => void;
}

/** What each source's tab copies into, for its footer line. */
const COPY_HINT: Partial<Record<TabId, string>> = {
  immich: 'photoSources.immich.copyHint',
  unsplash: 'photoSources.unsplash.copyHint',
  nasa: 'photoSources.nasa.copyHint',
  builtin: 'photoSources.builtIn.copyHint',
};

/**
 * The Image Library: the one window every spot that picks one picture opens
 * (the Image module, a Countdown event, Full-screen Photo's single picture,
 * a screen's background, a day rule's picture). Every source is a tab laid
 * out the same way, with collections down the side, a grid, and Select Image
 * to confirm; the tabs come from `offeredFor('pick')`. A source that is not
 * set up keeps its tab, with a lock and a one-line hint inside, so people
 * can see it is there. A picture from another source is copied into the
 * library, so the wall never needs that source to be up to show it.
 */
export default function PicturePicker({
  mode,
  initialDirectory = '',
  builtIn,
  currentValue,
  orientation,
  localHint,
  onSelectImage,
  onSelectVideo,
  onSelectDirectory,
  onClose,
}: PicturePickerProps) {
  const t = useTranslate('editor');
  const tCore = useTranslate('core');
  const currentFile = currentValue ? libraryFileFromServeUrl(currentValue) : null;
  const lib = useImageLibrary({ initialDirectory: initialDirectory || (currentFile ? currentFile.split('/').slice(0, -1).join('/') : '') });
  const { status } = useSecretStatus(mode === 'pick-image');
  const [selection, setSelection] = useState<PickerSelection | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const showTabs = mode === 'pick-image';
  const tabs: TabId[] = showTabs ? [...(builtIn ? ['builtin' as const] : []), ...offeredFor('pick')] : ['library'];
  const [tab, setTab] = useState<TabId>(() => {
    if (builtIn && (!currentValue || isBuiltInPicture(builtIn, currentValue))) return 'builtin';
    return 'library';
  });

  useEscapeKey(onClose);

  // The library picture the spot holds now starts chosen, so opening the
  // window shows which one it is (Select Image then keeps it).
  const { setSelectedImage } = lib;
  useEffect(() => {
    if (currentFile && mode === 'pick-image') setSelectedImage(currentValue!);
  }, [currentFile, currentValue, mode, setSelectedImage]);

  const switchTab = (next: TabId) => {
    setTab(next);
    setSelection(null);
    setCopyError(null);
  };

  const confirm = async () => {
    if (mode === 'manage-directory') {
      onSelectDirectory?.(lib.selectedDir);
      onClose();
      return;
    }
    if (mode === 'pick-video') {
      // VideoConfig stores the library file path, not the (token-bearing)
      // serve URL; the module re-resolves a fresh URL from the media list.
      const file = lib.selectedImage ? new URL(lib.selectedImage, 'http://local').searchParams.get('file') : null;
      if (file) onSelectVideo?.(file);
      onClose();
      return;
    }
    if (tab === 'library') {
      if (lib.selectedImage) onSelectImage?.(lib.selectedImage);
      onClose();
      return;
    }
    if (!selection) return;
    setCopying(true);
    setCopyError(null);
    try {
      const url = await selection.resolve();
      onSelectImage?.(url);
      onClose();
    } catch (err) {
      setCopyError(copyFailure(err));
      setCopying(false);
    }
  };

  /** Why a copy failed, in the household's language rather than the hub's English. */
  const copyFailure = (err: unknown): string => {
    if (!(err instanceof PictureImportError)) return t('photoSources.picker.copyFailed');
    if (err.status === 415) return t('photoSources.picker.unsupportedFormat');
    const code = (err.body as { error?: string } | null)?.error;
    if (code === 'unsplash-rate-limit') return t('photoSources.unsplash.rateLimited');
    if (code === 'apod-unavailable') return t('photoSources.nasa.apodUnavailable');
    const permission = missingImmichPermission({ status: err.status, body: err.body });
    if (permission) return `${t('photoSources.immich.permissionNote.photosHidden')} ${t('photoSources.immich.permissionNote.howToFix').replace('{permission}', permission)}`;
    return t('photoSources.picker.copyFailed');
  };

  const confirmDisabled = copying
    || (mode === 'manage-directory' ? false : tab === 'library' || mode === 'pick-video' ? !lib.selectedImage : !selection);

  const tabLabel = (id: TabId) => (id === 'builtin' ? t('photoSources.picker.tabs.builtin') : t(`photoSources.picker.tabs.${id}`));
  const locked = (id: TabId) => id !== 'builtin' && !isReady(id, status, 'pick');
  const tabProps = { selection, onSelect: (next: PickerSelection | null) => { setSelection(next); setCopyError(null); }, copying };
  // Where a pick lands, once the tab can pick at all; the chosen picture's
  // own line (a photographer's credit) or a failed copy takes its place.
  const sourceHint = tab === 'library' ? localHint ?? ''
    : COPY_HINT[tab] && (tab === 'builtin' || !locked(tab)) ? t(COPY_HINT[tab]!) : '';
  const hint = copyError ?? selection?.hint ?? sourceHint;

  const title = mode === 'pick-video' ? t('imageBrowserModal.titleVideos')
    : mode === 'manage-directory' ? t('imageBrowserModal.titleMedia')
      : t('imageBrowserModal.title');

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={mode === 'pick-video' ? t('imageBrowserModal.titleVideos') : t('imageBrowserModal.title')}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-hs-panel border border-hs-border-strong rounded-xl w-full max-w-3xl h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hs-border-strong">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-semibold text-hs-text-primary shrink-0">{title}</h2>
            {showTabs && (
              <div className="flex gap-0.5 bg-hs-card rounded-md p-0.5" role="tablist">
                {tabs.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => switchTab(id)}
                    data-testid={`picker-tab-${id}`}
                    title={locked(id) ? t('photoSources.picker.notSetUp') : undefined}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded ${
                      tab === id ? 'bg-hs-hover text-hs-text-primary'
                        : locked(id) ? 'text-hs-text-faint hover:text-hs-text-muted'
                          : 'text-hs-text-muted hover:text-hs-text-secondary'
                    }`}
                  >
                    {locked(id) && <Lock className="h-2.5 w-2.5" aria-hidden="true" />}
                    {tabLabel(id)}
                  </button>
                ))}
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

        <div className="flex flex-1 min-h-0">
          {tab === 'library' && <LocalTab mode={mode} lib={lib} />}
          {tab === 'builtin' && builtIn && <BuiltInTab {...tabProps} set={builtIn} currentValue={currentValue} orientation={orientation} />}
          {tab === 'immich' && (locked('immich')
            ? <div className="flex-1"><SetupHint text={t('photoSources.immich.needsSetup')} /></div>
            : <ImmichTab {...tabProps} />)}
          {tab === 'unsplash' && <UnsplashTab {...tabProps} ready={!locked('unsplash')} orientation={orientation} />}
          {tab === 'nasa' && <NasaTab {...tabProps} />}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-hs-border-strong">
          <span className={`flex-1 line-clamp-2 text-[11px] leading-snug ${copyError ? 'text-hs-danger' : 'text-hs-text-faint'}`} data-testid="picker-hint" title={hint}>
            {hint}
          </span>
          <Button size="sm" onClick={onClose}>{tCore('actions.cancel')}</Button>
          <Button size="sm" variant="primary" onClick={() => void confirm()} disabled={confirmDisabled} data-testid="picker-confirm">
            {copying ? t('photoSources.picker.copying')
              : mode === 'pick-video' ? t('imageBrowserModal.confirmSelectVideo')
                : mode === 'manage-directory' ? t('imageBrowserModal.confirmUseFolder')
                  : t('imageBrowserModal.confirmSelectImage')}
          </Button>
        </div>
      </div>
    </div>
  );
}
