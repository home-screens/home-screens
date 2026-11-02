'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { libraryFileFromServeUrl } from '@/lib/library-client';
import { TILE_THUMBNAIL_WIDTH, pictureDisplayName, serveUrlFor } from '@/lib/media-paths';
import { STARTER_DAY_ART } from '@/lib/starter-day-art';
import { useTranslate } from '@/i18n';
import PicturePicker from './picture-picker/PicturePicker';

/**
 * A day-look rule's picture: what it is now, with Choose a picture and
 * Remove. Choosing opens the Image Library on the day art that ships with
 * Home Screens, or on the library's `calendar-art` folder when the rule holds
 * one of the household's own pictures; any tab works, so a picture from
 * Immich, Unsplash or NASA can be day art too. Stores a URL in
 * `CalendarDayRule.backgroundImage`.
 */

const KEY = 'configSections.calendarRules';
const CALENDAR_ART_DIR = 'calendar-art';

/** The small copy the serve route keeps for grids; a URL outside the library is used as is. */
function tileImage(url: string): string {
  const file = libraryFileFromServeUrl(url);
  return file ? serveUrlFor(file, { width: TILE_THUMBNAIL_WIDTH }) : url;
}

export default function DayArtPicker({ value, onChange }: {
  value: string | undefined;
  onChange: (url: string | undefined) => void;
}) {
  const t = useTranslate('editor');
  const [picking, setPicking] = useState(false);
  const starter = STARTER_DAY_ART.find((art) => art.path === value);
  const file = value ? libraryFileFromServeUrl(value) : null;
  const name = starter ? t(`${KEY}.artNames.${starter.id}`)
    : file ? pictureDisplayName(file)
      : value ?? '';

  return (
    <div className="flex flex-col gap-1.5" data-day-art-picker="">
      <span className="text-xs text-hs-text-muted">{t(`${KEY}.artPicture`)}</span>
      <div className="flex items-center gap-2">
        <span
          className="block h-10 w-14 shrink-0 rounded border border-hs-border-strong bg-hs-card bg-cover bg-center"
          style={value ? { backgroundImage: `url(${tileImage(value)})` } : undefined}
          data-current-art={value ? '' : undefined}
        />
        <span className="min-w-0 flex-1 truncate text-xs text-hs-text-body" data-testid="day-art-name">
          {value ? name : t(`${KEY}.artNone`)}
        </span>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" onClick={() => setPicking(true)} data-testid="day-art-choose">{t('photoSources.background.choose')}</Button>
        {value && <Button size="sm" onClick={() => onChange(undefined)} data-testid="day-art-remove">{t(`${KEY}.artRemove`)}</Button>}
      </div>
      {picking && (
        <PicturePicker
          mode="pick-image"
          builtIn="day-art"
          currentValue={value}
          initialDirectory={starter || !value ? CALENDAR_ART_DIR : undefined}
          localHint={t(`${KEY}.artUploadHint`)}
          onSelectImage={(url) => onChange(url)}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
