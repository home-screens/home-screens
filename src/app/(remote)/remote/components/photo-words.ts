'use client';

import { useMemo } from 'react';
import { formatList, useLocale, useTranslate } from '@/i18n';

export type PhotoKind = 'image' | 'video';

/**
 * The phrases the Photos tab builds from counts and names, kept in one place
 * so the grid, the viewer and the sheets say "3 photos" and "Kitchen and
 * Hallway" the same way.
 */
export function usePhotoWords() {
  const t = useTranslate('remote');
  const locale = useLocale();
  return useMemo(() => {
    return {
      /** "3 photos", "1 video", "4 photos and videos": what a batch holds. */
      what(kinds: readonly PhotoKind[], count: number): string {
        const images = kinds.includes('image');
        const videos = kinds.includes('video');
        const key = images && videos ? 'mixed' : videos ? 'videos' : 'photos';
        return t(`photosTab.what.${key}`, { count });
      },
      /** "48 photos and 2 videos", "1 photo", "Empty": what a folder holds. */
      contents(images: number, videos: number): string {
        if (images === 0 && videos === 0) return t('photosTab.empty');
        if (videos === 0) return t('photosTab.what.photos', { count: images });
        if (images === 0) return t('photosTab.what.videos', { count: videos });
        return t('photosTab.photosAndVideos', {
          photos: t('photosTab.what.photos', { count: images }),
          videos: t('photosTab.what.videos', { count: videos }),
        });
      },
      /** "Kitchen", "Kitchen and Hallway". */
      names(names: readonly string[]): string {
        return formatList(names, locale);
      },
    };
  }, [t, locale]);
}
