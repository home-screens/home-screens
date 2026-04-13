import { describe, expect, it } from 'vitest';
import {
  validateSSID,
  validateWPAPassword,
  validateInterfaceRegex,
  validateInterface,
  validateUUID,
  validateIPv4,
  validateCIDRPrefix,
  validateHostname,
} from '@/lib/network-validation';

/* ─── SSID ────────────────────────────────────── */

describe('validateSSID', () => {
  it('accepts a simple ASCII SSID', () => {
    expect(validateSSID('MyNetwork')).toEqual({ valid: true });
  });

  it('accepts a 32-byte ASCII SSID', () => {
    const ssid = 'a'.repeat(32);
    expect(validateSSID(ssid)).toEqual({ valid: true });
  });

  it('accepts a 1-character SSID', () => {
    expect(validateSSID('x')).toEqual({ valid: true });
  });

  it('rejects an empty SSID', () => {
    const result = validateSSID('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects a 33-byte ASCII SSID', () => {
    const ssid = 'a'.repeat(33);
    const result = validateSSID(ssid);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/32 bytes/);
  });

  it('rejects an SSID containing null bytes', () => {
    const result = validateSSID('net\0work');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/null/i);
  });

  it('accepts Unicode SSIDs within 32 bytes', () => {
    // "café" = 5 chars but 6 bytes (é = 2 bytes in UTF-8)
    expect(validateSSID('café')).toEqual({ valid: true });
  });

  it('rejects Unicode SSIDs over 32 bytes', () => {
    // Each emoji is 4 bytes in UTF-8 → 9 emoji = 36 bytes
    const ssid = '🏠'.repeat(9);
    const result = validateSSID(ssid);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/32 bytes/);
  });

  it('accepts emoji SSIDs within 32 bytes', () => {
    // 8 emoji = 32 bytes exactly
    const ssid = '🏠'.repeat(8);
    expect(validateSSID(ssid)).toEqual({ valid: true });
  });

  it('accepts SSIDs with spaces', () => {
    expect(validateSSID('My Home Network')).toEqual({ valid: true });
  });

  it('accepts SSIDs with special characters', () => {
    expect(validateSSID('Net-Work_2.4GHz!')).toEqual({ valid: true });
  });
});

/* ─── WPA Password ────────────────────────────── */

describe('validateWPAPassword', () => {
  it('accepts an 8-character password', () => {
    expect(validateWPAPassword('abcd1234')).toEqual({ valid: true });
  });

  it('accepts a 63-character password', () => {
    expect(validateWPAPassword('a'.repeat(63))).toEqual({ valid: true });
  });

  it('rejects a 7-character password', () => {
    const result = validateWPAPassword('abcd123');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least 8/);
  });

  it('rejects a 64-character password', () => {
    const result = validateWPAPassword('a'.repeat(64));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at most 63/);
  });

  it('rejects an empty password', () => {
    const result = validateWPAPassword('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least 8/);
  });

  it('accepts all printable ASCII characters', () => {
    // Space (0x20) through tilde (0x7e)
    const printable = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    expect(validateWPAPassword(printable)).toEqual({ valid: true });
  });

  it('rejects non-ASCII characters (0x80+)', () => {
    const result = validateWPAPassword('café1234');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/printable ASCII/);
  });

  it('rejects control characters', () => {
    const result = validateWPAPassword('abcd\t1234');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/printable ASCII/);
    expect(result.error).toMatch(/0x09/); // tab
  });

  it('rejects null bytes', () => {
    const result = validateWPAPassword('abcd\x001234');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/printable ASCII/);
  });

  it('rejects DEL character (0x7f)', () => {
    const result = validateWPAPassword('abcd123\x7f');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/printable ASCII/);
  });

  it('accepts password with spaces', () => {
    expect(validateWPAPassword('my secret password')).toEqual({ valid: true });
  });
});

/* ─── Interface name (regex fallback) ─────────── */

