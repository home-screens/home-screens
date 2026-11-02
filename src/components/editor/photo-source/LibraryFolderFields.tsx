'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { useEditorData } from '@/hooks/useEditorData';
import { PHOTO_SOURCE_MEDIA_PATH, photoSourceParams } from '@/lib/photo-source';
import { useTranslate } from '@/i18n';
import PicturePicker from '@/components/editor/picture-picker/PicturePicker';
import { GooglePhotosImportSection } from '@/components/editor/config-sections/GooglePhotosImportSection';
import type { MediaListItem, PhotoSource } from '@/types/config';
import PreviewStrip from './PreviewStrip';

type LibrarySource = Extract<PhotoSource, { kind: 'library' }>;

/**
 * A library folder as a source: the folder with Browse, how many pictures
 * it holds and the first few of them. A slideshow also gets the Google
 * Photos import, which fills a folder and points the slideshow at it.
 */
export function LibraryFolderFields({ source, onChange, withGoogleImport }: {
  source: LibrarySource;
  onChange: (source: LibrarySource) => void;
  withGoogleImport: boolean;
}) {
  const t = useTranslate('editor');
  const [browsing, setBrowsing] = useState(false);
  // The same list the wall plays (pictures only), so the count is the wall's.
  const { data, refetch } = useEditorData<MediaListItem[]>(`${PHOTO_SOURCE_MEDIA_PATH}?${photoSourceParams(source)}`);
  const pictures = data ?? [];

  return (
    <>
      <div>
        <span className="text-xs text-hs-text-muted">{t('photoSources.library.folder')}</span>
        <div className="flex gap-1.5 mt-1">
          <div className="flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate" data-testid="photo-source-folder">
            {source.folder || t('photoSources.library.topLevel')}
          </div>
          <Button size="sm" onClick={() => setBrowsing(true)}>
            {t('photoSources.library.browse')}
          </Button>
        </div>
        {data !== null && (pictures.length > 0 ? (
          <div className="mt-1.5">
            <span className="text-[10px] text-hs-text-faint">{t('photoSources.library.photoCount', { count: pictures.length })}</span>
            <PreviewStrip urls={pictures.slice(0, 4).map((item) => item.url)} />
          </div>
        ) : (
          <p className="text-[10px] text-hs-text-faint mt-1">{t('photoSources.library.empty')}</p>
        ))}
      </div>

      {withGoogleImport && (
        <GooglePhotosImportSection
          onImported={(folder) => {
            onChange({ kind: 'library', folder });
            refetch();
          }}
        />
      )}

      {browsing && (
        <PicturePicker
          mode="manage-directory"
          initialDirectory={source.folder}
          onSelectDirectory={(folder) => {
            onChange({ kind: 'library', folder });
            refetch();
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </>
  );
}
