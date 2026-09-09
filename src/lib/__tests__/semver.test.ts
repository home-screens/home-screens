import { describe, it, expect } from 'vitest';
import { channelIncludes, classifyVersion, compareSemver, isPrerelease, parseUpdateChannel } from '../semver';

describe('isPrerelease', () => {
  it('returns false for stable versions', () => {
    expect(isPrerelease('1.0.0')).toBe(false);
    expect(isPrerelease('0.20.0')).toBe(false);
  });

  it('returns true for pre-release versions', () => {
    expect(isPrerelease('1.0.0-rc.1')).toBe(true);
    expect(isPrerelease('0.15.0-beta.2')).toBe(true);
    expect(isPrerelease('2.0.0-alpha')).toBe(true);
  });
});

describe('compareSemver', () => {
  describe('basic version ordering', () => {
    it('returns 0 for equal versions', () => {
      expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
      expect(compareSemver('0.20.0', '0.20.0')).toBe(0);
    });

    it('compares major versions', () => {
      expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0);
      expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
    });

    it('compares minor versions', () => {
      expect(compareSemver('1.2.0', '1.1.0')).toBeGreaterThan(0);
      expect(compareSemver('1.1.0', '1.2.0')).toBeLessThan(0);
    });

    it('compares patch versions', () => {
      expect(compareSemver('1.0.2', '1.0.1')).toBeGreaterThan(0);
      expect(compareSemver('1.0.1', '1.0.2')).toBeLessThan(0);
    });

    it('major takes precedence over minor and patch', () => {
      expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
    });

    it('minor takes precedence over patch', () => {
      expect(compareSemver('1.2.0', '1.1.99')).toBeGreaterThan(0);
    });
  });

  describe('pre-release ordering', () => {
    it('release is greater than pre-release with same version', () => {
      expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBeGreaterThan(0);
      expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBeLessThan(0);
    });

    it('compares numeric pre-release identifiers', () => {
      expect(compareSemver('1.0.0-rc.2', '1.0.0-rc.1')).toBeGreaterThan(0);
      expect(compareSemver('1.0.0-rc.1', '1.0.0-rc.2')).toBeLessThan(0);
    });

    it('returns 0 for equal pre-release versions', () => {
      expect(compareSemver('1.0.0-rc.1', '1.0.0-rc.1')).toBe(0);
    });

    it('compares string pre-release identifiers lexically', () => {
      expect(compareSemver('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0);
      expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0);
    });

    it('numeric identifiers sort before string identifiers', () => {
      // Per semver spec: numeric ids have lower precedence than string ids
      expect(compareSemver('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0);
    });

    it('shorter pre-release has lower precedence when prefix matches', () => {
      expect(compareSemver('1.0.0-rc', '1.0.0-rc.1')).toBeLessThan(0);
      expect(compareSemver('1.0.0-rc.1', '1.0.0-rc')).toBeGreaterThan(0);
    });

    it('higher version beats any pre-release of lower version', () => {
      expect(compareSemver('1.1.0-alpha', '1.0.0')).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('handles two-part versions (missing patch)', () => {
      expect(compareSemver('1.0', '1.0.0')).toBe(0);
    });

    it('handles single-part versions', () => {
      expect(compareSemver('2', '1')).toBeGreaterThan(0);
    });

    it('handles version 0.0.0', () => {
      expect(compareSemver('0.0.0', '0.0.1')).toBeLessThan(0);
    });
  });
});

describe('classifyVersion', () => {
  it('reads a bare version as stable', () => {
    expect(classifyVersion('1.12.2')).toBe('stable');
    expect(classifyVersion('0.1.0')).toBe('stable');
  });

  it('reads release candidates as rc and betas as beta', () => {
    expect(classifyVersion('1.13.0-rc.1')).toBe('rc');
    expect(classifyVersion('1.13.0-RC.1')).toBe('rc');
    expect(classifyVersion('1.13.0-beta.2')).toBe('beta');
  });

  it('reads dev builds, alphas and any unknown suffix as nightly', () => {
    expect(classifyVersion('1.12.3-dev.20260908')).toBe('nightly');
    expect(classifyVersion('1.12.3-dev.20260908.2')).toBe('nightly');
    expect(classifyVersion('2.0.0-alpha')).toBe('nightly');
    expect(classifyVersion('1.2.3-test')).toBe('nightly');
  });
});

describe('channelIncludes', () => {
  it('stable sees stable only', () => {
    expect(channelIncludes('stable', '1.12.2')).toBe(true);
    expect(channelIncludes('stable', '1.13.0-rc.1')).toBe(false);
    expect(channelIncludes('stable', '1.13.0-beta.1')).toBe(false);
    expect(channelIncludes('stable', '1.12.3-dev.20260908')).toBe(false);
  });

  it('rc sees candidates and stable, not betas', () => {
    expect(channelIncludes('rc', '1.12.2')).toBe(true);
    expect(channelIncludes('rc', '1.13.0-rc.1')).toBe(true);
    expect(channelIncludes('rc', '1.13.0-beta.1')).toBe(false);
    expect(channelIncludes('rc', '1.12.3-dev.20260908')).toBe(false);
  });

  it('beta sees betas, candidates and stable', () => {
    expect(channelIncludes('beta', '1.12.2')).toBe(true);
    expect(channelIncludes('beta', '1.13.0-rc.1')).toBe(true);
    expect(channelIncludes('beta', '1.13.0-beta.1')).toBe(true);
    expect(channelIncludes('beta', '1.12.3-dev.20260908')).toBe(false);
  });

  it('nightly sees everything', () => {
    expect(channelIncludes('nightly', '1.12.2')).toBe(true);
    expect(channelIncludes('nightly', '1.13.0-rc.1')).toBe(true);
    expect(channelIncludes('nightly', '1.13.0-beta.1')).toBe(true);
    expect(channelIncludes('nightly', '1.12.3-dev.20260908')).toBe(true);
  });
});

describe('parseUpdateChannel', () => {
  it('passes the four known channels through', () => {
    expect(parseUpdateChannel('stable')).toBe('stable');
    expect(parseUpdateChannel('rc')).toBe('rc');
    expect(parseUpdateChannel('beta')).toBe('beta');
    expect(parseUpdateChannel('nightly')).toBe('nightly');
  });

  it('falls back to stable for anything else', () => {
    expect(parseUpdateChannel(undefined)).toBe('stable');
    expect(parseUpdateChannel(null)).toBe('stable');
    expect(parseUpdateChannel('canary')).toBe('stable');
    // The two-channel era's value is migrated on disk (v12), not coerced here.
    expect(parseUpdateChannel('dev')).toBe('stable');
    expect(parseUpdateChannel(42)).toBe('stable');
  });
});

describe('compareSemver across nightly stamps', () => {
  it('orders date-stamped nightlies by date, then by same-day run', () => {
    expect(compareSemver('1.12.3-dev.20260909', '1.12.3-dev.20260908')).toBeGreaterThan(0);
    expect(compareSemver('1.12.3-dev.20260908.2', '1.12.3-dev.20260908')).toBeGreaterThan(0);
  });

  it('keeps a nightly cut after a release above that release and its candidates', () => {
    // The nightly base is the next patch above the newest tag, so a build
    // from main after v1.13.0-rc.1 outranks the candidate and the release.
    expect(compareSemver('1.13.1-dev.20260908', '1.13.0-rc.1')).toBeGreaterThan(0);
    expect(compareSemver('1.13.1-dev.20260908', '1.13.0')).toBeGreaterThan(0);
  });

  it('orders a beta below the candidate and release of the same version', () => {
    expect(compareSemver('1.13.0-beta.2', '1.13.0-rc.1')).toBeLessThan(0);
    expect(compareSemver('1.13.0-beta.2', '1.13.0')).toBeLessThan(0);
    expect(compareSemver('1.13.0-beta.2', '1.13.0-beta.1')).toBeGreaterThan(0);
  });
});
