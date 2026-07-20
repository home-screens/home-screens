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
  // Compare on the app's release line only, ignoring its own prerelease tag:
  // per semver, "1.8.0-rc.0" < "1.8.0", so an RC build would otherwise be
  // treated as older than the very release it's a candidate for, hiding any
  // plugin version gated on minAppVersion === that release.
  const appCore = appVersion.split('-')[0];
  const cmp = compareSemver(appCore, entry.minAppVersion);
  // compareSemver yields NaN for unparsable segments (e.g. "v2.0.0"), and
  // NaN >= 0 is false — which would silently fail closed. Treat an
  // unparsable constraint as no constraint instead of blocking installs.
  return Number.isNaN(cmp) || cmp >= 0;
}

/**
 * Highest-semver version entry, ignoring array order.
 * When appVersion is given, entries whose minAppVersion exceeds it are excluded.
 * Beta-channel entries are excluded unless opts.includeBeta is true; when
 * included they are ordinary candidates, so the semver-max still applies across
 * stable and beta alike (a stable release out-ranks its own prerelease).
 * Returns null for an empty/fully-incompatible/fully-filtered versions array.
 */
export function latestVersion(
  plugin: Pick<RegistryPlugin, 'versions'>,
  appVersion?: string,
  opts?: { includeBeta?: boolean },
): RegistryPluginVersion | null {
  let best: RegistryPluginVersion | null = null;
  for (const entry of plugin.versions) {
    if (!isVersionCompatible(entry, appVersion)) continue;
    if (entry.channel === 'beta' && opts?.includeBeta !== true) continue;
    if (!best || compareSemver(entry.version, best.version) > 0) best = entry;
  }
  return best;
}

/** True when the registry offers a compatible version newer than installedVersion. */
export function hasUpdate(
  plugin: Pick<RegistryPlugin, 'versions'>,
  installedVersion: string,
  appVersion?: string,
  opts?: { includeBeta?: boolean },
): boolean {
  const latest = latestVersion(plugin, appVersion, opts);
  return latest !== null && compareSemver(latest.version, installedVersion) > 0;
}

/**
 * Single source of truth for "is this beta" — true if EITHER the plugin's own
 * registry-level channel or the specific version's channel is 'beta'. Used by
 * every Browse/Installed/Updates/InstallConfirm badge and by installPlugin's
 * channel-recording logic, so the two mechanisms (independent per
 * RegistryPlugin.channel and RegistryPluginVersion.channel) can't drift apart
 * across call sites.
 */
export function resolveChannel(
  plugin: Pick<RegistryPlugin, 'channel'> | null | undefined,
  version: Pick<RegistryPluginVersion, 'channel'> | null | undefined,
): 'stable' | 'beta' {
  return plugin?.channel === 'beta' || version?.channel === 'beta' ? 'beta' : 'stable';
}

/** A beta-channel registry entry, hidden from Browse unless the user opted in. */
export function isBetaHiddenEntry(plugin: Pick<RegistryPlugin, 'channel'>, showBeta: boolean): boolean {
  return plugin.channel === 'beta' && !showBeta;
}

/**
 * A stable-channel entry whose only currently-offered version is a beta build:
 * hidden from Browse for non-opted users (minAppVersion-incompatible entries
 * stay visible with a disabled Install button, unaffected by this check).
 */
export function isBetaOnlyForNonOptedUser(
  plugin: Pick<RegistryPlugin, 'channel' | 'versions'>,
  appVersion: string | undefined,
  showBeta: boolean,
): boolean {
  if (showBeta) return false;
  const stableLatest = latestVersion(plugin, appVersion, { includeBeta: false });
  const anyLatest = latestVersion(plugin, appVersion, { includeBeta: true });
  return !stableLatest && !!anyLatest;
}
