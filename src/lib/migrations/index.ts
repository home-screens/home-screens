import type { ScreenConfiguration } from '@/types/config';

interface Migration {
  version: number;
  description: string;
  up(config: ScreenConfiguration): ScreenConfiguration;
  down(config: ScreenConfiguration): ScreenConfiguration;
}

// Import all migrations in order
// Each migration takes config from version N-1 to version N
const migrations: Migration[] = [
  // Migration 001: baseline (v1) - no-op, establishes the starting schema
  {
    version: 1,
    description: 'Baseline schema',
    up: (config) => ({ ...config, version: 1 }),
    down: (config) => ({ ...config, version: 1 }),
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cfg = mod.config as any;
            const refreshMs = cfg?.refreshIntervalMs;
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
    down(config) {
      return {
        ...config,
        version: 1,
        screens: config.screens.map((screen) => ({
          ...screen,
          modules: screen.modules.map((mod) => {
            if (mod.type !== ('plugin:flag-status' as string)) return mod;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cfg = mod.config as any;
            const refreshMin = cfg?.refreshIntervalMin;
            const newConfig = { ...cfg };
            if (refreshMin != null) {
              delete newConfig.refreshIntervalMin;
              newConfig.refreshIntervalMs = refreshMin * 60_000;
            }
            return { ...mod, type: 'flag-status' as ScreenConfiguration['screens'][number]['modules'][number]['type'], config: newConfig };
          }),
        })),
      };
    },
  },
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

/** @internal Run migrations from currentVersion down to targetVersion */
export function migrateDown(
  config: ScreenConfiguration,
  targetVersion: number,
): { config: ScreenConfiguration; migrationsRun: string[] } {
  const all = getMigrations().reverse(); // Process in reverse order
  const currentVersion = config.version ?? 1;

  const migrationsRun: string[] = [];
  let result = structuredClone(config);

  for (const migration of all) {
    if (migration.version <= currentVersion && migration.version > targetVersion) {
      result = migration.down(result);
      migrationsRun.push(`v${migration.version} (rollback): ${migration.description}`);
    }
  }

  result.version = targetVersion;
  return { config: result, migrationsRun };
}

/** Get the latest schema version */
export function getLatestSchemaVersion(): number {
  const all = getMigrations();
  return all.length > 0 ? all[all.length - 1].version : 1;
}
