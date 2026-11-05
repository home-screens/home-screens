'use client';

import LabeledSelect from '@/components/ui/LabeledSelect';
import { useImageLibrary } from '@/hooks/useImageLibrary';
import { libraryFileFromServeUrl } from '@/lib/library-client';
import { tileThumbnailUrl, pictureDisplayName } from '@/lib/media-paths';
import { MAX_PICKED_PICTURES } from '@/lib/photo-source';
import { useTranslate } from '@/i18n';
import { PickGrid, PickTile } from '@/components/editor/PickTile';

/**
 * Pictures chosen one by one from the media library, as a source: every
 * folder is offered, the pictures in the one being looked at are tiles, and
 * a tick marks the chosen ones. The picks are library paths, shown where
 * they are, never copied.
 */
export default function LibraryPicturesFields({ pictures, initialDirectory = '', onChange }: {
  pictures: string[];
  /** The folder to start looking in: the source's own folder, so Folder mode's choice stays in view. */
  initialDirectory?: string;
  onChange: (pictures: string[]) => void;
}) {
  const t = useTranslate('editor');
  const library = useImageLibrary({ initialDirectory });
  const chosen = new Set(pictures);
  const full = pictures.length >= MAX_PICKED_PICTURES;
  const toggle = (path: string) => {
    if (chosen.has(path)) onChange(pictures.filter((p) => p !== path));
    else if (!full) onChange([...pictures, path]);
  };
  const tiles = library.items
    .filter((item) => item.type === 'image')
    .map((item) => ({ url: item.url, path: libraryFileFromServeUrl(item.url) }))
    .filter((tile): tile is { url: string; path: string } => tile.path !== null);

  return (
    <div className="space-y-2" data-testid="library-picked-pictures">
      <LabeledSelect
        label={t('photoSources.library.folder')}
        value={library.selectedDir}
        onChange={library.setSelectedDir}
        options={[
          { value: '', label: t('photoSources.library.topLevel') },
          ...library.directories.filter((dir) => dir.path !== '').map((dir) => ({ value: dir.path, label: dir.path })),
        ]}
      />
      <p className="text-[10px] leading-relaxed text-hs-text-faint">
        {pictures.length === 0 ? t('photoSources.picked.none') : t('photoSources.picked.count', { count: pictures.length })}
        {' '}{t('photoSources.picked.help')}
      </p>
      {library.loadingImages ? (
        <p className="py-4 text-center text-xs text-hs-text-faint">{t('photoSources.picked.loading')}</p>
      ) : tiles.length === 0 ? (
        <p className="text-[10px] text-hs-text-faint">{t('photoSources.library.empty')}</p>
      ) : (
        <PickGrid scroll columns={3}>
          {tiles.map((tile) => (
            <PickTile
              key={tile.path}
              thumb={tileThumbnailUrl(tile.url)}
              alt={pictureDisplayName(tile.path)}
              label={pictureDisplayName(tile.path)}
              square
              chosen={chosen.has(tile.path)}
              disabled={full && !chosen.has(tile.path)}
              onClick={() => toggle(tile.path)}
              ariaLabel={t(chosen.has(tile.path) ? 'photoSources.picked.takeOut' : 'photoSources.picked.add', { name: pictureDisplayName(tile.path) })}
              testId={`library-pick-${tile.path}`}
            />
          ))}
        </PickGrid>
      )}
    </div>
  );
}
