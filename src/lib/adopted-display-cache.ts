import { readConfig } from './config';

/**
 * Tiny in-process cache for the adopted-display-id list.
 *
 * The hwStats POST path (`POST /api/display/status` with `hwStats`) calls
 * `requireAdoptedDisplay` on every reporter tick. Without this cache, N
 * adopted displays drive N disk reads per 30 s just to re-confirm the
 * registry between admin edits.
 *
 * The 1.5 s TTL matches `/api/displays`: collapses concurrent ticks, still
 * surfaces an adopt/unadopt edit within the next reporter interval.
 *
 * Returns null when in legacy single-display mode (no `displays` array OR
 * empty array). The caller decides what legacy-mode authorization means.
 */
const ADOPTED_CACHE_TTL_MS = 1_500;

let cache: { ids: string[] | null; expiresAt: number } | null = null;
let inflight: Promise<string[] | null> | null = null;

export async function getAdoptedDisplayIds(): Promise<string[] | null> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.ids;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const config = await readConfig();
      const ids = config?.displays && config.displays.length > 0
        ? config.displays.map((d) => d.id)
        : null;
      cache = { ids, expiresAt: Date.now() + ADOPTED_CACHE_TTL_MS };
      return ids;
    } catch {
      cache = { ids: null, expiresAt: Date.now() + ADOPTED_CACHE_TTL_MS };
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function __resetAdoptedCacheForTests(): void {
  cache = null;
  inflight = null;
}
