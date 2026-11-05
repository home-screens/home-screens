'use client';

import { useMemo } from 'react';
import LabeledInput from '@/components/ui/LabeledInput';
import { useEditorData } from '@/hooks/useEditorData';
import { detectICloudSource } from '@/lib/icloud-parse';
import { ICloudLinkImportBridge, ICLOUD_IMPORT_FOLDER } from '@/components/editor/config-sections/ICloudLinkImportBridge';
import { PHOTO_SOURCE_MEDIA_PATH, photoSourceParams } from '@/lib/photo-source';
import type { MediaListItem, PhotoSource, SlideshowMediaTypes } from '@/types/config';
import { useTranslate } from '@/i18n';

type ICloudSource = Extract<PhotoSource, { kind: 'icloud' }>;

interface Props {
  source: ICloudSource;
  /** What the slideshow plays, for the video hint; unset for a rotating background. */
  mediaTypes?: SlideshowMediaTypes;
  /** A new source: the edited link, or the library folder a photo link was saved into. */
  onChange: (source: PhotoSource) => void;
}

/**
 * iCloud's part of the photo source fields (slideshows and rotating backgrounds).
 * No API key needed: the album's public share link is the whole setup. The
 * preview strip doubles as validation: a pasted link either shows photos or
 * the "check the link" hint.
 *
 * Wrong-link bridge: Apple has TWO near-identical link products, and users
 * can't be expected to know the difference. A pasted iCloud Link
 * (share.icloud.com: expires ~30 days, unusable as a live source) offers a
 * one-click import into the library and then flips this module to the local
 * folder, so pasting either link kind ends in a working slideshow.
 */
export function ICloudSourceFields({ source, mediaTypes = 'photos', onChange }: Props) {
  const t = useTranslate('editor');
  const albumUrl = source.albumUrl;

  // Same detection the server uses, so the paste-time hint can never disagree
  // with what the import/list endpoints would do.
  const linkKind = detectICloudSource(albumUrl);

  const previewUrl = linkKind === 'album'
    ? `${PHOTO_SOURCE_MEDIA_PATH}?${photoSourceParams(source)}&count=4`
    : null;
  // A cold preview reads the whole album from Apple, 25 photos per call.
  const { data: previewData, loading: checking, error: unreadable } = useEditorData<MediaListItem[]>(previewUrl, null);
  const previewImages = useMemo(() => (previewData ?? []).map((item) => item.url), [previewData]);

  return (
    <div className="space-y-2">
      <LabeledInput
        label={t('photoSources.icloud.albumLink')}
        type="url"
        value={albumUrl}
        placeholder="https://www.icloud.com/sharedalbum/#..."
        onChange={(v) => onChange({ kind: 'icloud', albumUrl: v })}
      />
      <p className="text-[10px] text-hs-text-faint leading-relaxed">
        {t('photoSources.icloud.albumHelp')}
      </p>

      {/* Wrong-link bridge: a photo link can't play live, but it CAN be
          saved: offer that instead of failing silently. */}
      {linkKind === 'link' && (
        <ICloudLinkImportBridge
          url={albumUrl}
          introKey="photoSources.icloud.photoLinkDetected"
          noItemsKey="photoSources.icloud.noItemsFound"
          savedSomething={(job) => job.done + job.skipped > 0}
          onSaved={(job) => {
            if (job.done + job.skipped > 0) {
              // Flip to the imported folder: the library folder fields with
              // their populated preview strip are the success state.
              onChange({ kind: 'library', folder: ICLOUD_IMPORT_FOLDER });
            }
          }}
        />
      )}

      {linkKind === 'album' && checking && (
        <p className="text-[10px] text-hs-text-faint" data-testid="icloud-checking">{t('photoSources.icloud.checking')}</p>
      )}

      {/* A link that leads nowhere (sharing turned off, the album deleted)
          can take Apple a while to refuse; say so once it does. */}
      {linkKind === 'album' && !checking && unreadable && (
        <p className="text-[10px] text-hs-warning">{t('photoSources.icloud.noItemsFound')}</p>
      )}

      {linkKind === 'album' && previewData !== null && previewImages.length > 0 && (
        <p className="text-[10px] text-hs-success">{t('photoSources.icloud.linkOk')}</p>
      )}
      {linkKind === 'album' && previewData !== null && (
        previewImages.length > 0 ? (
          <div className="flex gap-1 mt-1 overflow-x-auto">
            {previewImages.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                loading="lazy"
                className="w-12 h-12 rounded object-cover flex-shrink-0 border border-hs-border-strong"
              />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-hs-warning">
            {t('photoSources.icloud.noItemsFound')}
          </p>
        )
      )}

      {mediaTypes !== 'photos' && (
        <p className="text-[10px] text-hs-text-faint leading-relaxed">
          {t('photoSources.icloud.videoHint')}
        </p>
      )}
    </div>
  );
}
