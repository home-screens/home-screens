import { createTTLCache, fetchWithTimeout } from '@/lib/api-utils';
import { APOD_CATEGORY, NASA_IMAGE_API, NASA_SCIENCE_API } from '@/lib/nasa';
import { importPictureToLibrary, UnsupportedImageFormatError } from '@/lib/library-import';
import type { MediaListItem } from '@/types/config';
import { PhotoSourceError, type BrowsePage, type PhotoSourceAdapter, type PickableSource } from './types';

/** Picture-of-the-day days per picker page, and search results per page. */
const PAGE_SIZE = 30;
/** The most posts WordPress hands out per request. */
const WP_MAX_PER_PAGE = 100;
/** NASA's image library stops paging after 100 pages. */
const MAX_SEARCH_PAGES = 100;

/** One Astronomy Picture of the Day, as the hub uses it. */
interface ApodDay {
  /** `YYYY-MM-DD`, the day it was the picture of. */
  date: string;
  title: string;
  /** The picture at full size (NASA serves 960 to 1300 px wide). */
  url: string;
}

interface WpPost {
  date?: string;
  title?: { rendered?: string };
  _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string; mime_type?: string }> };
}

/** A day's list for an hour: the picture changes once a day, and every wall shares it. */
const listCache = createTTLCache<MediaListItem[]>(60 * 60_000);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** WordPress titles arrive HTML-escaped ("Night&#8217;s Sky"). */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** "APOD: 2026 November 1 – Colors of the Moon" reads as "Colors of the Moon". */
function apodTitle(rendered: string): string {
  return decodeEntities(rendered).replace(/^APOD:\s*\d{4}\s+\S+\s+\d{1,2}\s*[\u2013\u2014-]\s*/u, '').trim();
}

