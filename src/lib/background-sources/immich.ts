import { immichFetch } from '@/lib/immich';
import { saveRotationFile, extFromContentType } from './save';
import { existingChosenFiles } from './local';
import type { BackgroundRotation } from '@/types/config';
import type { BackgroundSourceProvider } from './types';

/** Immich has no native exclude-person filter; inspect a batch instead. */
const EXCLUDE_BATCH_SIZE = 10;

interface ImmichAssetDetail {
  people?: Array<{ id: string }>;
}

/** True if any face tagged on the asset is in the exclude list. */
async function assetHasExcludedPerson(assetId: string, excludeIds: string[]): Promise<boolean> {
  const res = await immichFetch(`/api/assets/${assetId}`);
  if (!res.ok) return true;
  const detail = await res.json() as ImmichAssetDetail;
  if (!Array.isArray(detail.people)) return true;
  const taggedIds = (detail.people ?? []).map((p) => p.id);
  return taggedIds.some((id) => excludeIds.includes(id));
}

/** Immich ANDs IDs; pick one to implement the UI's OR selection. */
function pickOne<T>(list: T[] | undefined): T | undefined {
  if (!list?.length) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

async function fetchAndSaveImmichPhoto(rotation: BackgroundRotation): Promise<string | null> {
  const excludeIds = rotation.immichPersonIdsExclude ?? [];
  const body: Record<string, unknown> = {
    type: 'IMAGE',
    size: excludeIds.length > 0 ? EXCLUDE_BATCH_SIZE : 1,
  };
  const albumId = pickOne(rotation.immichAlbumIds);
  const personId = pickOne(rotation.immichPersonIds);
  if (albumId) body.albumIds = [albumId];
  if (personId) body.personIds = [personId];
  if (rotation.immichFavoritesOnly) body.isFavorite = true;

  const res = await immichFetch('/api/search/random', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;

  const assets = await res.json();
  if (!Array.isArray(assets) || assets.length === 0) return null;

  let assetId: string | null = null;
  if (excludeIds.length === 0) {
    assetId = assets[0].id as string;
  } else {
    for (const asset of assets) {
      if (!(await assetHasExcludedPerson(asset.id, excludeIds))) {
        assetId = asset.id as string;
        break;
      }
    }
    if (!assetId) return null;
  }

  const imgRes = await immichFetch(`/api/assets/${assetId}/thumbnail?size=preview`, { timeout: 15_000 });
  if (!imgRes.ok) return null;

  const ext = extFromContentType(imgRes.headers.get('content-type') ?? '');
  return saveRotationFile(`rotation-immich-${assetId}${ext}`, imgRes.body);
}

/** A photo picked by hand wins; with none picked (or Filters mode) the filters draw a random photo. */
async function pickOrFetch(rotation: BackgroundRotation): Promise<string | null> {
  if (rotation.immichMode === 'pick') {
    const picked = await existingChosenFiles(rotation.immichImages);
    if (picked.length) return `/api/backgrounds/serve?file=${encodeURIComponent(picked[Math.floor(Math.random() * picked.length)])}`;
  }
  return fetchAndSaveImmichPhoto(rotation);
}

export const immichSourceProvider: BackgroundSourceProvider = {
  id: 'immich',
  fetchRandom: pickOrFetch,
};
