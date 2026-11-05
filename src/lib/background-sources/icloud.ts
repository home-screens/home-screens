import { fetchICloudMedia } from '@/lib/icloud-media';
import { fetchWithTimeout } from '@/lib/api-utils';
import { saveRotationFile, extFromContentType } from './save';
import type { BackgroundRotation } from '@/types/config';
import type { BackgroundSourceProvider } from './types';

async function fetchAndSaveICloudPhoto(rotation: BackgroundRotation): Promise<string | null> {
  const images = (await fetchICloudMedia(rotation.icloudAlbumUrl || '')).filter((item) => item.type === 'image');
  if (images.length === 0) return null;
  const pick = images[Math.floor(Math.random() * images.length)];

  const imgRes = await fetchWithTimeout(pick.url, { timeout: 30_000 });
  if (!imgRes.ok) return null;

  const ext = extFromContentType(imgRes.headers.get('content-type') ?? '');
  const filename = `rotation-icloud-${pick.guid.replace(/[^A-Za-z0-9-]/g, '')}${ext}`;
  return saveRotationFile(filename, imgRes.body);
}

export const icloudSourceProvider: BackgroundSourceProvider = {
  id: 'icloud',
  fetchRandom: fetchAndSaveICloudPhoto,
};
