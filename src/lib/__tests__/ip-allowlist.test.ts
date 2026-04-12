import { describe, it, expect } from 'vitest';
import { normalizeIp, validateCidr, isIpAllowed } from '../ip-allowlist';

describe('normalizeIp', () => {
  it('returns IPv4 addresses unchanged', () => {
    expect(normalizeIp('192.168.1.1')).toBe('192.168.1.1');
  });

  it('strips IPv4-mapped IPv6 prefix', () => {
    expect(normalizeIp('::ffff:192.168.1.1')).toBe('192.168.1.1');
  });

  it('strips IPv4-mapped IPv6 prefix (uppercase)', () => {
    expect(normalizeIp('::FFFF:10.0.0.1')).toBe('10.0.0.1');
  });

  it('returns "unknown" unchanged', () => {
    expect(normalizeIp('unknown')).toBe('unknown');
  });

  it('returns loopback unchanged', () => {
    expect(normalizeIp('127.0.0.1')).toBe('127.0.0.1');
  });

  it('strips mapped loopback', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('validateCidr', () => {
  it('accepts a plain IPv4 address', () => {
    expect(validateCidr('192.168.1.1')).toBeNull();
  });

  it('accepts CIDR notation', () => {
    expect(validateCidr('192.168.1.0/24')).toBeNull();
  });

  it('accepts /32 explicitly', () => {
    expect(validateCidr('10.0.0.1/32')).toBeNull();
  });

  it('accepts /0 (all IPs)', () => {
    expect(validateCidr('0.0.0.0/0')).toBeNull();
  });

  it('rejects invalid IP', () => {
    expect(validateCidr('999.999.999.999')).toBe('Invalid IP address');
  });

  it('rejects non-numeric prefix', () => {
    expect(validateCidr('192.168.1.0/abc')).toBe('Invalid prefix length');
  });

  it('rejects prefix > 32', () => {
    expect(validateCidr('192.168.1.0/33')).toBe('Prefix length must be 0-32');
  });

  it('rejects negative prefix', () => {
    expect(validateCidr('192.168.1.0/-1')).toBe('Invalid prefix length');
  });

  it('rejects empty string', () => {
    expect(validateCidr('')).toBe('Invalid IP address');
  });

  it('rejects garbage', () => {
    expect(validateCidr('not-an-ip')).toBe('Invalid IP address');
  });

  it('rejects double slash', () => {
    expect(validateCidr('192.168.1.0/24/8')).toBe('Invalid CIDR format');
  });
});

describe('isIpAllowed', () => {
  it('returns false for empty allowlist', () => {
    expect(isIpAllowed('192.168.1.1', [])).toBe(false);
  });

  it('matches exact IP (treated as /32)', () => {
    expect(isIpAllowed('192.168.1.50', ['192.168.1.50'])).toBe(true);
  });

  it('rejects different IP against exact entry', () => {
    expect(isIpAllowed('192.168.1.51', ['192.168.1.50'])).toBe(false);
  });

  it('matches IP within /24 subnet', () => {
    expect(isIpAllowed('192.168.1.100', ['192.168.1.0/24'])).toBe(true);
  });

  it('rejects IP outside /24 subnet', () => {
    expect(isIpAllowed('192.168.2.1', ['192.168.1.0/24'])).toBe(false);
  });

  it('matches IP within /16 subnet', () => {
    expect(isIpAllowed('10.0.99.1', ['10.0.0.0/16'])).toBe(true);
  });

  it('rejects IP outside /16 subnet', () => {
    expect(isIpAllowed('10.1.0.1', ['10.0.0.0/16'])).toBe(false);
  });

  it('matches against any entry in the list', () => {
    expect(isIpAllowed('10.0.0.5', ['192.168.1.0/24', '10.0.0.0/8'])).toBe(true);
  });

  it('normalizes IPv4-mapped IPv6 before matching', () => {
    expect(isIpAllowed('::ffff:192.168.1.50', ['192.168.1.0/24'])).toBe(true);
  });

  it('returns true for /0 (match all)', () => {
    expect(isIpAllowed('8.8.8.8', ['0.0.0.0/0'])).toBe(true);
  });

  it('returns false for "unknown" IP', () => {
    expect(isIpAllowed('unknown', ['192.168.1.0/24'])).toBe(false);
  });

  it('handles /32 CIDR explicitly', () => {
    expect(isIpAllowed('192.168.1.1', ['192.168.1.1/32'])).toBe(true);
    expect(isIpAllowed('192.168.1.2', ['192.168.1.1/32'])).toBe(false);
  });

  // Fail-safe behavior: garbage in the allowlist must never match any IP.
  // A hand-edited auth.json with a typo like "foo/24" should not silently
  // grant access — it should be skipped as an invalid entry.
  describe('fail-safe: garbage entries are skipped', () => {
    it('skips non-IP entries without matching anything', () => {
      expect(isIpAllowed('192.168.1.1', ['foo/24'])).toBe(false);
      expect(isIpAllowed('0.0.0.1', ['foo/24'])).toBe(false);
    });

    it('skips empty string entries', () => {
      expect(isIpAllowed('192.168.1.1', ['', '192.168.1.0/24'])).toBe(true);
      expect(isIpAllowed('10.0.0.1', [''])).toBe(false);
    });

    it('skips entries with out-of-range prefix lengths', () => {
      expect(isIpAllowed('192.168.1.1', ['192.168.1.0/33'])).toBe(false);
      expect(isIpAllowed('192.168.1.1', ['192.168.1.0/99'])).toBe(false);
    });

    it('skips entries with negative prefix lengths', () => {
      expect(isIpAllowed('192.168.1.1', ['192.168.1.0/-1'])).toBe(false);
    });

    it('skips entries with non-numeric prefix', () => {
      expect(isIpAllowed('192.168.1.1', ['192.168.1.0/abc'])).toBe(false);
    });

    it('still matches valid entries when garbage entries exist alongside them', () => {
      expect(isIpAllowed('192.168.1.50', ['garbage', '192.168.1.0/24', 'also-bad/16'])).toBe(true);
    });

    it('returns false for non-IPv4 client address', () => {
      expect(isIpAllowed('::1', ['0.0.0.0/0'])).toBe(false);
    });

    it('skips entries with floating-point prefix', () => {
      expect(isIpAllowed('192.168.1.1', ['192.168.1.0/24.5'])).toBe(false);
    });
  });
});
