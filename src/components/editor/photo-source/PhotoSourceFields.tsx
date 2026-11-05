'use client';

import LabeledSelect from '@/components/ui/LabeledSelect';
import Slider from '@/components/ui/Slider';
import { useSecretStatus } from '@/hooks/useSecretStatus';
import { useTranslate } from '@/i18n';
import {
  canPlayVideo,
  clampPhotoCount,
  defaultPhotoSource,
  isReady,
  maxPhotoCount,
  needs,
  normalizePhotoSource,
  offeredFor,
  usesCount,
  type PhotoSourceKind,
} from '@/lib/photo-source';
import type { PhotoSource, SlideshowMediaTypes } from '@/types/config';
import { MediaTypesFields } from '@/components/editor/config-sections/MediaTypesFields';
import PhotoSourceEntryFields from './PhotoSourceEntryFields';

/** What the source block writes back: any of these fields, merged into the owner's config. */
export interface PhotoSourcePatch {
  photoSource?: PhotoSource;
  count?: number;
  mediaTypes?: SlideshowMediaTypes;
  maxVideoDurationMs?: number;
}

/**
 * The one block that says where a stream of pictures comes from, used by
 * Photo Slideshow and Full-screen Photo, so both offer the same sources with
 * the same filters (a rotating background lists the same kinds as rows).
 * Every source is always listed; one that still needs a key says so in the
 * list and under it. What it needs, whether it plays video and whether it
 * has a per-refresh count all come from the rules in `photo-source.ts`.
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
  // Walls are picked as tiles in a background's Sources list, never from a select.
  const kinds = offeredFor(use).filter((kind) => kind !== 'wall');
  const count = clampPhotoCount(value.count, source.kind);
  const setSource = (photoSource: PhotoSource) => onChange({ photoSource });

  const optionLabel = (kind: PhotoSourceKind) => {
    const name = t(`photoSources.kinds.${kind}`);
    if (isReady(kind, status, use)) return name;
    // A free key (Unsplash) or a server or sign-in to set up (Immich, OneDrive).
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

      <PhotoSourceEntryFields use={use} source={source} count={count} mediaTypes={value.mediaTypes} onChange={setSource} />

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
