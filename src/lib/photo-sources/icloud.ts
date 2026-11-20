import { fetchWithTimeout } from '@/lib/api-utils';
import { findICloudItem, icloudMediaResource, icloudServeUrl, icloudVideoUrl, listICloudAlbum } from '@/lib/icloud-media';
import { mintMediaToken } from '@/lib/media-token';
import { shuffleArray } from '@/lib/shuffle';
import type { MediaListItem } from '@/types/config';
import { isShowingNow, type PhotoSourceAdapter } from './types';

/**
 * A public iCloud shared album. Apple's asset URLs are signed and die within
 * 20 minutes, sooner than a long slideshow pass ends, so the wall is handed
 * hub addresses instead: `/api/icloud/serve` proxies and caches a photo's
 * bytes and `/api/icloud/video` streams a video, each finding the item's
 * current URL when it is asked. That also keeps a list cheap: it names the
 * album's items and needs no links from Apple. A missing or malformed link
 * is an empty album; the wall's empty state says to check the link.
 */
export const icloudPhotoSource: PhotoSourceAdapter<'icloud'> = {
  kind: 'icloud',

  async list({ source, count, media }) {
    const link = source.albumUrl;
    const all = await listICloudAlbum(link);
    const wanted = media === 'both' ? all : all.filter((item) => (media === 'videos' ? item.type === 'video' : item.type === 'image'));
    // Shuffled per request so refreshes vary without asking Apple again.
    return Promise.all(shuffleArray(wanted).slice(0, count).map(async (item): Promise<MediaListItem> => {
      if (item.type === 'image') return { url: icloudServeUrl(link, item.guid), type: 'image' };
      // Bind the token to the album item the video route reads back.
      const token = await mintMediaToken(icloudMediaResource(link, item.guid));
      return {
        url: `${icloudVideoUrl(link, item.guid)}${token ? `&mt=${encodeURIComponent(token)}` : ''}`,
        type: 'video',
        ...(item.hasPoster ? { posterUrl: icloudServeUrl(link, item.guid, true) } : {}),
      };
    }));
  },

  async pickOne({ source, previous }) {
    // A background is a still picture; a video can't be one.
    const link = source.albumUrl;
    const images = (await listICloudAlbum(link)).filter((item) => item.type === 'image');
    if (images.length === 0) return null;
    const idOf = (guid: string) => guid.replace(/[^A-Za-z0-9-]/g, '');
    // A rotation that lands on the photo already showing doesn't rotate.
    const others = images.length > 1 ? images.filter((item) => !isShowingNow(previous, 'icloud', idOf(item.guid))) : images;
    const pick = others[Math.floor(Math.random() * others.length)];
    // Keyed by the photo's stable GUID: the served path must change between
    // rotations or the wall never swaps it.
    return {
      kind: 'download',
      id: idOf(pick.guid),
      // The link is looked up when the download starts, so it is never an old one.
      open: async () => {
        const item = await findICloudItem(link, pick.guid);
        if (!item) return new Response(null, { status: 404 });
        return fetchWithTimeout(item.url, { timeout: 30_000 });
      },
    };
  },
};
