import { describe, it, expect } from 'vitest';
import {
  latestVersion,
  hasUpdate,
  isVersionCompatible,
  resolveChannel,
  isBetaHiddenEntry,
  isBetaOnlyForNonOptedUser,
  sortVersionsDesc,
} from '@/lib/plugin-versions';
import type { RegistryPluginVersion } from '@/types/plugins';

function entry(version: string, minAppVersion = '0.0.0'): RegistryPluginVersion {
  return {
    version,
    minAppVersion,
    releaseDate: '2026-01-01',
    downloadUrl: `https://example.com/${version}.tgz`,
    sha256: 'a'.repeat(64),
  };
}

function betaEntry(version: string, minAppVersion = '0.0.0'): RegistryPluginVersion {
  return { ...entry(version, minAppVersion), channel: 'beta' };
}

describe('latestVersion', () => {
  it('picks the highest version from an ascending array (the Garmin regression)', () => {
    const plugin = { versions: [entry('1.1.0'), entry('1.2.0')] };
    expect(latestVersion(plugin)?.version).toBe('1.2.0');
  });

  it('picks the same version from a descending array — order is irrelevant', () => {
    const plugin = { versions: [entry('1.2.0'), entry('1.1.0')] };
    expect(latestVersion(plugin)?.version).toBe('1.2.0');
  });

  it('ranks a pre-release above older releases but below its final release', () => {
    expect(latestVersion({ versions: [entry('1.2.0-rc.1'), entry('1.1.0')] })?.version)
      .toBe('1.2.0-rc.1');
    expect(latestVersion({ versions: [entry('1.2.0-rc.1'), entry('1.2.0'), entry('1.1.0')] })?.version)
      .toBe('1.2.0');
  });

  it('skips entries whose minAppVersion exceeds the app version', () => {
    const plugin = { versions: [entry('1.1.0', '1.0.0'), entry('2.0.0', '2.0.0')] };
    expect(latestVersion(plugin, '1.7.1')?.version).toBe('1.1.0');
  });

  it('returns null when every entry is incompatible', () => {
    const plugin = { versions: [entry('2.0.0', '2.0.0'), entry('2.1.0', '2.0.0')] };
    expect(latestVersion(plugin, '1.7.1')).toBeNull();
  });

  it('does not filter when appVersion is omitted', () => {
    const plugin = { versions: [entry('2.0.0', '9.9.9')] };
    expect(latestVersion(plugin)?.version).toBe('2.0.0');
  });

  it('returns null for an empty versions array', () => {
    expect(latestVersion({ versions: [] })).toBeNull();
  });

  it('ignores channel entirely for an all-stable array with no opts (regression guard)', () => {
    const plugin = { versions: [entry('1.1.0'), entry('1.2.0')] };
    expect(latestVersion(plugin)?.version).toBe('1.2.0');
    expect(latestVersion(plugin, undefined, {})?.version).toBe('1.2.0');
    expect(latestVersion(plugin, undefined, { includeBeta: false })?.version).toBe('1.2.0');
  });

  it('excludes a semver-highest beta when includeBeta is omitted/false, next stable wins', () => {
    const plugin = { versions: [entry('1.2.0'), betaEntry('1.3.0')] };
    expect(latestVersion(plugin)?.version).toBe('1.2.0');
    expect(latestVersion(plugin, undefined, { includeBeta: false })?.version).toBe('1.2.0');
  });

  it('lets the semver-highest beta win when includeBeta is true', () => {
    const plugin = { versions: [entry('1.2.0'), betaEntry('1.3.0')] };
    const winner = latestVersion(plugin, undefined, { includeBeta: true });
    expect(winner?.version).toBe('1.3.0');
    expect(winner?.channel).toBe('beta');
  });

  it('returns null when the only version is beta and includeBeta is false', () => {
    const plugin = { versions: [betaEntry('1.0.0')] };
    expect(latestVersion(plugin)).toBeNull();
    expect(latestVersion(plugin, undefined, { includeBeta: false })).toBeNull();
    expect(latestVersion(plugin, undefined, { includeBeta: true })?.version).toBe('1.0.0');
  });

  it('ranks a graduated stable release above its own prerelease regardless of order (graduation is free)', () => {
    // Stable prepended above the beta — array order must not decide the winner.
    const plugin = { versions: [entry('1.3.0'), betaEntry('1.3.0-beta.2')] };
    expect(latestVersion(plugin, undefined, { includeBeta: true })?.version).toBe('1.3.0');
    // Same array, reversed order.
    const reversed = { versions: [betaEntry('1.3.0-beta.2'), entry('1.3.0')] };
    expect(latestVersion(reversed, undefined, { includeBeta: true })?.version).toBe('1.3.0');
    // And with betas excluded, the stable release still wins.
    expect(latestVersion(plugin, undefined, { includeBeta: false })?.version).toBe('1.3.0');
  });
});

