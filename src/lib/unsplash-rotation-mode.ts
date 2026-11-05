import type { BackgroundRotation } from '@/types/config';

export function isUnsplashCollectionsMode(rotation: BackgroundRotation): boolean {
  return rotation.unsplashMode === 'collections' ||
    (rotation.unsplashMode == null && !!rotation.unsplashCollections?.length);
}
