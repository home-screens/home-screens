import { compareSemver } from '@/lib/semver';
import type { RegistryPlugin, RegistryPluginVersion } from '@/types/plugins';

/**
 * Whether a registry version entry can run on the given app version.
 * No appVersion (or no minAppVersion on the entry) means no filtering.
 */
export function isVersionCompatible(
  entry: Pick<RegistryPluginVersion, 'minAppVersion'>,
  appVersion?: string,
): boolean {
  if (!appVersion || !entry.minAppVersion) return true;
  const cmp = compareSemver(appVersion, entry.minAppVersion);
  // compareSemver yields NaN for unparsable segments (e.g. "v2.0.0"), and
  // NaN >= 0 is false — which would silently fail closed. Treat an
  // unparsable constraint as no constraint instead of blocking installs.
  return Number.isNaN(cmp) || cmp >= 0;
}

/**
 * Highest-semver version entry, ignoring array order.
 * When appVersion is given, entries whose minAppVersion exceeds it are excluded.
 * Returns null for an empty/fully-incompatible versions array.
 */
export function latestVersion(
  plugin: Pick<RegistryPlugin, 'versions'>,
  appVersion?: string,
): RegistryPluginVersion | null {
  let best: RegistryPluginVersion | null = null;
  for (const entry of plugin.versions) {
    if (!isVersionCompatible(entry, appVersion)) continue;
    if (!best || compareSemver(entry.version, best.version) > 0) best = entry;
  }
  return best;
}

/** True when the registry offers a compatible version newer than installedVersion. */
export function hasUpdate(
  plugin: Pick<RegistryPlugin, 'versions'>,
  installedVersion: string,
  appVersion?: string,
): boolean {
  const latest = latestVersion(plugin, appVersion);
  return latest !== null && compareSemver(latest.version, installedVersion) > 0;
}
