import type { ScreenConfiguration } from '@/types/config';
import { CONFIG_FILE_PATH } from './constants';
import { createJsonStore } from './json-store';
import { migrateUp, getLatestSchemaVersion } from './migrations';

// DEFAULT_CONFIG must track the latest schema version. When you add a new
// migration, bump this and add any new required fields. Otherwise fresh
// installs will trigger an unnecessary migrate-on-boot write.
const DEFAULT_CONFIG: ScreenConfiguration = {
  version: 2,
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
      return migrated;
    } catch {
      // Migration failed — return the un-migrated config rather than defaults
      return config;
    }
  }

  return config;
}

export const writeConfig = configStore.write;
