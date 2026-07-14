import { describe, it, expect } from 'vitest';
import { latestVersion, hasUpdate, isVersionCompatible } from '@/lib/plugin-versions';
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
});

describe('isVersionCompatible', () => {
  it('accepts when the app meets or exceeds minAppVersion', () => {
    expect(isVersionCompatible(entry('1.0.0', '1.7.1'), '1.7.1')).toBe(true);
    expect(isVersionCompatible(entry('1.0.0', '1.7.0'), '1.7.1')).toBe(true);
  });

  it('rejects when the app is older than minAppVersion', () => {
    expect(isVersionCompatible(entry('1.0.0', '2.0.0'), '1.7.1')).toBe(false);
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
