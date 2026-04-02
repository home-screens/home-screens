import { describe, it, expect } from 'vitest';
import { compareSemver, isPrerelease } from '../semver';
import { parseVersionTags, releasesToTags, buildVersionInfo } from '../version';

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns positive when a > b', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.1.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.0.1', '1.0.0')).toBeGreaterThan(0);
  });

  it('returns negative when a < b', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(compareSemver('0.9.0', '1.0.0')).toBeLessThan(0);
  });

  it('handles multi-digit version numbers', () => {
    expect(compareSemver('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareSemver('10.0.0', '9.0.0')).toBeGreaterThan(0);
  });

  it('ranks pre-release below release of same version', () => {
    expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
    expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
  });

  it('compares pre-release identifiers numerically', () => {
    expect(compareSemver('1.0.0-rc.2', '1.0.0-rc.1')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0-rc.1', '1.0.0-rc.2')).toBeLessThan(0);
    expect(compareSemver('1.0.0-rc.10', '1.0.0-rc.9')).toBeGreaterThan(0);
  });

  it('pre-release of higher version beats release of lower', () => {
    expect(compareSemver('2.0.0-rc.1', '1.9.9')).toBeGreaterThan(0);
  });

  it('returns 0 for equal pre-release versions', () => {
    expect(compareSemver('1.0.0-rc.1', '1.0.0-rc.1')).toBe(0);
  });
});

describe('isPrerelease', () => {
  it('identifies pre-release versions', () => {
    expect(isPrerelease('1.0.0-rc.1')).toBe(true);
    expect(isPrerelease('1.0.0-beta.2')).toBe(true);
    expect(isPrerelease('1.0.0')).toBe(false);
    expect(isPrerelease('0.14.7')).toBe(false);
  });
});

describe('parseVersionTags', () => {
  it('parses standard git show-ref output', () => {
    const input = [
      'abc1234abc1234abc1234abc1234abc1234abc1234 refs/tags/v0.1.0',
      'def5678def5678def5678def5678def5678def5678 refs/tags/v0.2.0',
      'aaa9012aaa9012aaa9012aaa9012aaa9012aaa9012 refs/tags/v1.0.0',
    ].join('\n');

    const tags = parseVersionTags(input);
    expect(tags).toHaveLength(3);
    // Should be sorted descending
    expect(tags[0].version).toBe('1.0.0');
    expect(tags[1].version).toBe('0.2.0');
    expect(tags[2].version).toBe('0.1.0');
  });

  it('ignores non-version tags', () => {
    const input = [
      'abc1234abc1234abc1234abc1234abc1234abc1234 refs/tags/v0.1.0',
      'def5678def5678def5678def5678def5678def5678 refs/tags/latest',
      'aaa9012aaa9012aaa9012aaa9012aaa9012aaa9012 refs/tags/release-candidate',
    ].join('\n');

    const tags = parseVersionTags(input);
    expect(tags).toHaveLength(1);
    expect(tags[0].tag).toBe('v0.1.0');
  });

  it('handles tags without v prefix', () => {
    const input = 'abc1234abc1234abc1234abc1234abc1234abc1234 refs/tags/1.0.0\n';
    const tags = parseVersionTags(input);
    expect(tags).toHaveLength(1);
    expect(tags[0].version).toBe('1.0.0');
  });

  it('handles empty input', () => {
    expect(parseVersionTags('')).toHaveLength(0);
  });

  it('sorts pre-release tags correctly', () => {
    const input = [
      'abc1234abc1234abc1234abc1234abc1234abc1234 refs/tags/v0.15.0-rc.1',
      'def5678def5678def5678def5678def5678def5678 refs/tags/v0.15.0',
      'aaa9012aaa9012aaa9012aaa9012aaa9012aaa9012 refs/tags/v0.14.7',
    ].join('\n');
    const tags = parseVersionTags(input);
    expect(tags).toHaveLength(3);
    expect(tags[0].version).toBe('0.15.0');
    expect(tags[1].version).toBe('0.15.0-rc.1');
    expect(tags[2].version).toBe('0.14.7');
  });
});

// ---------------------------------------------------------------------------
// releasesToTags
// ---------------------------------------------------------------------------

describe('releasesToTags', () => {
  function makeRelease(tag_name: string, assetNames: string[] = []) {
    return {
      tag_name,
      name: tag_name,
      body: '',
      draft: false,
      prerelease: false,
      published_at: '2024-01-01T00:00:00Z',
      assets: assetNames.map((name) => ({ name, browser_download_url: `https://example.com/${name}` })),
    };
  }

  it('converts GitHub releases to tag objects', () => {
    const releases = [
      makeRelease('v1.0.0', ['home-screens-v1.0.0.tar.gz']),
      makeRelease('v0.9.0'),
    ];

    const tags = releasesToTags(releases);
    expect(tags).toHaveLength(2);
    // Sorted descending by semver
    expect(tags[0].tag).toBe('v1.0.0');
    expect(tags[0].version).toBe('1.0.0');
    expect(tags[0].commit).toBe('');
    expect(tags[0].hasTarball).toBe(true);
    expect(tags[1].tag).toBe('v0.9.0');
    expect(tags[1].version).toBe('0.9.0');
    expect(tags[1].hasTarball).toBe(false);
  });

  it('handles empty releases array', () => {
    const tags = releasesToTags([]);
    expect(tags).toEqual([]);
  });

  it('sorts releases by semver descending', () => {
    const releases = [
      makeRelease('v0.1.0'),
      makeRelease('v1.0.0'),
      makeRelease('v0.5.0'),
    ];

    const tags = releasesToTags(releases);
    expect(tags[0].version).toBe('1.0.0');
    expect(tags[1].version).toBe('0.5.0');
    expect(tags[2].version).toBe('0.1.0');
  });
});

// ---------------------------------------------------------------------------
// buildVersionInfo
// ---------------------------------------------------------------------------

describe('buildVersionInfo', () => {
  const sampleTags = [
    { tag: 'v2.0.0', version: '2.0.0', commit: 'abc1234' },
    { tag: 'v1.5.0', version: '1.5.0', commit: 'def5678' },
    { tag: 'v1.0.0', version: '1.0.0', commit: 'aaa9012' },
  ];

  it('returns updateAvailable=true when latest tag > current version', () => {
    const info = buildVersionInfo(sampleTags, '1.5.0', 'ccc3456', 'git', 'main');
    expect(info.updateAvailable).toBe(true);
    expect(info.latest).toBe('2.0.0');
    expect(info.latestCommit).toBe('abc1234');
  });

  it('returns updateAvailable=false when current is latest', () => {
    const info = buildVersionInfo(sampleTags, '2.0.0', 'abc1234', 'git', 'main');
    expect(info.updateAvailable).toBe(false);
  });

  it('returns correct latestVersion from first tag', () => {
    const info = buildVersionInfo(sampleTags, '1.0.0', 'aaa9012', 'git', 'main');
    expect(info.latest).toBe('2.0.0');
  });

  it('handles empty tags array', () => {
    const info = buildVersionInfo([], '1.0.0', 'unknown', 'unknown', 'unknown');
    expect(info.updateAvailable).toBe(false);
    expect(info.latest).toBeNull();
    expect(info.latestCommit).toBeNull();
  });

  it('populates installedVia and branch in result', () => {
    const info = buildVersionInfo(sampleTags, '1.0.0', 'ccc3456', 'tarball', 'release');
    expect(info.installedVia).toBe('tarball');
    expect(info.channel).toBe('release');
    expect(info.current).toBe('1.0.0');
    expect(info.currentCommit).toBe('ccc3456');
  });
});