describe('hasUpdate', () => {
  it('returns true when a newer compatible version exists', () => {
    const plugin = { versions: [entry('1.1.0'), entry('1.2.0')] };
    expect(hasUpdate(plugin, '1.1.0', '1.7.1')).toBe(true);
  });

  it('returns false when installed matches the latest', () => {
    const plugin = { versions: [entry('1.1.0'), entry('1.2.0')] };
    expect(hasUpdate(plugin, '1.2.0')).toBe(false);
  });

  it('returns false when the registry only has OLDER versions (regression guard for !==)', () => {
    const plugin = { versions: [entry('1.1.0')] };
    expect(hasUpdate(plugin, '1.2.0')).toBe(false);
  });

  it('returns false when the newer version needs a newer app', () => {
    const plugin = { versions: [entry('1.1.0', '1.0.0'), entry('1.2.0', '2.0.0')] };
    expect(hasUpdate(plugin, '1.1.0', '1.7.1')).toBe(false);
  });

  it('returns false for an empty versions array', () => {
    expect(hasUpdate({ versions: [] }, '1.0.0')).toBe(false);
  });

  it('sees a newer beta as an update only when includeBeta is passed through', () => {
    const plugin = { versions: [betaEntry('1.2.0-beta.1'), betaEntry('1.2.0-beta.2')] };
    expect(hasUpdate(plugin, '1.2.0-beta.1', undefined, { includeBeta: true })).toBe(true);
    expect(hasUpdate(plugin, '1.2.0-beta.1')).toBe(false);
    expect(hasUpdate(plugin, '1.2.0-beta.1', undefined, { includeBeta: false })).toBe(false);
  });
});

describe('isVersionCompatible', () => {
  it('accepts when the app meets or exceeds minAppVersion', () => {
    expect(isVersionCompatible(entry('1.0.0', '1.7.1'), '1.7.1')).toBe(true);
    expect(isVersionCompatible(entry('1.0.0', '1.7.0'), '1.7.1')).toBe(true);
  });

  it('rejects when the app is older than minAppVersion', () => {
    expect(isVersionCompatible(entry('1.0.0', '2.0.0'), '1.7.1')).toBe(false);
  });

  it('accepts a prerelease app build against a minAppVersion equal to its own release line', () => {
    // Per semver, "1.8.0-rc.0" < "1.8.0" — but an RC of 1.8.0 should satisfy a
    // plugin requiring 1.8.0, not be treated as an older, incompatible build.
    expect(isVersionCompatible(entry('1.0.0', '1.8.0'), '1.8.0-rc.0')).toBe(true);
  });

  it('still rejects a prerelease app build older than minAppVersion', () => {
    expect(isVersionCompatible(entry('1.0.0', '1.8.0'), '1.7.0-rc.0')).toBe(false);
  });

  it('accepts when appVersion or minAppVersion is missing/empty', () => {
    expect(isVersionCompatible(entry('1.0.0', '2.0.0'))).toBe(true);
    expect(isVersionCompatible(entry('1.0.0', '2.0.0'), '')).toBe(true);
    expect(isVersionCompatible({ minAppVersion: '' }, '1.7.1')).toBe(true);
  });

  it('treats an unparsable minAppVersion as no constraint instead of failing closed', () => {
    // compareSemver returns NaN for non-numeric segments; NaN >= 0 is false,
    // so without the guard a typo'd constraint would block every install.
    expect(isVersionCompatible(entry('1.0.0', 'v2.0.0'), '1.7.1')).toBe(true);
    expect(isVersionCompatible(entry('1.0.0', 'not-a-version'), '1.7.1')).toBe(true);
  });

  it('treats an unparsable appVersion as no constraint', () => {
    expect(isVersionCompatible(entry('1.0.0', '2.0.0'), 'dev')).toBe(true);
  });
});

