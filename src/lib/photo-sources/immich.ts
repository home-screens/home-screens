import { createTTLCache } from '@/lib/api-utils';
import { immichFetch, parseImmichDurationMs, type ImmichAsset } from '@/lib/immich';
import { sourceCacheKey } from '@/lib/photo-source';
import { missingPermissionBody, type ImmichPermission } from '@/lib/immich-permissions';
import { importPictureToLibrary } from '@/lib/library-import';
import { mintMediaToken } from '@/lib/media-token';
import { shuffleArray } from '@/lib/shuffle';
import type { PhotoSource, MediaListItem } from '@/types/config';
import { PhotoSourceError, type BrowsePage, type PhotoSourceAdapter, type PickableSource } from './types';

type ImmichSource = Extract<PhotoSource, { kind: 'immich' }>;

/** A stream's random pick, for five minutes, so walls refreshing together share one search. */
const listCache = createTTLCache<MediaListItem[]>(5 * 60_000);

/** How many tiles the picker loads at a time. */
export const IMMICH_BROWSE_PAGE_SIZE = 60;

function previewUrl(assetId: string): string {
  return `/api/immich/serve?assetId=${assetId}&size=preview`;
}

/**
 * Immich answers a key without a permission with 403. Name it, so the editor
 * and the wall can say which box to tick instead of "something failed".
 */
function failed(res: Response, permission: ImmichPermission, what: string): never {
  if (res.status === 403) throw new PhotoSourceError(`Immich key is missing ${permission}`, 403, { ...missingPermissionBody(permission) });
  throw new PhotoSourceError(`Could not ${what} from Immich`, 502);
}

function filters(source: ImmichSource): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (source.albumIds?.length) body.albumIds = source.albumIds;
  if (source.personIds?.length) body.personIds = source.personIds;
  if (source.favoritesOnly) body.isFavorite = true;
  return body;
}

/**
 * Whether an asset shows anyone on the exclude list. Immich's random search
 * has no "not these people", so the candidates are checked afterwards, all
 * at once. An answer that cannot be read (a key without the permission that
 * fills `people`) is unknown, and an unknown photo is kept rather than
 * dropped: the filter must never make a source go silent.
 */
async function showsExcludedPerson(asset: ImmichAsset, excludePersonIds: string[]): Promise<boolean> {
  const listed = (asset as { people?: Array<{ id?: string }> }).people;
  const people = Array.isArray(listed) ? listed : await (async () => {
    const res = await immichFetch(`/api/assets/${asset.id}`).catch(() => null);
    if (!res?.ok) return null;
    const detail = await res.json().catch(() => null) as { people?: Array<{ id?: string }> } | null;
    return Array.isArray(detail?.people) ? detail.people : null;
  })();
  if (!people) return false;
  return people.some((person) => typeof person.id === 'string' && excludePersonIds.includes(person.id));
}

/** The candidates without anyone on the exclude list, checked in parallel. */
async function withoutExcluded(assets: ImmichAsset[], source: ImmichSource): Promise<ImmichAsset[]> {
  const exclude = source.excludePersonIds ?? [];
  if (exclude.length === 0 || assets.length === 0) return assets;
  const flags = await Promise.all(assets.map((asset) => showsExcludedPerson(asset, exclude)));
  return assets.filter((_, i) => !flags[i]);
}

/**
 * Random assets matching the filters. Immich v3 dropped `assets` from the
 * album detail answer; search/random takes albumIds on v2 and v3 and handles
 * every filter combination itself, one asset type per call.
 */
async function searchRandom(source: ImmichSource, type: 'IMAGE' | 'VIDEO', size: number): Promise<ImmichAsset[]> {
  const res = await immichFetch('/api/search/random', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...filters(source), type, size }),
  });
  if (!res.ok) failed(res, 'asset.read', 'search photos');
  const assets: unknown = await res.json();
  return Array.isArray(assets) ? (assets as ImmichAsset[]) : [];
}

async function toItem(asset: ImmichAsset): Promise<MediaListItem> {
  if (asset.type !== 'VIDEO') return { url: previewUrl(asset.id), type: 'image' };
  // Bind the token to the assetId the video route reads back.
  const token = await mintMediaToken(asset.id);
  const durationMs = parseImmichDurationMs(asset.duration);
  return {
    url: `/api/immich/video?assetId=${asset.id}${token ? `&mt=${encodeURIComponent(token)}` : ''}`,
    type: 'video',
    posterUrl: previewUrl(asset.id),
    ...(durationMs ? { durationMs } : {}),
  };
}

