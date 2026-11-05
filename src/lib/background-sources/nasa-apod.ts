import { NASA_APOD_API, getNasaApiKey } from '@/lib/nasa';
import { fetchWithTimeout } from '@/lib/api-utils';
import { saveRotationFile, extFromContentType } from './save';
import type { BackgroundSourceProvider } from './types';

async function fetchAndSaveApod(): Promise<string | null> {
  const apiKey = await getNasaApiKey();
  if (!apiKey) return null;
  const res = await fetchWithTimeout(`${NASA_APOD_API}?api_key=${apiKey}&thumbs=true`);
  if (!res.ok) return null;

  const apod = await res.json();
  if (apod.media_type !== 'image') return null;

  const imageUrl = apod.hdurl || apod.url;
  if (!imageUrl) return null;

  const imgRes = await fetchWithTimeout(imageUrl, { timeout: 30_000 });
  if (!imgRes.ok) return null;

  const ext = extFromContentType(imgRes.headers.get('content-type') ?? '');
  const dateStr = (apod.date as string || '').replace(/-/g, '');
  return saveRotationFile(`rotation-nasa-apod-${dateStr}${ext}`, imgRes.body);
}

export const nasaApodSourceProvider: BackgroundSourceProvider = {
  id: 'nasa-apod',
  fetchRandom: fetchAndSaveApod,
};
