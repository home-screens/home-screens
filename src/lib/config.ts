import { createHash } from 'crypto';
import type { ScreenConfiguration } from '@/types/config';
import { CONFIG_FILE_PATH } from './constants';
import { createJsonStore } from './json-store';
import { migrateUp, getLatestSchemaVersion } from './migrations';
// Circular with config-cache (it reads via readConfig, we invalidate it on
// write) — safe because both sides only touch the other at call time, never
// during module init.
import { invalidateConfigReadCache } from './config-cache';

// DEFAULT_CONFIG must track the latest schema version. `version` pulls from
// `getLatestSchemaVersion()` so adding a new migration automatically updates
// fresh installs — otherwise they'd trigger an unnecessary migrate-on-boot
// write on first read. Any new required fields still need to be added here.
const DEFAULT_CONFIG: ScreenConfiguration = {
  version: getLatestSchemaVersion(),
  settings: {
    rotationIntervalMs: 30000,
    displayWidth: 1080,
    displayHeight: 1920,
    displayTransform: '90',
    latitude: 0,
    longitude: 0,
    weather: {
      // Open-Meteo needs no API key, so a fresh install renders weather as
      // soon as the user sets their location. Every keyed provider would
      // show an error until a key is entered.
      provider: 'open-meteo',
      latitude: 0,
      longitude: 0,
      units: 'imperial',
    },
    calendar: {
      googleCalendarId: '',
      googleCalendarIds: [],
      icalSources: [],
      daysAhead: 7,
    },
  },
  screens: [
    {
      id: 'default',
      name: 'Screen 1',
      backgroundImage: '',
      modules: [],
    },
  ],
};

const configStore = createJsonStore<ScreenConfiguration>({
  path: CONFIG_FILE_PATH,
  defaultValue: DEFAULT_CONFIG,
  // Critical: do NOT silently fall back to defaults on parse/permission errors.
  // ENOENT still returns the default (fresh install), but a corrupt or
  // unreadable config will throw — preventing read-mutate-write callers
  // (e.g. profile change) from clobbering real config with empty defaults.
  errorHandling: 'throw-corrupt',
});

// Guard to prevent multiple concurrent migrate-on-boot writes
let migrating = false;

export async function readConfig(): Promise<ScreenConfiguration> {
  // Delegate read + error handling to the store. ENOENT → DEFAULT_CONFIG;
  // any other failure (corrupt JSON, permission denied) propagates as a
  // thrown error so callers can fail closed instead of overwriting state.
  const config = await configStore.read();

  // Migrate-on-boot: if the config schema is behind the current code's
  // latest version, apply migrations lazily. This catches schema upgrades
  // that the old code's migrateStep couldn't know about during a tarball
  // upgrade (where migration runs from the old version's code).
  const target = getLatestSchemaVersion();
  if ((config.version ?? 0) < target) {
    try {
      const { config: migrated } = migrateUp(config, target);
      // Fire-and-forget persist — don't block the read on disk I/O.
      // The guard prevents duplicate writes from concurrent requests.
      // Goes through updateConfigAtomic (not bare writeConfig) so the
      // write re-reads inside the queue and re-checks the version: if a
      // concurrent PUT /api/config landed first, its (already-migrated)
      // save is observed and this becomes a no-op instead of clobbering
      // the editor's save with this stale pre-migration snapshot.
      if (!migrating) {
        migrating = true;
        updateConfigAtomic((current) => current)
          .catch(() => {})
          .finally(() => { migrating = false; });
      }
      return migrated;
    } catch {
      // Migration failed — return the un-migrated config rather than defaults
      // so read-mutate-write callers don't silently clobber user data.
      return config;
    }
  }

  return config;
}

/**
 * Content hash of a config, as served by `GET /api/config`. Computed from the
 * object the caller is about to serialize, so two reads of the same file (or
 * a read and the body just written) agree byte for byte. Hashing rather than
 * a stored counter means every writer (the editor's PUT, a remote profile
 * switch through `updateConfigAtomic`, a restore) bumps it for free.
 */
export function configRevision(config: ScreenConfiguration): string {
  return createHash('sha1').update(JSON.stringify(config)).digest('hex').slice(0, 16);
}

export async function writeConfig(config: ScreenConfiguration): Promise<void> {
  await configStore.write(config);
  // Drop the short-TTL read cache so /api/displays and the adopted-display
  // check see this save on their very next poll instead of up to 1.5s later
  // (a freshly adopted display's first hw-stats POST must not 403).
  invalidateConfigReadCache();
}

/**
 * Atomic read-modify-write for `config.json`. Routes that need to observe
 * the on-disk state, mutate it, and persist the result without another
 * writer interleaving (e.g. the per-display profile change handler) must
 * use this rather than the bare `readConfig()` → mutate → `writeConfig()`
 * sequence — the latter races against the editor's PUT /api/config.
 *
 * Migrations are applied transparently inside the mutator's input so the
 * caller always sees a config at the latest schema version.
 *
 * **No-op signal:** if the user mutator returns the same reference it
 * was given (i.e. nothing changed) AND migration did not run, the wrapper
 * returns the original `current` reference. The underlying `updateAtomic`
 * compares `mutated === current` and skips the disk write — used by
 * validation-error paths to bail without spurious serialize+fsync work.
 * When migration DID run, the write always fires.
 */
export function updateConfigAtomic(
  mutator: (current: ScreenConfiguration) => ScreenConfiguration | Promise<ScreenConfiguration>,
): Promise<ScreenConfiguration> {
  const target = getLatestSchemaVersion();
  return configStore
    .updateAtomic(async (current) => {
      // Migrate-on-read inside the queue so the mutator always sees the
      // current schema. This mirrors what readConfig() does outside the queue.
      const wasMigrated = (current.version ?? 0) < target;
      const migrated = wasMigrated ? migrateUp(current, target).config : current;
      const result = await mutator(migrated);
      if (result === migrated && !wasMigrated) {
        return current;
      }
      return result;
    })
    .then((result) => {
      // Invalidate the short-TTL read cache even on the no-op path — cheaper
      // than detecting it, and a spurious re-read costs one disk hit.
      invalidateConfigReadCache();
      return result;
    });
}
