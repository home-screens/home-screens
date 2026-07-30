import type { PluginManifest } from '@/types/plugins';
import type { ScreenConfiguration } from '@/types/config';
import { compareSemver } from '@/lib/semver';

/**
 * Pure plugin config-migration logic, deliberately free of client imports so
 * the server can run it. The migration itself must execute server-side: it is
 * a read-modify-write of the whole configuration, and doing that from the
 * browser reverts anything the editor saved in between.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merge source into target: new keys get source values, existing keys kept */
export function deepMergeConfig(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (!(key in result)) {
      result[key] = source[key];
    } else if (isPlainObject(result[key]) && isPlainObject(source[key])) {
      result[key] = deepMergeConfig(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    }
    // else: existing value preserved (including arrays)
  }
  return result;
}

/**
 * Apply version-stepped migrations (renames/defaults) then deep-merge with defaultConfig.
 *
 * `configMigrations` is keyed by the version that *introduces* each change, so
 * an entry under `"1.1.0"` describes what 1.1.0 did to the config shape.
 * Updating from `oldVersion` runs every entry in `(oldVersion, manifest.version]`
 * — exclusive at the bottom, because a config written at `oldVersion` already
 * has that version's shape, and inclusive at the top, because the version being
 * installed is precisely the one whose change has not been applied yet.
 *
 * Keying on the introducing version rather than the version migrated *away
 * from* is what makes this robust to intermediate releases. A migration entry
 * is normally added retroactively — you only know a rename needs migrating once
 * you have decided to rename — so the host cannot assume a user's installed
 * version lines up with a key. Under `(old, new]` a user on 1.0.1 updating to
 * 1.1.0 picks up the `"1.1.0"` entry exactly like a user on 1.0.0 does; keying
 * from-version would have silently skipped them, since no entry sits at 1.0.1.
 */
export function applyMigrationToModule(
  config: Record<string, unknown>,
  manifest: PluginManifest,
  oldVersion: string,
): Record<string, unknown> {
  const result = { ...config };

  if (manifest.configMigrations) {
    const versions = Object.keys(manifest.configMigrations)
      .filter((v) => compareSemver(v, oldVersion) > 0 && compareSemver(v, manifest.version) <= 0)
      .sort(compareSemver);

    for (const ver of versions) {
      const migration = manifest.configMigrations[ver];
      if (migration.renames) {
        for (const [oldKey, newKey] of Object.entries(migration.renames)) {
          if (oldKey in result && !(newKey in result)) {
            result[newKey] = result[oldKey];
            delete result[oldKey];
          }
        }
      }
      if (migration.defaults) {
        for (const [key, value] of Object.entries(migration.defaults)) {
          if (!(key in result)) result[key] = value;
        }
      }
    }
  }

  return deepMergeConfig(result, manifest.defaultConfig);
}

/**
 * Migrate every instance of `plugin:<moduleType>` in the configuration,
 * across the legacy global screen pool **and** every display's own screens.
 *
 * Walking only `config.screens` silently skipped every instance on every
 * display the user added, leaving the plugin to read a config shape it
 * believed it had already migrated.
 *
 * Mutates `config` in place and returns whether anything changed, so the
 * caller can skip the disk write when there is nothing to persist.
 */
export function migrateConfigModules(
  config: ScreenConfiguration,
  manifest: PluginManifest,
  oldVersion: string,
): boolean {
  const moduleType = `plugin:${manifest.moduleType}`;
  let changed = false;

  const screenLists = [config.screens ?? [], ...(config.displays ?? []).map((d) => d.screens ?? [])];

  for (const screens of screenLists) {
    for (const screen of screens) {
      for (const mod of screen.modules ?? []) {
        if (mod.type !== moduleType) continue;
        const originalJson = JSON.stringify(mod.config);
        const migrated = applyMigrationToModule(mod.config, manifest, oldVersion);
        if (JSON.stringify(migrated) !== originalJson) {
          mod.config = migrated;
          changed = true;
        }
      }
    }
  }

  return changed;
}
