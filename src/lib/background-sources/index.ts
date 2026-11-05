export type { BackgroundSourceProvider, Canvas } from './types';
export { unsplashSourceProvider } from './unsplash';
export { nasaApodSourceProvider } from './nasa-apod';
export { immichSourceProvider } from './immich';
export { icloudSourceProvider } from './icloud';
export { localSourceProvider } from './local';
export { colorSourceProvider, patternSourceProvider, starterCandidates } from './starter';

import { unsplashSourceProvider } from './unsplash';
import { nasaApodSourceProvider } from './nasa-apod';
import { immichSourceProvider } from './immich';
import { icloudSourceProvider } from './icloud';
import { localSourceProvider } from './local';
import { colorSourceProvider, patternSourceProvider, starterCandidates } from './starter';
import type { BackgroundSourceProvider } from './types';
import type { BackgroundRotation, BackgroundRotationSourceId } from '@/types/config';
import { isUnsplashCollectionsMode } from '@/lib/unsplash-rotation-mode';
import { parseICloudAlbumToken, parseICloudSharedAlbumUrl } from '@/lib/icloud-parse';
import { localImageFile } from './local';

export const backgroundSourceProviders: Record<BackgroundRotationSourceId, BackgroundSourceProvider> = {
  unsplash: unsplashSourceProvider,
  'nasa-apod': nasaApodSourceProvider,
  immich: immichSourceProvider,
  icloud: icloudSourceProvider,
  local: localSourceProvider,
  color: colorSourceProvider,
  pattern: patternSourceProvider,
};

export function isSourceConfigured(source: BackgroundRotationSourceId, rotation: BackgroundRotation): boolean {
  if (source === 'color' || source === 'pattern') {
    return starterCandidates(source, rotation).length > 0;
  }
  if (source === 'unsplash') {
    return isUnsplashCollectionsMode(rotation)
      ? !!rotation.unsplashCollections?.length
      : !!rotation.query || (rotation.unsplashImages ?? []).some((url) => localImageFile(url));
  }
  // A source that cannot produce a photo yet must not take a turn: it would win a share of the picks and return nothing.
  if (source === 'icloud') {
    const link = rotation.icloudAlbumUrl || '';
    return !!(parseICloudSharedAlbumUrl(link) || parseICloudAlbumToken(link));
  }
  if (source === 'local' && rotation.localMode === 'images') {
    return (rotation.localImages ?? []).some((url) => localImageFile(url));
  }
  return Object.hasOwn(backgroundSourceProviders, source);
}
