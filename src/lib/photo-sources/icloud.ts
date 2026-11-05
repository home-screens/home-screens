import { fetchWithTimeout } from '@/lib/api-utils';
import { fetchICloudMedia } from '@/lib/icloud-media';
import { shuffleArray } from '@/lib/shuffle';
import type { MediaListItem } from '@/types/config';
import type { PhotoSourceAdapter } from './types';

/**
 * A public iCloud shared album. Asset URLs are Apple-signed and public, so
 * the wall loads them straight from Apple's CDN: no media tokens, no
 * streaming proxy, two small JSON calls per album refresh (cached 5 minutes
 * per album in the iCloud readers). A missing or malformed link is an empty
 * album; the wall's empty state says to check the link.
 */
export const icloudPhotoSource: PhotoSourceAdapter<'icloud'> = {
  kind: 'icloud',

  async list({ source, count, media }) {
    const all = await fetchICloudMedia(source.albumUrl);
    const wanted = media === 'both' ? all : all.filter((item) => (media === 'videos' ? item.type === 'video' : item.type === 'image'));
    // Shuffled per request so refreshes vary without asking Apple again.
    // Mapped field by field so internal fields (guid) never reach the wall.
    return shuffleArray(wanted).slice(0, count).map((item): MediaListItem => ({
      url: item.url,
      type: item.type,
      ...(item.posterUrl ? { posterUrl: item.posterUrl } : {}),
    }));
  },

  async pickOne({ source }) {
    // A background is a still picture; a video can't be one.
    const images = (await fetchICloudMedia(source.albumUrl)).filter((item) => item.type === 'image');
    if (images.length === 0) return null;
    const pick = images[Math.floor(Math.random() * images.length)];
    // Keyed by the photo's stable GUID: the served path must change between
    // rotations or the wall never swaps it.
    return {
      kind: 'download',
      id: pick.guid.replace(/[^A-Za-z0-9-]/g, ''),
      open: () => fetchWithTimeout(pick.url, { timeout: 30_000 }),
    };
  },
};
