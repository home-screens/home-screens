'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { useEditorData } from '@/hooks/useEditorData';
import { PHOTO_SOURCE_MEDIA_PATH, photoSourceParams, type PhotoSourceUse } from '@/lib/photo-source';
import { useTranslate } from '@/i18n';
import PicturePicker from '@/components/editor/picture-picker/PicturePicker';
import { GooglePhotosImportSection } from '@/components/editor/config-sections/GooglePhotosImportSection';
import type { MediaListItem, PhotoSource } from '@/types/config';
import PreviewStrip from './PreviewStrip';

type LibrarySource = Extract<PhotoSource, { kind: 'library' }>;

/**
 * A library folder as a source: the folder with Browse, how many pictures
 * it holds and the first few of them. A slideshow also gets the Google
 * Photos import, which fills a folder and points the slideshow at it. A
 * background shows stills only, so a folder that holds nothing but videos
 * says that instead of reading as empty.
 */
export function LibraryFolderFields({ source, onChange, use }: {
  source: LibrarySource;
  onChange: (source: LibrarySource) => void;
  use: PhotoSourceUse;
}) {
  const t = useTranslate('editor');
  const [browsing, setBrowsing] = useState(false);
  // The same list the wall plays (pictures only), so the count is the wall's.
  const { data, refetch } = useEditorData<MediaListItem[]>(`${PHOTO_SOURCE_MEDIA_PATH}?${photoSourceParams(source)}`);
  const pictures = data ?? [];
  const folderName = source.folder || t('photoSources.library.topLevel');
  // Asked only for a background's folder with no pictures in it: is it empty, or all videos?
  const { data: videos } = useEditorData<MediaListItem[]>(
    use === 'background' && data !== null && pictures.length === 0 ? `${PHOTO_SOURCE_MEDIA_PATH}?${photoSourceParams(source)}&media=videos` : null,
  );

  return (
    <>
      <div>
        <span className="text-xs text-hs-text-muted">{t('photoSources.library.folder')}</span>
        {/* Wraps: a long Browse label (German) drops under the folder instead of squeezing its name away. */}
        <div className="flex flex-wrap gap-1.5 mt-1">
          <div className="min-w-[9rem] flex-1 px-2 py-1 text-xs bg-hs-card border border-hs-border-strong rounded text-hs-text-secondary truncate" title={folderName} data-testid="photo-source-folder">
            {folderName}
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
          <p className="text-[10px] text-hs-text-faint mt-1" data-testid="photo-source-folder-empty">
            {t(videos && videos.length > 0 ? 'photoSources.library.onlyVideos' : 'photoSources.library.empty')}
          </p>
        ))}
      </div>

      {use === 'stream' && (
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
