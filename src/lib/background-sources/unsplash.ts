import { getUnsplashAccessKey, trackDownload } from '@/lib/unsplash';
import { fetchWithTimeout } from '@/lib/api-utils';
import { isUnsplashCollectionsMode } from '@/lib/unsplash-rotation-mode';
import { saveRotationFile } from './save';
import { existingChosenFiles } from './local';
import type { BackgroundRotation } from '@/types/config';
import type { BackgroundSourceProvider, Canvas } from './types';

function orientationFor(canvas: Canvas | undefined): string | undefined {
  if (!canvas) return undefined;
  if (canvas.w > canvas.h * 1.1) return 'landscape';
  if (canvas.h > canvas.w * 1.1) return 'portrait';
  return 'squarish';
}

async function fetchAndSavePhoto(rotation: BackgroundRotation, canvas: Canvas | undefined): Promise<string | null> {
  const accessKey = await getUnsplashAccessKey();
  if (!accessKey) return null;

  const orientation = orientationFor(canvas);
  const useCollections = isUnsplashCollectionsMode(rotation);
  const base = useCollections
    ? `collections=${rotation.unsplashCollections!.map((id) => encodeURIComponent(id)).join(',')}`
    : `query=${encodeURIComponent(rotation.query)}`;
  const orientationParam = orientation ? `&orientation=${orientation}` : '';

  const res = await fetchWithTimeout(
    `https://api.unsplash.com/photos/random?${base}&content_filter=high${orientationParam}`,
    { headers: { Authorization: `Client-ID ${accessKey}` } },
  );
  if (!res.ok) return null;

  const photo = await res.json();
  const raw: string | undefined = photo.urls?.raw;
  const imageUrl = raw && canvas
    ? `${raw}${raw.includes('?') ? '&' : '?'}fit=crop&w=${canvas.w}&h=${canvas.h}&q=80&fm=jpg`
    : photo.urls?.regular;
  const photoId = photo.id;
  if (!imageUrl || !photoId) return null;

  const downloadLocation = photo.links?.download_location;
  if (downloadLocation) trackDownload(downloadLocation, accessKey);

  const imgRes = await fetchWithTimeout(imageUrl);
  if (!imgRes.ok) return null;

  return saveRotationFile(`rotation-unsplash-${photoId}.jpg`, imgRes.body);
}

/** A photo picked by hand wins; with none picked, Search mode keeps drawing random photos for its query. */
async function pickOrFetch(rotation: BackgroundRotation, canvas: Canvas | undefined): Promise<string | null> {
  if (!isUnsplashCollectionsMode(rotation)) {
    const picked = await existingChosenFiles(rotation.unsplashImages);
    if (picked.length) return `/api/backgrounds/serve?file=${encodeURIComponent(picked[Math.floor(Math.random() * picked.length)])}`;
  }
  return fetchAndSavePhoto(rotation, canvas);
}

export const unsplashSourceProvider: BackgroundSourceProvider = {
  id: 'unsplash',
  fetchRandom: pickOrFetch,
};
