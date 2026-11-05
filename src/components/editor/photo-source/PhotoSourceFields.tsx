'use client';

import { useEffect, useState } from 'react';
import LabeledInput from '@/components/ui/LabeledInput';
import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import { useEditorData } from '@/hooks/useEditorData';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';
import {
  PHOTO_SOURCE_MEDIA_PATH,
  canPlayVideo,
  clampPhotoCount,
  defaultPhotoSource,
  isReady,
  maxPhotoCount,
  needs,
  normalizePhotoSource,
  offeredFor,
  photoSourceParams,
  usesCount,
  type PhotoSourceKind,
} from '@/lib/photo-source';
import type { MediaListItem, PhotoSource, SlideshowMediaTypes } from '@/types/config';
import { MediaTypesFields } from '@/components/editor/config-sections/MediaTypesFields';
import { ImmichSourceFields } from './ImmichSourceFields';
import { ICloudSourceFields } from './ICloudSourceFields';
import { OneDriveSourceFields } from './OneDriveSourceFields';
import { LibraryFolderFields } from './LibraryFolderFields';
import PreviewStrip from './PreviewStrip';

/** What the source block writes back: any of these fields, merged into the owner's config. */
export interface PhotoSourcePatch {
  photoSource?: PhotoSource;
  count?: number;
  mediaTypes?: SlideshowMediaTypes;
  maxVideoDurationMs?: number;
}

/**
 * The one block that says where a stream of pictures comes from, used by
 * Photo Slideshow, Full-screen Photo and a screen's rotating background, so
 * all three offer the same sources with the same filters. Every source is
 * always listed; one that still needs a key says so in the list and under
 * it. What it needs, whether it plays video and whether it has a per-refresh
 * count all come from the rules in `photo-source.ts`.
 *
 * Slide timing, transition and fit are the module's own display settings
 * and stay in each module's section.
 */
export default function PhotoSourceFields({ use, value, onChange }: {
  /** `stream` for a slideshow; `background` never offers video or a count. */
  use: 'stream' | 'background';
  value: { photoSource?: unknown; count?: number; mediaTypes?: SlideshowMediaTypes; maxVideoDurationMs?: number };
  onChange: (patch: PhotoSourcePatch) => void;
}) {
  const t = useTranslate('editor');
  const { status } = useSecretStatus();
  const source = normalizePhotoSource(value.photoSource) ?? defaultPhotoSource('library');
  const kinds = offeredFor(use);
  const count = clampPhotoCount(value.count, source.kind);
  const setSource = (photoSource: PhotoSource) => onChange({ photoSource });

  const optionLabel = (kind: PhotoSourceKind) => {
    const name = t(`photoSources.kinds.${kind}`);
    if (isReady(kind, status, use)) return name;
    // A free key (Unsplash, NASA) or a server or sign-in to set up (Immich, OneDrive).
    const note = needs(kind).signIn || kind === 'immich' ? t('photoSources.needsSettingUp') : t('photoSources.needsFreeKey');
    return `${name} (${note})`;
  };

  return (
    <>
      <LabeledSelect
        label={t('photoSources.sourceLabel')}
        value={source.kind}
        onChange={(kind) => setSource(defaultPhotoSource(kind))}
        options={kinds.map((kind) => ({ value: kind, label: optionLabel(kind) }))}
      />
      {!isReady(source.kind, status, use) && (
        <p className="-mt-1 text-[10px] leading-relaxed text-hs-warning" data-testid="photo-source-key-missing">
          {t(use === 'background' ? 'photoSources.keyMissingBackground' : 'photoSources.keyMissing')}
        </p>
      )}

      {source.kind === 'library' && (
        <LibraryFolderFields source={source} onChange={setSource} withGoogleImport={use === 'stream'} />
      )}
      {source.kind === 'immich' && <ImmichSourceFields source={source} onChange={setSource} />}
      {source.kind === 'icloud' && (
        <ICloudSourceFields source={source} mediaTypes={use === 'stream' ? value.mediaTypes : undefined} onChange={setSource} />
      )}
      {source.kind === 'onedrive' && <OneDriveSourceFields source={source} count={count} onChange={setSource} />}
      {source.kind === 'unsplash' && <UnsplashSourceFields source={source} count={count} ready={isReady('unsplash', status)} use={use} onChange={setSource} />}
      {source.kind === 'nasa' && (
        <p className="text-[10px] leading-relaxed text-hs-text-faint">
          {t(use === 'background' ? 'photoSources.nasa.backgroundInfo' : 'photoSources.nasa.streamInfo')}
        </p>
      )}

      {use === 'stream' && canPlayVideo(source.kind) && (
        <MediaTypesFields config={value as Record<string, unknown>} set={onChange} />
      )}

      {use === 'stream' && usesCount(source.kind) && (
        <Slider
          label={t('photoSources.photosPerRefresh')}
          value={count}
          min={5}
          max={maxPhotoCount(source.kind)}
          step={5}
          onChange={(v) => onChange({ count: v })}
        />
      )}
    </>
  );
}

/** Search words for Unsplash, with a peek at what they bring once a key is saved. */
function UnsplashSourceFields({ source, count, ready, use, onChange }: {
  source: Extract<PhotoSource, { kind: 'unsplash' }>;
  count: number;
  ready: boolean;
  use: 'stream' | 'background';
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
