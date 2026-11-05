import type { BackgroundRotation } from '@/types/config';

/**
 * The Immich mode the editor shows. An explicit `immichMode` always wins.
 * Without one, a config that already uses Immich (source ticked, or any
 * filter set) is a legacy config and stays on filters, which is what the
 * rotation has always done for it. A fresh config starts on hand-picked
 * pictures. The stored value for pictures remains 'pick'.
 */
export function effectiveImmichMode(rotation: BackgroundRotation | undefined): 'filters' | 'pick' {
  if (!rotation) return 'pick';
  if (rotation.immichMode) return rotation.immichMode;
  const usesFilters = !!(
    rotation.immichAlbumIds?.length || rotation.immichPersonIds?.length ||
    rotation.immichPersonIdsExclude?.length || rotation.immichFavoritesOnly
  );
  return rotation.sources?.includes('immich') || usesFilters ? 'filters' : 'pick';
}
