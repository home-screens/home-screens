'use client';

import { useEffect, useState } from 'react';
import LabeledInput from '@/components/ui/LabeledInput';
import { useEditorData } from '@/hooks/useEditorData';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';
import { PHOTO_SOURCE_MEDIA_PATH, isReady, photoSourceParams, type PhotoSourceUse } from '@/lib/photo-source';
import type { MediaListItem, PhotoSource, SlideshowMediaTypes } from '@/types/config';
import SourceModeToggle from '@/components/editor/SourceModeToggle';
import { ImmichSourceFields } from './ImmichSourceFields';
import { ICloudSourceFields } from './ICloudSourceFields';
import { OneDriveSourceFields } from './OneDriveSourceFields';
import { LibraryFolderFields } from './LibraryFolderFields';
import LibraryPicturesFields from './LibraryPicturesFields';
import PickedPicturesFields from './PickedPicturesFields';
import UnsplashCollectionsFields from './UnsplashCollectionsFields';
import PreviewStrip from './PreviewStrip';

type Library = Extract<PhotoSource, { kind: 'library' }>;
type Immich = Extract<PhotoSource, { kind: 'immich' }>;
type Unsplash = Extract<PhotoSource, { kind: 'unsplash' }>;

/**
 * The fields of one photo source, by kind: the one copy every surface
 * renders, under a slideshow's source select and inside a rotating
 * background's Sources rows alike. A kind with more than one way to name its
 * pictures (a library folder or chosen pictures; Immich filters or picked
 * photos; Unsplash words, collections or picked photos) shows a mode switch,
 * and switching clears the other mode's fields so nothing stays behind.
 */
export default function PhotoSourceEntryFields({ use, source, count, mediaTypes, onChange }: {
  use: PhotoSourceUse;
  source: PhotoSource;
  /** Pictures per refresh, for the previews that ask for what the wall asks for. */
  count: number;
  /** What a slideshow plays, for the iCloud video hint. */
  mediaTypes?: SlideshowMediaTypes;
  onChange: (source: PhotoSource) => void;
}) {
  const t = useTranslate('editor');
  const { status } = useSecretStatus();

  switch (source.kind) {
    case 'library': {
      const mode = source.pictures ? 'pictures' : 'folder';
      return (
        <>
          <SourceModeToggle
            testIdPrefix="library-mode"
            value={mode}
            onChange={(next) => onChange(next === 'pictures' ? { kind: 'library', folder: '', pictures: [] } : { kind: 'library', folder: source.folder })}
            options={[
              { id: 'folder', label: t('photoSources.modes.folder') },
              { id: 'pictures', label: t('photoSources.modes.pictures') },
            ]}
          />
          {mode === 'pictures'
            ? <LibraryPicturesFields pictures={source.pictures ?? []} onChange={(pictures) => onChange({ kind: 'library', folder: '', pictures })} />
            : <LibraryFolderFields source={source as Library} onChange={onChange} withGoogleImport={use === 'stream'} />}
        </>
      );
    }
    case 'immich': {
      const mode = source.assetIds ? 'pictures' : 'filters';
      const filters: Immich = { kind: 'immich', albumIds: source.albumIds, personIds: source.personIds, excludePersonIds: source.excludePersonIds, favoritesOnly: source.favoritesOnly };
      return (
        <>
          <SourceModeToggle
            testIdPrefix="immich-mode"
            value={mode}
            onChange={(next) => onChange(next === 'pictures' ? { kind: 'immich', assetIds: [] } : { kind: 'immich' })}
            options={[
              { id: 'filters', label: t('photoSources.modes.filters') },
              { id: 'pictures', label: t('photoSources.modes.pictures') },
            ]}
          />
          {mode === 'pictures'
            ? <PickedPicturesFields kind="immich" ids={source.assetIds ?? []} onChange={(assetIds) => onChange({ kind: 'immich', assetIds })} />
            : <ImmichSourceFields source={filters} onChange={onChange} />}
        </>
      );
    }
    case 'icloud':
      return <ICloudSourceFields source={source} mediaTypes={use === 'stream' ? mediaTypes : undefined} onChange={onChange} />;
    case 'onedrive':
      return <OneDriveSourceFields source={source} count={count} onChange={onChange} />;
    case 'unsplash': {
      const mode = source.photoIds ? 'pictures' : source.collections ? 'collections' : 'words';
      const ready = isReady('unsplash', status);
      return (
        <>
          <SourceModeToggle
            testIdPrefix="unsplash-mode"
            value={mode}
            onChange={(next) => onChange(
              next === 'pictures' ? { kind: 'unsplash', query: '', photoIds: [] }
                : next === 'collections' ? { kind: 'unsplash', query: '', collections: [] }
                  : { kind: 'unsplash', query: 'nature landscape' },
            )}
            options={[
              { id: 'words', label: t('photoSources.modes.words') },
              { id: 'collections', label: t('photoSources.modes.collections') },
              { id: 'pictures', label: t('photoSources.modes.pictures') },
            ]}
          />
          {mode === 'pictures' && (
            <PickedPicturesFields kind="unsplash" ids={source.photoIds ?? []} onChange={(photoIds) => onChange({ kind: 'unsplash', query: '', photoIds })} />
          )}
          {mode === 'collections' && (
            <UnsplashCollectionsFields collections={source.collections ?? []} ready={ready} onChange={(collections) => onChange({ kind: 'unsplash', query: '', collections })} />
          )}
          {mode === 'words' && <UnsplashWordsFields source={source as Unsplash} count={count} ready={ready} use={use} onChange={onChange} />}
        </>
      );
    }
    case 'nasa':
      return (
        <p className="text-[10px] leading-relaxed text-hs-text-faint">
          {t(use === 'background' ? 'photoSources.nasa.backgroundInfo' : 'photoSources.nasa.streamInfo')}
        </p>
      );
    case 'wall':
      // Walls are picked as tiles in the background's Sources list, never here.
      return null;
  }
}

/** Search words for Unsplash, with a peek at what they bring once a key is saved. */
function UnsplashWordsFields({ source, count, ready, use, onChange }: {
  source: Unsplash;
  count: number;
  ready: boolean;
  use: PhotoSourceUse;
  onChange: (source: PhotoSource) => void;
}) {
  const t = useTranslate('editor');
  // Each new set of words costs one of the free plan's 50 requests an hour,
  // so the preview waits for typing to settle.
  const [settled, setSettled] = useState(source.query);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(source.query), 900);
    return () => clearTimeout(timer);
  }, [source.query]);
  // The wall's own count, so the preview fills the hub's hour-long cache the
  // wall then reads instead of spending a second request.
  const previewUrl = ready && settled.trim()
    ? `${PHOTO_SOURCE_MEDIA_PATH}?${photoSourceParams({ kind: 'unsplash', query: settled.trim() })}&count=${count}`
    : null;
  const { data } = useEditorData<MediaListItem[]>(previewUrl);
  return (
    <>
      <LabeledInput
        label={t('photoSources.unsplash.searchWords')}
        value={source.query}
        placeholder={t('photoSources.unsplash.searchWordsPlaceholder')}
        onChange={(query) => onChange({ kind: 'unsplash', query })}
      />
      <p className="-mt-1 text-[10px] leading-relaxed text-hs-text-faint">{t(use === 'background' ? 'photoSources.unsplash.searchHelpBackground' : 'photoSources.unsplash.searchHelp')}</p>
      <PreviewStrip urls={(data ?? []).slice(0, 4).map((item) => item.url)} />
    </>
  );
}
