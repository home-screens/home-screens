import type { ScreenConfiguration } from '@/types/config';
import { v4ToV5 } from './v4-to-v5';
import { v5ToV6 } from './v5-to-v6';
import { v6ToV7 } from './v6-to-v7';
import { v7ToV8 } from './v7-to-v8';
import { v8ToV9 } from './v8-to-v9';
import { v9ToV10 } from './v9-to-v10';

interface Migration {
  version: number;
  description: string;
  up(config: ScreenConfiguration): ScreenConfiguration;
}

// Import all migrations in order
// Each migration takes config from version N-1 to version N
const migrations: Migration[] = [
  // Migration 001: baseline (v1) - no-op, establishes the starting schema
  {
    version: 1,
    description: 'Baseline schema',
    up: (config) => ({ ...config, version: 1 }),
  },
  // Migration 002: flag-status moved from built-in to plugin
  {
    version: 2,
    description: 'Migrate flag-status module to plugin:flag-status',
    up(config) {
      return {
        ...config,
        version: 2,
        screens: config.screens.map((screen) => ({
          ...screen,
          modules: screen.modules.map((mod) => {
            if ((mod.type as string) !== 'flag-status') return mod;
            const cfg = mod.config as Record<string, unknown>;
            const refreshMs = cfg?.refreshIntervalMs as number | undefined;
            const newConfig = { ...cfg };
            if (refreshMs != null) {
              delete newConfig.refreshIntervalMs;
              newConfig.refreshIntervalMin = Math.round(refreshMs / 60_000);
            }
            return { ...mod, type: 'plugin:flag-status' as ScreenConfiguration['screens'][number]['modules'][number]['type'], config: newConfig };
          }),
        })),
      };
    },
  },
  // Migration 003: signal that the multi-display registry feature is available.
  // No-op transform — the optional `displays` field is fully backward compatible.
  // The version bump just lets newer code distinguish "this config could have
  // displays defined" from "this config predates the feature entirely".
  {
    version: 3,
    description: 'Multi-display registry available',
    up: (config) => ({ ...config, version: 3 }),
  },
  // Migration 004: `DisplayNode.screenIds` / `DisplayNode.profileIds` removed
  // from the schema. Telemetry confirmed zero installs on the legacy shape,
  // so no runtime data migration is needed — just a version bump to mark the
  // cutover.
  {
    version: 4,
    description: 'Owned screens/profiles required (screenIds/profileIds removed)',
    up: (config) => ({ ...config, version: 4 }),
  },
  // Migration 005: locale field added to GlobalSettings. No-op transform —
  // the new optional `locale` and `formattingLocale` fields default to
  // en-US at read time, so existing configs need no on-disk change.
  v4ToV5,
  // Migration 006: countdown `scale` became view-independent — the Next view's
  // 1.3x render multiplier is folded into the stored value.
  v5ToV6,
  // Migration 007: idle dimming became an explicit toggle; configs whose dim
  // schedule implicitly suppressed idle behavior get idleDimEnabled: false.
  v6ToV7,
  // Migration 008: the calendar's multi-week theme and per-cell cap became
  // grid-wide fields; the prerelease keys are renamed in place.
  v7ToV8,
  // Migration 009: the retired fullscreen calendar / chore chart / meal
  // planner default accents are cleared so a theme's own accent can apply.
  v8ToV9,
  v9ToV10,
];

/** @internal Get all migrations sorted by version */
export function getMigrations(): Migration[] {
  return [...migrations].sort((a, b) => a.version - b.version);
}

/** Run migrations from currentVersion up to targetVersion */
export function migrateUp(
  config: ScreenConfiguration,
  targetVersion?: number,
): { config: ScreenConfiguration; migrationsRun: string[] } {
  const all = getMigrations();
  const currentVersion = config.version ?? 1;
  const target = targetVersion ?? (all.length > 0 ? all[all.length - 1].version : 1);

  const migrationsRun: string[] = [];
  let result = structuredClone(config);

  for (const migration of all) {
    if (migration.version > currentVersion && migration.version <= target) {
      result = migration.up(result);
      result.version = migration.version;
      migrationsRun.push(`v${migration.version}: ${migration.description}`);
    }
  }

  return { config: result, migrationsRun };
}

/** Get the latest schema version */
export function getLatestSchemaVersion(): number {
  const all = getMigrations();
  return all.length > 0 ? all[all.length - 1].version : 1;
}