describe('validateInterfaceRegex', () => {
  it.each([
    'eth0',
    'wlan0',
    'enp1s0',
    'enxb827eb123456',
    'lo',
    'br-lan',
    'wlp2s0',
    'docker0',
  ])('accepts valid interface name: %s', (iface) => {
    expect(validateInterfaceRegex(iface)).toEqual({ valid: true });
  });

  it('accepts interface name at max length (15 chars)', () => {
    expect(validateInterfaceRegex('a'.repeat(15))).toEqual({ valid: true });
  });

  it('rejects interface name over 15 chars', () => {
    const result = validateInterfaceRegex('a'.repeat(16));
    expect(result.valid).toBe(false);
  });

  it('rejects empty string', () => {
    const result = validateInterfaceRegex('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects names starting with a number', () => {
    const result = validateInterfaceRegex('0eth');
    expect(result.valid).toBe(false);
  });

  it('rejects names with special characters', () => {
    expect(validateInterfaceRegex('eth0;reboot').valid).toBe(false);
    expect(validateInterfaceRegex('wlan0 && echo').valid).toBe(false);
    expect(validateInterfaceRegex('eth.0').valid).toBe(false);
  });

  it('rejects path traversal attempts', () => {
    expect(validateInterfaceRegex('../../etc').valid).toBe(false);
    expect(validateInterfaceRegex('../passwd').valid).toBe(false);
  });

  it('rejects names with slashes', () => {
    expect(validateInterfaceRegex('/dev/null').valid).toBe(false);
  });

  it('rejects names with spaces', () => {
    expect(validateInterfaceRegex('eth 0').valid).toBe(false);
  });
});

/* ─── Interface name (whitelist) ──────────────── */

describe('validateInterface', () => {
  const knownInterfaces = ['eth0', 'wlan0', 'lo'];

  it('accepts a known interface', () => {
    expect(validateInterface('eth0', knownInterfaces)).toEqual({ valid: true });
  });

  it('rejects an unknown interface', () => {
    const result = validateInterface('wlan1', knownInterfaces);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Unknown interface/);
    expect(result.error).toMatch(/wlan1/);
    expect(result.error).toMatch(/eth0/);
  });

  it('rejects malformed names even if somehow in the list', () => {
    // Regex check runs first
    const result = validateInterface('../../etc', ['../../etc']);
    expect(result.valid).toBe(false);
  });

  it('handles empty known-interfaces list', () => {
    const result = validateInterface('eth0', []);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/\(none\)/);
  });
});

/* ─── Connection UUID ─────────────────────────── */

describe('validateUUID', () => {
  it('accepts a valid lowercase UUID', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toEqual({ valid: true });
  });

  it('accepts a valid uppercase UUID', () => {
    expect(validateUUID('550E8400-E29B-41D4-A716-446655440000')).toEqual({ valid: true });
  });

  it('accepts a valid mixed-case UUID', () => {
    expect(validateUUID('550e8400-E29B-41d4-A716-446655440000')).toEqual({ valid: true });
  });

  it('rejects an empty string', () => {
    const result = validateUUID('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects UUID with wrong segment lengths', () => {
    expect(validateUUID('550e840-e29b-41d4-a716-446655440000').valid).toBe(false);
    expect(validateUUID('550e8400-e29-41d4-a716-446655440000').valid).toBe(false);
  });

  it('rejects UUID with missing segments', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716').valid).toBe(false);
  });

  it('rejects UUID with invalid characters', () => {
    expect(validateUUID('550g8400-e29b-41d4-a716-446655440000').valid).toBe(false);
    expect(validateUUID('550e8400-e29b-41d4-a716-44665544000z').valid).toBe(false);
  });

  it('rejects UUID without dashes', () => {
    expect(validateUUID('550e8400e29b41d4a716446655440000').valid).toBe(false);
  });

  it('rejects UUID with extra characters', () => {
    expect(validateUUID('{550e8400-e29b-41d4-a716-446655440000}').valid).toBe(false);
  });

  it('rejects UUID with trailing whitespace', () => {
    expect(validateUUID('550e8400-e29b-41d4-a716-446655440000 ').valid).toBe(false);
  });
});

/* ─── IPv4 address ────────────────────────────── */