/** The picker's sidebar entry as Immich search filters, or null for an id it doesn't know. */
function collectionFilters(collection: string): ImmichSource | null {
  if (collection === 'all') return { kind: 'immich' };
  if (collection === 'favorites') return { kind: 'immich', favoritesOnly: true };
  const album = /^album:([a-f0-9-]{1,64})$/i.exec(collection);
  if (album) return { kind: 'immich', albumIds: [album[1]] };
  const person = /^person:([a-f0-9-]{1,64})$/i.exec(collection);
  if (person) return { kind: 'immich', personIds: [person[1]] };
  return null;
}

export const immichPhotoSource: PhotoSourceAdapter<'immich'> & PickableSource = {
  kind: 'immich',

  async list({ source, count, media }) {
    const cacheKey = `${sourceCacheKey(source)}-${count}-${media}`;
    const cached = listCache.get(cacheKey);
    if (cached) return cached;
    let assets: ImmichAsset[];
    if (source.assetIds) {
      // Hand-picked photos play as they are; videos are never picked.
      assets = media === 'videos' ? [] : source.assetIds.map((id) => ({ id, type: 'IMAGE' }) as ImmichAsset);
    } else if (media === 'photos') {
      assets = await searchRandom(source, 'IMAGE', count);
    } else if (media === 'videos') {
      assets = await searchRandom(source, 'VIDEO', count);
    } else {
      const [images, videos] = await Promise.all([searchRandom(source, 'IMAGE', count), searchRandom(source, 'VIDEO', count)]);
      // Merged photo+video results interleave randomly.
      assets = shuffleArray([...images, ...videos]).slice(0, count);
    }
    if (!source.assetIds) assets = await withoutExcluded(assets, source);
    const items = await Promise.all(assets.map(toItem));
    listCache.set(cacheKey, items);
    return items;
  },

  async pickOne({ source, previous }) {
    let id: string | undefined;
    if (source.assetIds) {
      // A rotation that lands on the photo already showing doesn't rotate.
      const others = source.assetIds.length > 1 ? source.assetIds.filter((assetId) => !previous?.includes(assetId)) : source.assetIds;
      id = others[Math.floor(Math.random() * others.length)];
    } else {
      // A handful of candidates, so an excluded person leaves something to show.
      const candidates = await withoutExcluded(await searchRandom(source, 'IMAGE', source.excludePersonIds?.length ? 10 : 1), source);
      id = candidates[0]?.id;
    }
    if (!id) return null;
    const assetId = id;
    // The preview is display-sized and always a web format, unlike an original (HEIC, RAW).
    return { kind: 'download', id: assetId, open: () => immichFetch(`/api/assets/${assetId}/thumbnail?size=preview`, { timeout: 30_000 }) };
  },

  /**
   * Newest first, a page at a time, for finding one picture. Random search is
   * no good for that, so the picker pages search/metadata, whose
   * `assets.nextPage` says whether there is more. Still pictures only.
   */
  async browse({ collection, page }): Promise<BrowsePage> {
    const source = collectionFilters(collection);
    if (!source) throw new PhotoSourceError('Unknown Immich collection', 400);
    const res = await immichFetch('/api/search/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...filters(source), type: 'IMAGE', order: 'desc', page, size: IMMICH_BROWSE_PAGE_SIZE }),
    });
    if (!res.ok) failed(res, 'asset.read', 'list photos');
    const body = await res.json() as { assets?: { items?: ImmichAsset[]; nextPage?: string | null } };
    const assets = body.assets?.items ?? [];
    const next = Number(body.assets?.nextPage);
    return {
      items: assets.map((asset) => ({
        ref: asset.id,
        thumbUrl: `/api/immich/serve?assetId=${asset.id}&size=thumbnail`,
        label: asset.originalFileName,
        ...(asset.isFavorite ? { favorite: true } : {}),
      })),
      nextPage: Number.isFinite(next) && next > page ? next : null,
    };
  },

  async importOne({ ref, folder }) {
    return importPictureToLibrary({
      kind: 'immich',
      id: ref,
      folder,
      open: async () => {
        const res = await immichFetch(`/api/assets/${ref}/thumbnail?size=preview`, { timeout: 30_000 });
        if (!res.ok) failed(res, 'asset.view', 'load the photo');
        // The photo's own file name (IMG_2041) names the copy; without it the id does.
        const info = await immichFetch(`/api/assets/${ref}`).catch(() => null);
        const asset = info?.ok ? await info.json().catch(() => null) as Partial<ImmichAsset> | null : null;
        return { response: res, title: asset?.originalFileName };
      },
    });
  },
};
