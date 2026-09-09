/** Split "1.2.3-rc.1" into ["1.2.3", "rc.1"] */
function splitVersion(v: string): [string, string | null] {
  const idx = v.indexOf('-');
  if (idx === -1) return [v, null];
  return [v.substring(0, idx), v.substring(idx + 1)];
}

/** Check if a version string has a pre-release suffix (e.g., "0.15.0-rc.1") */
export function isPrerelease(version: string): boolean {
  return version.includes('-');
}

/**
 * Compare two semver strings (with pre-release support).
 * Returns >0 if a > b, <0 if a < b, 0 if equal.
 * Per semver: 1.0.0-rc.1 < 1.0.0 (pre-release < release)
 */
export function compareSemver(a: string, b: string): number {
  const [aVer, aPre] = splitVersion(a);
  const [bVer, bPre] = splitVersion(b);
  const pa = aVer.split('.').map(Number);
  const pb = bVer.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  // Same major.minor.patch: release > pre-release
  if (!aPre && !bPre) return 0;
  if (!aPre) return 1;
  if (!bPre) return -1;
  // Both have pre-release identifiers — compare left to right
  const aIds = aPre.split('.');
  const bIds = bPre.split('.');
  for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
    if (i >= aIds.length) return -1;
    if (i >= bIds.length) return 1;
    const aNum = parseInt(aIds[i], 10);
    const bNum = parseInt(bIds[i], 10);
    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);
    if (aIsNum && bIsNum) {
      if (aNum !== bNum) return aNum - bNum;
    } else if (aIsNum) {
      return -1;
    } else if (bIsNum) {
      return 1;
    } else {
      const cmp = aIds[i].localeCompare(bIds[i]);
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

/**
 * Where a build sits on the ladder from tested release to raw main. Users
 * pick a channel in Settings > System; the version check resolves "newest"
 * inside that channel only, so the picker never has to reason about a
 * nightly out-sorting a release candidate or vice versa.
 *
 *   stable   1.12.2                a tested release
 *   rc       1.13.0-rc.1           a release candidate, days from stable
 *   beta     1.13.0-beta.2         feature complete, still being shaken out
 *   nightly  1.12.3-dev.20260908   last night's main
 */
export type UpdateChannel = 'stable' | 'rc' | 'beta' | 'nightly';

/** Most stable first. The order is the inclusion order below. */
export const UPDATE_CHANNELS: readonly UpdateChannel[] = ['stable', 'rc', 'beta', 'nightly'];

const CHANNEL_RANK: Record<UpdateChannel, number> = { stable: 0, rc: 1, beta: 2, nightly: 3 };

/**
 * Classify a version (or tag) by shape:
 *   - no prerelease suffix  → stable   (1.12.2)
 *   - rc                    → rc       (1.13.0-rc.1)
 *   - beta                  → beta     (1.13.0-beta.2)
 *   - anything else         → nightly  (1.12.3-dev.20260908, 2.0.0-alpha)
 * Unknown suffixes, alpha included, land in nightly because that is the
 * least stable channel: a tag nobody deliberately shaped for a channel is a
 * test build, not a release.
 */
export function classifyVersion(version: string): UpdateChannel {
  const idx = version.indexOf('-');
  if (idx === -1) return 'stable';
  const id = version.substring(idx + 1).split('.')[0].toLowerCase();
  if (id === 'rc') return 'rc';
  if (id === 'beta') return 'beta';
  return 'nightly';
}

/**
 * Which builds a channel is offered. Inclusion is cumulative, not exclusive:
 * every channel also sees everything more stable than itself, so a user on
 * a prerelease line is still offered the next stable when it outranks what
 * they are running.
 */
export function channelIncludes(channel: UpdateChannel, version: string): boolean {
  return CHANNEL_RANK[classifyVersion(version)] <= CHANNEL_RANK[channel];
}

/**
 * Coerce a stored or query-string channel to a known one; anything else is
 * stable. The two-channel era's `dev` value is rewritten to `rc` on disk by
 * the v12 settings migration, so it needs no special case here.
 */
export function parseUpdateChannel(value: unknown): UpdateChannel {
  if (value === 'rc' || value === 'beta' || value === 'nightly') return value;
  return 'stable';
}
