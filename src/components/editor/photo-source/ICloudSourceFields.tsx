'use client';

import { useEffect, useMemo, useState } from 'react';
import LabeledInput from '@/components/ui/LabeledInput';
import { useEditorData } from '@/hooks/useEditorData';
import { detectICloudSource } from '@/lib/icloud-parse';
import { ICloudLinkImportBridge, ICLOUD_IMPORT_FOLDER } from '@/components/editor/config-sections/ICloudLinkImportBridge';
import { PHOTO_SOURCE_MEDIA_PATH, photoSourceParams } from '@/lib/photo-source';
import type { MediaListItem, PhotoSource, SlideshowMediaTypes } from '@/types/config';
import { useTranslate } from '@/i18n';

type ICloudSource = Extract<PhotoSource, { kind: 'icloud' }>;

/** How long "Checking the album..." stands before it says a big album takes a while. */
const SLOW_CHECK_MS = 8_000;

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
 * preview strip doubles as validation: a pasted link shows photos, the
 * "check the link" hint when the album read as empty, or "iCloud didn't
 * answer" with a Try again when the hub could not read it at all.
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
  const [draft, setDraft] = useState(albumUrl);
  useEffect(() => { setDraft(albumUrl); }, [albumUrl]);
  const commit = () => { if (draft.trim() !== albumUrl) onChange({ kind: 'icloud', albumUrl: draft.trim() }); };

  // Same detection the server uses, so the paste-time hint can never disagree
  // with what the import/list endpoints would do.
  const linkKind = detectICloudSource(albumUrl);

  const previewUrl = linkKind === 'album'
    ? `${PHOTO_SOURCE_MEDIA_PATH}?${photoSourceParams(source)}&count=4`
    : null;
  // No time limit: the first read of an album waits for Apple, which can take
  // most of a minute over a big one.
  const { data: previewData, loading: checking, error: noAnswer, refetch } = useEditorData<MediaListItem[]>(previewUrl, null);
  const previewImages = useMemo(() => (previewData ?? []).map((item) => item.url), [previewData]);

  // Say the wait is expected before it starts to look stuck.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!checking) return;
    const timer = setTimeout(() => setSlow(true), SLOW_CHECK_MS);
    return () => clearTimeout(timer);
  }, [checking, previewUrl]);

  // What the last read that worked found. A failed read keeps the answer
  // before it, which may be another link's, so it is not shown beside one.
  const answered = previewData !== null && !noAnswer;

  return (
    <div className="space-y-2">
      {/* The link is saved once typing is done (blur, Enter or a paste), not
          on every keystroke: a half-typed link is not a source yet. */}
      <form onSubmit={(e) => { e.preventDefault(); commit(); }}>
        <LabeledInput
          label={t('photoSources.icloud.albumLink')}
          type="url"
          value={draft}
          placeholder="https://www.icloud.com/sharedalbum/#..."
          onChange={setDraft}
          onBlur={commit}
          onPaste={(e) => { const pasted = e.clipboardData.getData('text').trim(); if (pasted) { e.preventDefault(); setDraft(pasted); onChange({ kind: 'icloud', albumUrl: pasted }); } }}
        />
      </form>
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
        <p className="text-[10px] text-hs-text-faint" data-testid="icloud-checking">
          {t(slow ? 'photoSources.icloud.checkingSlow' : 'photoSources.icloud.checking')}
        </p>
      )}

      {/* The hub could not read the album: iCloud was slow, busy or out of
          reach. That says nothing about the link, so it is not blamed; the
          "check the link" hint below is for an album that read as empty. */}
      {linkKind === 'album' && !checking && noAnswer && (
        <p className="text-[10px] text-hs-warning" data-testid="icloud-no-answer">
          {t('photoSources.icloud.noAnswer')}{' '}
          <button type="button" onClick={refetch} className="text-hs-accent hover:text-hs-accent-hover">
            {t('photoSources.icloud.tryAgain')}
          </button>
        </p>
      )}

      {linkKind === 'album' && answered && previewImages.length > 0 && (
        <p className="text-[10px] text-hs-success">{t('photoSources.icloud.linkOk')}</p>
      )}
      {linkKind === 'album' && answered && (
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
