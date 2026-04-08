import type { ScreenConfiguration } from '@/types/config';
import { CONFIG_FILE_PATH } from './constants';
import { createJsonStore } from './json-store';
import { migrateUp, getLatestSchemaVersion } from './migrations';

/**
 * Idempotent in-memory normalization that runs on every config read.
 *
 * The original multi-display registry let `main` exist as a `DisplayNode`
 * with no dimension fields, because the rotator would fall back to
 * `config.settings.displayWidth/Height/Transform` for that one display.
 * That carve-out forced a "main is special" branch in every editor surface
 * (a dimensionsLocked hack in the Display settings page, "hide pencil/trash"
 * branches in the Displays index, etc.). We are now flattening main into a
 * regular DisplayNode that owns its own dimensions, so every UI surface can
 * treat all displays uniformly.
 *
 * This helper:
 *   - finds the `main` display, if one exists
 *   - copies the global `displayWidth`/`displayHeight`/`displayTransform`
 *     onto it ONLY when the DisplayNode field is missing — so it cannot
 *     clobber an explicit per-display dimension a user already set
 *   - is safe to re-run on already-normalized configs (idempotent)
 *
 * It is NOT a schema migration, so it does not bump `config.version` or
 * trigger the migrate-on-boot write-back path. Configs will pick up the
 * in-memory normalization on every read; the next ordinary save (editor
 * PUT, display CRUD, profile change) flushes the field onto disk.
 *
 * The helper deliberately returns a *new* config object (shallow clone of
 * the main node + `.map()` to replace it in the displays array) rather
 * than mutating in place. Some call sites cache the result of
 * `readConfig()` (e.g. `/api/displays` holds the resolved value for 1.5s),
 * so mutating a shared reference would let the first request's normalization
 * leak into every subsequent cached caller — a concurrency bug waiting to
 * happen. Cloning costs one spread per display and keeps the invariant
 * explicit in the code instead of buried in a comment about json-store
 * read semantics.
 */
function applyMainDisplayNormalization(config: ScreenConfiguration): ScreenConfiguration {
  const displays = config.displays;
  if (!displays) return config;
  const mainIdx = displays.findIndex((d) => d.id === 'main');
  if (mainIdx === -1) return config;
  const mainDisplay = displays[mainIdx];
  if (
    mainDisplay.displayWidth != null
    && mainDisplay.displayHeight != null
    && mainDisplay.displayTransform != null
  ) {
    return config;
  }
  const normalizedMain = { ...mainDisplay };
  if (normalizedMain.displayWidth == null) {
    normalizedMain.displayWidth = config.settings.displayWidth;
  }
  if (normalizedMain.displayHeight == null) {
    normalizedMain.displayHeight = config.settings.displayHeight;
  }
  if (normalizedMain.displayTransform == null) {
    normalizedMain.displayTransform = config.settings.displayTransform ?? 'normal';
  }
  const nextDisplays = displays.map((d, i) => (i === mainIdx ? normalizedMain : d));
  return { ...config, displays: nextDisplays };
}

// DEFAULT_CONFIG must track the latest schema version. When you add a new
// migration, bump this and add any new required fields. Otherwise fresh
// installs will trigger an unnecessary migrate-on-boot write.
const DEFAULT_CONFIG: ScreenConfiguration = {
  version: 3,
  settings: {
    rotationIntervalMs: 30000,
    displayWidth: 1080,
    displayHeight: 1920,
    displayTransform: '90',
    latitude: 0,
    longitude: 0,
    weather: {
      provider: 'weatherapi',
      latitude: 0,
      longitude: 0,
      units: 'imperial',
    },
    calendar: {
      googleCalendarId: '',
      googleCalendarIds: [],
      icalSources: [],
      maxEvents: 50,
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
      // Fire-and-forget write — don't block the read on disk I/O.
      // The guard prevents duplicate writes from concurrent requests.
      if (!migrating) {
        migrating = true;
        writeConfig(migrated).catch(() => {}).finally(() => { migrating = false; });
      }
      return applyMainDisplayNormalization(migrated);
    } catch {
      // Migration failed — return the un-migrated config rather than defaults.
      // Still run main-display normalization so even an old, un-migrated
      // config gets a consistent in-memory shape.
      return applyMainDisplayNormalization(config);
    }
  }

  return applyMainDisplayNormalization(config);
}

export const writeConfig = configStore.write;

/**
 * Atomic read-modify-write for `config.json`. Routes that need to observe
 * the on-disk state, mutate it, and persist the result without another
 * writer interleaving (e.g. the per-display profile change handler) must
 * use this rather than the bare `readConfig()` → mutate → `writeConfig()`
 * sequence — the latter races against the editor's PUT /api/config.
 *
 * Migrations are applied transparently inside the mutator's input so the
 * caller always sees a config at the latest schema version.
 */
export function updateConfigAtomic(
  mutator: (current: ScreenConfiguration) => ScreenConfiguration | Promise<ScreenConfiguration>,
): Promise<ScreenConfiguration> {
  const target = getLatestSchemaVersion();
  return configStore.updateAtomic(async (current) => {
    // Migrate-on-read inside the queue so the mutator always sees the
    // current schema. This mirrors what readConfig() does outside the queue.
    const migrated =
      (current.version ?? 0) < target ? migrateUp(current, target).config : current;
    // Apply the same main-display normalization readConfig() runs, so a
    // mutator that touches `displays[main]` always observes the
    // dimensions on the DisplayNode rather than discovering them missing
    // and writing whatever stale form value it had.
    return mutator(applyMainDisplayNormalization(migrated));
  });
}
