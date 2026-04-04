import { promises as fs } from 'fs';
import type { ScreenConfiguration } from '@/types/config';
import { CONFIG_FILE_PATH } from './constants';
import { createJsonStore } from './json-store';
import { migrateUp, getLatestSchemaVersion } from './migrations';

const DEFAULT_CONFIG: ScreenConfiguration = {
  version: 1,
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
});

// Guard to prevent multiple concurrent migrate-on-boot writes
let migrating = false;

export async function readConfig(): Promise<ScreenConfiguration> {
  try {
    const data = await fs.readFile(configStore.filePath, 'utf-8');
    const config = JSON.parse(data) as ScreenConfiguration;

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
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const writeConfig = configStore.write;