describe('resolveChannel', () => {
  it('is stable when neither the plugin nor the version declares a channel', () => {
    expect(resolveChannel({}, entry('1.0.0'))).toBe('stable');
    expect(resolveChannel({}, null)).toBe('stable');
    expect(resolveChannel(undefined, undefined)).toBe('stable');
  });

  it('is beta when the plugin-level channel is beta, even if the version has none', () => {
    expect(resolveChannel({ channel: 'beta' }, entry('1.0.0'))).toBe('beta');
  });

  it('is beta when only the version-level channel is beta', () => {
    expect(resolveChannel({}, betaEntry('1.0.0'))).toBe('beta');
  });

  it('is beta when both the plugin and version declare beta', () => {
    expect(resolveChannel({ channel: 'beta' }, betaEntry('1.0.0'))).toBe('beta');
  });
});

describe('isBetaHiddenEntry', () => {
  it('hides a beta-channel plugin from non-opted users', () => {
    expect(isBetaHiddenEntry({ channel: 'beta' }, false)).toBe(true);
  });

  it('shows a beta-channel plugin to opted-in users', () => {
    expect(isBetaHiddenEntry({ channel: 'beta' }, true)).toBe(false);
  });

  it('never hides a stable-channel plugin', () => {
    expect(isBetaHiddenEntry({}, false)).toBe(false);
    expect(isBetaHiddenEntry({}, true)).toBe(false);
  });
});

describe('isBetaOnlyForNonOptedUser', () => {
  it('hides a stable plugin whose only offered version is beta, when not opted in', () => {
    const plugin = { versions: [betaEntry('2.0.0-beta.1')] };
    expect(isBetaOnlyForNonOptedUser(plugin, undefined, false)).toBe(true);
  });

  it('shows it once opted in', () => {
    const plugin = { versions: [betaEntry('2.0.0-beta.1')] };
    expect(isBetaOnlyForNonOptedUser(plugin, undefined, true)).toBe(false);
  });

  it('never hides a plugin that has a stable version on offer', () => {
    const plugin = { versions: [entry('1.0.0'), betaEntry('2.0.0-beta.1')] };
    expect(isBetaOnlyForNonOptedUser(plugin, undefined, false)).toBe(false);
  });

  it('does not treat a minAppVersion-incompatible entry as beta-only (stays visible, disabled)', () => {
    const plugin = { versions: [entry('1.0.0', '99.0.0')] };
    expect(isBetaOnlyForNonOptedUser(plugin, '1.7.1', false)).toBe(false);
  });
});

describe('sortVersionsDesc', () => {
  it('sorts newest first regardless of registry array order', () => {
    const sorted = sortVersionsDesc([entry('1.1.0'), entry('2.0.0'), entry('1.0.0')]);
    expect(sorted.map((v) => v.version)).toEqual(['2.0.0', '1.1.0', '1.0.0']);
  });

  it('ranks a prerelease below its release', () => {
    const sorted = sortVersionsDesc([entry('2.0.0-beta.1'), entry('2.0.0')]);
    expect(sorted.map((v) => v.version)).toEqual(['2.0.0', '2.0.0-beta.1']);
  });

  it('does not mutate the input array', () => {
    const input = [entry('1.0.0'), entry('2.0.0')];
    sortVersionsDesc(input);
    expect(input.map((v) => v.version)).toEqual(['1.0.0', '2.0.0']);
  });
});
