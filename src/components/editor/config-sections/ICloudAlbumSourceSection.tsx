'use client';

import { useMemo } from 'react';
import LabeledInput from '@/components/ui/LabeledInput';
import { useEditorData } from '@/hooks/useEditorData';
import { detectICloudSource } from '@/lib/icloud-parse';
import { ICloudLinkImportBridge, ICLOUD_IMPORT_FOLDER } from './ICloudLinkImportBridge';
import { useTranslate } from '@/i18n';

interface Props {
  config: Record<string, unknown>;
  set: (updates: Record<string, unknown>) => void;
}

/**
 * Shared iCloud Shared Album source controls for the two slideshow modules.
 * No API key needed — the album's public share link is the whole setup. The
 * preview strip doubles as validation: a pasted link either shows photos or
 * the "check the link" hint.
 *
 * Wrong-link bridge: Apple has TWO near-identical link products, and users
 * can't be expected to know the difference. A pasted iCloud Link
 * (share.icloud.com — expires ~30 days, unusable as a live source) offers a
 * one-click import into the library and then flips this module to the local
 * folder, so pasting either link kind ends in a working slideshow.
 */
export function ICloudAlbumSourceSection({ config, set }: Props) {
  const t = useTranslate('editor');
  const albumUrl = (config.icloudAlbumUrl as string) || '';
  const mediaTypes = (config.mediaTypes as string) || 'photos';

  // Same detection the server uses, so the paste-time hint can never disagree
  // with what the import/list endpoints would do.
  const linkKind = detectICloudSource(albumUrl);

  const previewUrl = linkKind === 'album'
    ? `/api/icloud/photos?album=${encodeURIComponent(albumUrl)}&count=4`
    : null;
  const { data: previewData } = useEditorData<string[]>(previewUrl);
  const previewImages = useMemo(() => previewData ?? [], [previewData]);

  return (
    <div className="space-y-2">
      <LabeledInput
        label={t('configSections.icloudSource.albumLink')}
        type="url"
        value={albumUrl}
        placeholder="https://www.icloud.com/sharedalbum/#..."
        onChange={(v) => set({ icloudAlbumUrl: v || undefined })}
      />
      <p className="text-[10px] text-hs-text-faint leading-relaxed">
        {t('configSections.icloudSource.albumHelp')}
      </p>

      {/* Wrong-link bridge: a photo link can't play live, but it CAN be
          saved — offer that instead of failing silently. */}
      {linkKind === 'link' && (
        <ICloudLinkImportBridge
          url={albumUrl}
          introKey="configSections.icloudSource.photoLinkDetected"
          noItemsKey="configSections.icloudSource.noItemsFound"
          savedSomething={(job) => job.done + job.skipped > 0}
          onSaved={(job) => {
            if (job.done + job.skipped > 0) {
              // Flip the module to the imported folder — the local folder UI
              // with its populated preview strip is the success state.
              set({ source: 'local', directory: ICLOUD_IMPORT_FOLDER, icloudAlbumUrl: undefined });
            }
          }}
        />
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
            {t('configSections.icloudSource.noItemsFound')}
          </p>
        )
      )}

      {mediaTypes !== 'photos' && (
        <p className="text-[10px] text-hs-text-faint leading-relaxed">
          {t('configSections.icloudSource.videoHint')}
        </p>
      )}
    </div>
  );
}
