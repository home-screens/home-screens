'use client';

import LabeledSelect from '@/components/ui/LabeledSelect';
import { useImageLibrary } from '@/hooks/useImageLibrary';
import { libraryFileFromServeUrl } from '@/lib/library-client';
import { serveUrlFor, tileThumbnailUrl, pictureDisplayName } from '@/lib/media-paths';
import { MAX_PICKED_PICTURES, type PhotoSourceUse } from '@/lib/photo-source';
import { useTranslate } from '@/i18n';
import { PickGrid, PickTile } from '@/components/editor/PickTile';
import PickedStrip from './PickedStrip';
import FieldHint from '@/components/ui/FieldHint';

/**
 * Pictures chosen one by one from the media library, as a source: every
 * folder is offered, the pictures in the one being looked at are tiles, and
 * a tick marks the chosen ones. Every pick, from whichever folder, is also
 * listed above the grid. The picks are library paths, shown where they are,
 * never copied.
 */
export default function LibraryPicturesFields({ pictures, initialDirectory = '', use, onChange }: {
  pictures: string[];
  /** A background shows stills only, so a folder of videos gets its own words there. */
  use: PhotoSourceUse;
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
          { value: '', label: t('settings.mediaPage.topLevel') },
          ...library.directories.filter((dir) => dir.path !== '').map((dir) => ({ value: dir.path, label: dir.path })),
        ]}
        hint={<>{pictures.length === 0 ? t('photoSources.picked.none') : t('photoSources.picked.count', { count: pictures.length })}{' '}{t('photoSources.picked.help')}</>}
      />
      <PickedStrip
        items={pictures.map((path) => ({ id: path, thumb: tileThumbnailUrl(serveUrlFor(path)), name: pictureDisplayName(path) }))}
        onRemove={toggle}
      />
      {library.loadingImages ? (
        <FieldHint className="py-4 text-center">{t('photoSources.picked.loading')}</FieldHint>
      ) : tiles.length === 0 ? (
        <FieldHint data-testid="library-pictures-empty">
          {t(use === 'background' && library.items.some((item) => item.type === 'video') ? 'photoSources.library.onlyVideos' : 'photoSources.library.empty')}
        </FieldHint>
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
