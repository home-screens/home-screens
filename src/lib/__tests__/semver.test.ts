import { describe, it, expect } from 'vitest';
import { compareSemver, isPrerelease } from '../semver';

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