function toDay(post: WpPost): ApodDay | null {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  const url = media?.source_url;
  if (!post.date || !url || !/^https:\/\//.test(url) || (media?.mime_type && !media.mime_type.startsWith('image/'))) return null;
  return { date: post.date.slice(0, 10), title: apodTitle(post.title?.rendered ?? ''), url };
}

/**
 * Pictures of the day, newest first, from science.nasa.gov. Every day has a
 * picture there, video days included (their still). A failed answer means
 * NASA isn't sending pictures right now, which the editor and wall say.
 */
async function apodPage(query: { perPage: number; page?: number; after?: string; before?: string }): Promise<{ days: ApodDay[]; totalPages: number }> {
  const params = new URLSearchParams({
    categories: String(APOD_CATEGORY),
    per_page: String(query.perPage),
    page: String(query.page ?? 1),
    orderby: 'date',
    order: 'desc',
    _embed: 'wp:featuredmedia',
    _fields: 'date,title,_links,_embedded',
  });
  if (query.after) params.set('after', query.after);
  if (query.before) params.set('before', query.before);
  const res = await fetchWithTimeout(`${NASA_SCIENCE_API}/image-article?${params}`);
  // WordPress answers a page past the end with 400.
  if (res.status === 400 && (query.page ?? 1) > 1) return { days: [], totalPages: 0 };
  if (!res.ok) {
    throw new PhotoSourceError("NASA's Picture of the Day isn't sending pictures right now", 503, { error: 'apod-unavailable' });
  }
  const posts = await res.json() as WpPost[];
  const days = (Array.isArray(posts) ? posts : []).map(toDay).filter((day): day is ApodDay => day !== null);
  return { days, totalPages: Number(res.headers.get('x-wp-totalpages')) || 1 };
}

/** The newest `count` pictures of the day. */
async function latestDays(count: number): Promise<ApodDay[]> {
  const days: ApodDay[] = [];
  for (let page = 1; days.length < count; page++) {
    const { days: more, totalPages } = await apodPage({ perPage: Math.min(WP_MAX_PER_PAGE, count), page });
    days.push(...more);
    if (page >= totalPages || more.length === 0) break;
  }
  return days.slice(0, count);
}

/** The thumbnail NASA's image service makes of a picture, for the picker's grid. */
function thumbnail(url: string): string {
  return /\/dynamicimage\//.test(url) ? `${url}${url.includes('?') ? '&' : '?'}w=480&h=480&fit=crop` : url;
}

/** The day after `YYYY-MM-DD`. */
function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** The largest picture a NASA library entry has in a format the display can show. */
async function libraryImageUrl(nasaId: string): Promise<string> {
  const res = await fetchWithTimeout(`${NASA_IMAGE_API}/asset/${encodeURIComponent(nasaId)}`);
  if (!res.ok) throw new PhotoSourceError('That NASA picture is no longer there', res.status === 404 ? 404 : 502);
  const data = await res.json() as { collection?: { items?: Array<{ href?: string }> } };
  const hrefs = (data.collection?.items ?? []).map((item) => item.href ?? '');
  // TIFF originals can't be shown, so only web formats are candidates.
  const web = hrefs.filter((href) => /\.(jpe?g|png|webp)$/i.test(href));
  const best = web.find((h) => /~orig\./i.test(h)) ?? web.find((h) => /~large\./i.test(h)) ?? web.find((h) => /~medium\./i.test(h)) ?? web[0];
  if (!best) throw new UnsupportedImageFormatError();
  return best.replace(/^http:\/\//, 'https://');
}

export const nasaPhotoSource: PhotoSourceAdapter<'nasa'> & PickableSource = {
  kind: 'nasa',

  /** The last `count` pictures of the day, newest first, hotlinked from NASA. */
  async list({ count, media }) {
    if (media === 'videos') return [];
    const cacheKey = String(count);
    const cached = listCache.get(cacheKey);
    if (cached) return cached;
    const items = (await latestDays(count)).map((day): MediaListItem => ({ url: day.url, type: 'image' }));
    listCache.set(cacheKey, items);
    return items;
  },

  /** Today's picture, or yesterday's until today's is posted. */
  async pickOne() {
    const [latest] = await latestDays(1);
    if (!latest) return null;
    return { kind: 'download', id: latest.date, open: () => fetchWithTimeout(latest.url, { timeout: 60_000 }) };
  },

  /**
   * `apod`: the pictures of the day, 30 to a page, newest first. Anything
   * else searches NASA's image library. Neither needs a key.
   */
  async browse({ collection, page, query }): Promise<BrowsePage> {
    if (collection === 'apod') {
      const { days, totalPages } = await apodPage({ perPage: PAGE_SIZE, page });
      return {
        items: days.map((day) => ({ ref: `apod:${day.date}`, thumbUrl: thumbnail(day.url), label: day.title, secondary: day.date })),
        nextPage: page < totalPages ? page + 1 : null,
      };
    }
    const words = query?.trim();
    if (!words) return { items: [], nextPage: null };
    const res = await fetchWithTimeout(`${NASA_IMAGE_API}/search?q=${encodeURIComponent(words)}&media_type=image&page=${page}&page_size=${PAGE_SIZE}`);
    if (!res.ok) throw new PhotoSourceError("Could not search NASA's image library", 502);
    const data = await res.json() as {
      collection?: {
        items?: Array<{ data?: Array<{ nasa_id?: string; title?: string; date_created?: string }>; links?: Array<{ href?: string }> }>;
        metadata?: { total_hits?: number };
      };
    };
    const items = (data.collection?.items ?? []).flatMap((item) => {
      const meta = item.data?.[0];
      const thumb = item.links?.[0]?.href;
      if (!meta?.nasa_id || !thumb || !/^[A-Za-z0-9._-]{1,120}$/.test(meta.nasa_id)) return [];
      return [{ ref: `image:${meta.nasa_id}`, thumbUrl: thumb, label: meta.title ?? '', secondary: meta.date_created?.slice(0, 10) }];
    });
    const total = data.collection?.metadata?.total_hits ?? 0;
    return { items, nextPage: page * PAGE_SIZE < total && page < MAX_SEARCH_PAGES ? page + 1 : null };
  },

  async importOne({ ref, folder }) {
    let url: string;
    let id: string;
    let title: string | undefined;
    if (ref.startsWith('apod:')) {
      id = ref.slice('apod:'.length);
      const { days } = await apodPage({ perPage: 1, after: `${id}T00:00:00`, before: `${nextDay(id)}T00:00:00` });
      if (!days[0]) throw new PhotoSourceError('That day has no picture to save', 404);
      url = days[0].url;
      title = days[0].title;
    } else {
      id = ref.slice('image:'.length);
      url = await libraryImageUrl(id);
    }
    return importPictureToLibrary({
      kind: 'nasa',
      id,
      folder,
      urlHint: url,
      open: async () => ({ response: await fetchWithTimeout(url, { timeout: 60_000 }), title }),
    });
  },
};

/** Test hook. */
export const __test = { apodTitle, decodeEntities, nextDay };
