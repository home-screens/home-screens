import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScreenConfiguration } from '@/types/config';
import { createResolverCache } from './api-utils';
import { readConfig } from './config';
import { withDataTransaction, getDataRoot } from './data-transaction';

/**
 * Short-TTL cached view over `readConfig()` for hot polling paths —
 * `/api/displays` (editor Displays tab + every unadopted Pi poll it every
 * 5 s) and the adopted-display check on the hwStats reporter tick.
 *
 * Built on `createResolverCache`, which supplies the semantics this path
 * needs: concurrent cold reads share one in-flight `readConfig()` (a TTL
 * expiry under N simultaneous pollers costs one disk read, not N), the TTL
 * is counted from when the read STARTS so a slow disk cannot stretch the
 * staleness bound past 1.5 s, and errors are never cached — a failed read
 * rejects every coalesced caller and the next call retries.
 *
 * `config.ts` calls `invalidateConfigReadCache()` after every write
 * (`writeConfig` / `updateConfigAtomic`), so within this process a config
 * save is visible to the very next cached read — the TTL only bounds
 * staleness against out-of-band edits to config.json. The resolver's
 * generation guard means a read that was already in flight when the write
 * landed cannot repopulate the cache with its pre-write snapshot.
 *
 * The returned object is the cache's shared instance: treat it as
 * read-only, and never use this for read-modify-write — that must go
 * through `updateConfigAtomic`, which re-reads inside its queue.
 */
const CONFIG_READ_CACHE_TTL_MS = 1_500;

const cache = createResolverCache<ScreenConfiguration>(
  CONFIG_READ_CACHE_TTL_MS,
  0,
  () => readConfig(),
);

let cacheSignature: string | null = null;

export async function readConfigCached(): Promise<ScreenConfiguration> {
  // The resolver's null branch is "the resolver returned null"; readConfig
  // always returns a config (or throws), so it is unreachable here.
  return withDataTransaction(async () => {
    // A different server process can commit a journal too. Keying by the
    // atomic file identity prevents pairing its new roster with old settings.
    let signature = 'missing';
    try {
      const stat = await fs.stat(path.join(getDataRoot(), 'data/config.json'));
      signature = `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const key = `${getDataRoot()}:${signature}`;
    if (cacheSignature !== key) { cache.clear(); cacheSignature = key; }
    return (await cache.fetch(key)) as ScreenConfiguration;
  });
}

/** Called by config.ts after every write so cached reads never lag a save. */
export function invalidateConfigReadCache(): void {
  cache.clear();
}

export function __resetConfigReadCacheForTests(): void {
  cacheSignature = null;
  cache.clear();
}
