'use client';

import { useTranslate } from '@/i18n';
import type { MediaListItem } from '@/types/config';
import type { PictureBox } from '@/lib/media-paths';

/**
 * "Photo by <name> on Unsplash" in a corner of the slide that is showing,
 * for sources that ask to be credited on screen (Unsplash's API guidelines
 * do). Light text with a soft shadow, sized to the module, never taking
 * taps. Nothing renders for a picture without a credit.
 */
export default function PhotoCredit({ item, box, corner = 'bottom' }: {
  item: MediaListItem | null | undefined;
  box?: PictureBox;
  /** `top` keeps clear of an overlay along the bottom (Full-screen Photo's clock). */
  corner?: 'top' | 'bottom';
}) {
  const t = useTranslate('modules');
  if (!item?.credit) return null;
  const fontSize = box ? Math.max(10, Math.round(Math.min(box.w, box.h) * 0.022)) : 12;
  return (
    <div
      data-testid="photo-credit"
      className="pointer-events-none absolute right-0 z-10 truncate"
      style={{
        [corner]: 0,
        maxWidth: '70%',
        padding: `${Math.round(fontSize * 0.6)}px ${Math.round(fontSize * 0.9)}px`,
        fontSize,
        color: 'rgba(255,255,255,0.85)',
        textShadow: '0 1px 3px rgba(0,0,0,0.7)',
      }}
    >
      {t('photo-slideshow.photoCredit', { name: item.credit.name, source: item.credit.source })}
    </div>
  );
}
