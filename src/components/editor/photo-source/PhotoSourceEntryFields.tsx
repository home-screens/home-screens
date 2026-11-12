'use client';

import { useEffect, useState } from 'react';
import LabeledInput from '@/components/ui/LabeledInput';
import { useEditorData } from '@/hooks/useEditorData';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useConfirmStore } from '@/stores/confirm-store';
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

/** The words Unsplash starts with, so a fresh Words mode is never blank. */
const DEFAULT_UNSPLASH_WORDS = 'nature landscape';

/**
 * The fields of one photo source, by kind: the one copy every surface
 * renders, under a slideshow's source select and inside a rotating
 * background's Sources rows alike. A kind with more than one way to name its
 * pictures (a library folder or chosen pictures; Immich filters or picked
 * photos; Unsplash words, collections or picked photos) shows a mode switch.
 *
 * The mode is which list exists on the entry (`pictures`, `assetIds`,
 * `photoIds`, `collections`), so switching into a list mode adds an empty
 * list and keeps everything else, and switching out of one drops that list.
 * Dropping a list that holds something is asked about first: a mis-click on
 * the switch must not quietly throw away a dozen picks.
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

  /** True when the switch may go ahead: nothing to lose, or the person said so. */
  const mayForget = async (what: 'pictures' | 'collections', count: number, modeLabel: string): Promise<boolean> => {
    if (count === 0) return true;
    return useConfirmStore.getState().confirm({
      title: t('photoSources.modes.forget.title'),
      message: t(`photoSources.modes.forget.${what}`, { count, mode: modeLabel }),
      confirmLabel: t('photoSources.modes.forget.confirm'),
      variant: 'danger',
    });
  };

  switch (source.kind) {
    case 'library': {
      const mode = source.pictures ? 'pictures' : 'folder';
      const switchTo = async (next: string) => {
        if (next === 'pictures') {
          onChange({ ...source, pictures: [] });
          return;
        }
        if (!(await mayForget('pictures', source.pictures?.length ?? 0, t('photoSources.modes.folder')))) return;
        const { pictures: _dropped, ...folderOnly } = source;
        onChange(folderOnly);
      };
      return (
        <>
          <SourceModeToggle
            testIdPrefix="library-mode"
            value={mode}
            onChange={(next) => void switchTo(next)}
            options={[
              { id: 'folder', label: t('photoSources.modes.folder') },
              { id: 'pictures', label: t('photoSources.modes.pictures') },
            ]}
          />
          {mode === 'pictures'
            ? <LibraryPicturesFields pictures={source.pictures ?? []} initialDirectory={source.folder} use={use} onChange={(pictures) => onChange({ ...source, pictures })} />
            : <LibraryFolderFields source={source as Library} onChange={onChange} use={use} />}
        </>
      );
    }
    case 'immich': {
      const mode = source.assetIds ? 'pictures' : 'filters';
      const { assetIds, ...filters } = source;
      const switchTo = async (next: string) => {
        if (next === 'pictures') {
          onChange({ ...source, assetIds: [] });
          return;
        }
        if (!(await mayForget('pictures', assetIds?.length ?? 0, t('photoSources.modes.filters')))) return;
        onChange(filters);
      };
      return (
        <>
          <SourceModeToggle
            testIdPrefix="immich-mode"
            value={mode}
            onChange={(next) => void switchTo(next)}
            options={[
              { id: 'filters', label: t('photoSources.modes.filters') },
              { id: 'pictures', label: t('photoSources.modes.pictures') },
            ]}
          />
          {mode === 'pictures'
            ? <PickedPicturesFields kind="immich" ids={assetIds ?? []} onChange={(next) => onChange({ ...source, assetIds: next })} />
            : <ImmichSourceFields source={filters as Immich} onChange={onChange} />}
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
      const { photoIds, collections, ...words } = source;
      const switchTo = async (next: string) => {
        if (next === 'pictures') {
          onChange({ ...source, photoIds: [] });
          return;
        }
        if (next === 'collections') {
          if (!(await mayForget('pictures', photoIds?.length ?? 0, t('photoSources.modes.collections')))) return;
          onChange({ ...words, collections: collections ?? [] });
          return;
        }
        // Words: the picks go, and the collections with them (a collections
        // list that stayed would be the mode).
        const forgetting = photoIds?.length ? 'pictures' as const : 'collections' as const;
        const losing = forgetting === 'pictures' ? photoIds!.length : collections?.length ?? 0;
        if (!(await mayForget(forgetting, losing, t('photoSources.modes.words')))) return;
        onChange({ ...words, query: words.query || DEFAULT_UNSPLASH_WORDS });
      };
      return (
        <>
          <SourceModeToggle
            testIdPrefix="unsplash-mode"
            value={mode}
            onChange={(next) => void switchTo(next)}
            options={[
              { id: 'words', label: t('photoSources.modes.words') },
              { id: 'collections', label: t('photoSources.modes.collections') },
              { id: 'pictures', label: t('photoSources.modes.pictures') },
            ]}
          />
          {mode === 'pictures' && (
            <PickedPicturesFields kind="unsplash" ids={photoIds ?? []} onChange={(next) => onChange({ ...source, photoIds: next })} />
          )}
          {mode === 'collections' && (
            <UnsplashCollectionsFields collections={collections ?? []} ready={ready} onChange={(next) => onChange({ ...source, collections: next })} />
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
  const { data, failure, loading } = useEditorData<MediaListItem[]>(previewUrl);
  // Words that bring nothing must not look like words that work: the wall
  // would simply never change. Said once the search for these words is back.
  const answered = previewUrl !== null && !loading && settled.trim() === source.query.trim();
  return (
    <>
      <LabeledInput
        label={t('photoSources.unsplash.searchWords')}
        value={source.query}
        placeholder={t('photoSources.unsplash.searchWordsPlaceholder')}
        onChange={(query) => onChange({ ...source, query })}
      />
      <p className="-mt-1 text-[10px] leading-relaxed text-hs-text-faint">{t(use === 'background' ? 'photoSources.unsplash.searchHelpBackground' : 'photoSources.unsplash.searchHelp')}</p>
      {answered && failure?.status === 429 && (
        <p className="text-[10px] leading-relaxed text-hs-warning" data-testid="unsplash-words-limit">{t('photoSources.unsplash.rateLimited')}</p>
      )}
      {answered && data !== null && data.length === 0 && !failure && (
        <p className="text-[10px] leading-relaxed text-hs-warning" data-testid="unsplash-words-empty">{t('photoSources.unsplash.empty')}</p>
      )}
      <PreviewStrip urls={(data ?? []).slice(0, 4).map((item) => item.url)} />
    </>
  );
}