describe('validateIPv4', () => {
  it('accepts valid addresses', () => {
    expect(validateIPv4('192.168.1.1')).toEqual({ valid: true });
    expect(validateIPv4('10.0.0.1')).toEqual({ valid: true });
    expect(validateIPv4('255.255.255.255')).toEqual({ valid: true });
    expect(validateIPv4('0.0.0.0')).toEqual({ valid: true });
  });

  it('rejects octets greater than 255', () => {
    const result = validateIPv4('192.168.1.256');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/out of range/);
  });

  it('rejects missing octets', () => {
    const result = validateIPv4('192.168.1');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/4 octets/);
  });

  it('rejects too many octets', () => {
    const result = validateIPv4('192.168.1.1.1');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/4 octets/);
  });

  it('rejects trailing dot', () => {
    const result = validateIPv4('192.168.1.1.');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/4 octets|not a valid number/);
  });

  it('rejects leading dot', () => {
    const result = validateIPv4('.192.168.1.1');
    expect(result.valid).toBe(false);
  });

  it('rejects empty string', () => {
    const result = validateIPv4('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects letters in octets', () => {
    const result = validateIPv4('192.168.one.1');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not a valid number/);
  });

  it('rejects leading zeros (octal ambiguity)', () => {
    const result = validateIPv4('192.168.01.1');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/leading zero/);
  });

  it('rejects negative numbers', () => {
    const result = validateIPv4('192.168.-1.1');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not a valid number/);
  });

  it('rejects spaces', () => {
    expect(validateIPv4('192.168.1. 1').valid).toBe(false);
    expect(validateIPv4(' 192.168.1.1').valid).toBe(false);
  });
});

/* ─── CIDR prefix ─────────────────────────────── */

describe('validateCIDRPrefix', () => {
  it('accepts prefix of 1', () => {
    expect(validateCIDRPrefix(1)).toEqual({ valid: true });
  });

  it('accepts prefix of 32', () => {
    expect(validateCIDRPrefix(32)).toEqual({ valid: true });
  });

  it('accepts prefix of 24', () => {
    expect(validateCIDRPrefix(24)).toEqual({ valid: true });
  });

  it('rejects prefix of 0', () => {
    const result = validateCIDRPrefix(0);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/between 1 and 32/);
  });

  it('rejects prefix of 33', () => {
    const result = validateCIDRPrefix(33);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/between 1 and 32/);
  });

  it('rejects negative prefix', () => {
    const result = validateCIDRPrefix(-1);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/between 1 and 32/);
  });

  it('rejects non-integer (float)', () => {
    const result = validateCIDRPrefix(24.5);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/integer/);
  });

  it('rejects NaN', () => {
    const result = validateCIDRPrefix(NaN);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/integer/);
  });

  it('rejects Infinity', () => {
    const result = validateCIDRPrefix(Infinity);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/integer/);
  });
});

/* ─── Hostname ────────────────────────────────── */

describe('validateHostname', () => {
  it('accepts valid hostnames', () => {
    expect(validateHostname('raspberry-pi')).toEqual({ valid: true });
    expect(validateHostname('homescreen1')).toEqual({ valid: true });
    expect(validateHostname('a')).toEqual({ valid: true });
    expect(validateHostname('Pi')).toEqual({ valid: true });
  });

  it('accepts hostnames with hyphens in the middle', () => {
    expect(validateHostname('my-host')).toEqual({ valid: true });
    expect(validateHostname('a-b-c-d')).toEqual({ valid: true });
  });

  it('accepts maximum length hostname (63 chars)', () => {
    const hostname = 'a' + 'b'.repeat(61) + 'c';
    expect(hostname.length).toBe(63);
    expect(validateHostname(hostname)).toEqual({ valid: true });
  });

  it('rejects empty string', () => {
    const result = validateHostname('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects hostname longer than 63 chars', () => {
    const result = validateHostname('a'.repeat(64));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/63 characters/);
  });

  it('rejects leading hyphen', () => {
    const result = validateHostname('-myhost');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/alphanumeric/);
  });

  it('rejects trailing hyphen', () => {
    const result = validateHostname('myhost-');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/alphanumeric/);
  });

  it('rejects special characters', () => {
    expect(validateHostname('my_host').valid).toBe(false);
    expect(validateHostname('my.host').valid).toBe(false);
    expect(validateHostname('my host').valid).toBe(false);
    expect(validateHostname('my@host').valid).toBe(false);
  });

  it('rejects single hyphen', () => {
    expect(validateHostname('-').valid).toBe(false);
  });

  it('accepts single alphanumeric character', () => {
    expect(validateHostname('a')).toEqual({ valid: true });
    expect(validateHostname('1')).toEqual({ valid: true });
  });

  it('accepts two-character hostname', () => {
    expect(validateHostname('ab')).toEqual({ valid: true });
    expect(validateHostname('a1')).toEqual({ valid: true });
  });
});
