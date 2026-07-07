/**
 * Bounded preload cache for radar tile images.
 *
 * Tracks which tile URLs have already loaded so animation cycles skip
 * re-fetching them. Two rules keep a weeks-long kiosk mount healthy:
 * - Failed tiles are NOT recorded, so a transient tile error is retried on
 *   the next preload pass instead of staying blank for the life of the mount.
 * - `prune` drops every cached URL outside the current animation window, so
 *   the cache is bounded by one window's tile count (radar frame paths are
 *   timestamped and would otherwise accumulate forever).
 *
 * The image factory is injectable so the cache behavior is unit-testable
 * without a DOM.
 */
export type PreloadImage = Pick<HTMLImageElement, 'onload' | 'onerror' | 'src'>;

export interface TilePreloader {
  /** Preload any URLs not already cached; resolves when every request settles. */
  preload(urls: string[]): Promise<void>;
  /** Drop cached URLs that are not in the given set. */
  prune(validUrls: ReadonlySet<string>): void;
}

export function createTilePreloader(
  createImage: () => PreloadImage = () => new Image(),
): TilePreloader {
  const loaded = new Set<string>();
  return {
    preload(urls) {
      return Promise.all(
        urls.map((url) => {
          if (!url || loaded.has(url)) return Promise.resolve();
          return new Promise<void>((resolve) => {
            const img = createImage();
            img.onload = () => {
              loaded.add(url);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = url;
          });
        }),
      ).then(() => undefined);
    },
    prune(validUrls) {
      for (const url of loaded) {
        if (!validUrls.has(url)) loaded.delete(url);
      }
    },
  };
}
