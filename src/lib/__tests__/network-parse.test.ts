import { describe, it, expect } from 'vitest';
import { parseTerseFields } from '../network-parse';

/**
 * `parseTerseFields` is the single source of truth for interpreting nmcli
 * terse output (`-t`), which uses `:` as the field separator and `\:` to
 * escape literal colons (the common case is MAC addresses). Every
 * `/api/system/network/*` route pipes command output through this helper,
 * so a regression here would break Wi-Fi scan / connect / saved-networks /
 * IP listing all at once.
 *
 * The escape sequence is handled by a manual char-by-char scanner, which
 * is fiddly enough to deserve its own test module — string.split(':') is
 * the easy-but-wrong shape these tests pin against.
 */

describe('parseTerseFields', () => {
  it('splits a plain unescaped line on colons', () => {
    expect(parseTerseFields('a:b:c')).toEqual(['a', 'b', 'c']);
  });

  it('returns a single-element array when the input has no colons', () => {
    expect(parseTerseFields('nochange')).toEqual(['nochange']);
  });

  it('returns a single empty string for an empty input', () => {
    // The trailing push always fires, so empty input yields [''] not []. This
    // matters because nmcli occasionally emits blank lines between records;
    // callers check field count rather than array length.
    expect(parseTerseFields('')).toEqual(['']);
  });

  it('preserves empty leading, trailing, and middle fields', () => {
    // nmcli will emit `SSID::72:` when the BSSID column is blank — callers
    // depend on empty fields surviving so column indices stay aligned.
    expect(parseTerseFields(':a::b:')).toEqual(['', 'a', '', 'b', '']);
  });

  it('treats `\\:` as a literal colon inside a field', () => {
    // The example from the source's docstring — a MAC address embedded in
    // a wifi scan row.
    expect(parseTerseFields('MyNet:AA\\:BB\\:CC:72:WPA2:2437 MHz:*')).toEqual([
      'MyNet',
      'AA:BB:CC',
      '72',
      'WPA2',
      '2437 MHz',
      '*',
    ]);
  });

  it('handles multiple escaped colons in a single MAC-shaped field', () => {
    // A realistic `ifname:MAC:state` row from nmcli device output
    expect(parseTerseFields('wlan0:DE\\:AD\\:BE\\:EF\\:00\\:11:connected')).toEqual([
      'wlan0',
      'DE:AD:BE:EF:00:11',
      'connected',
    ]);
  });

  it('does not treat `\\` followed by a non-colon as an escape', () => {
    // The escape sequence is narrowly `\:` — any other backslash is kept
    // as-is. This matters for SSIDs that happen to contain a backslash.
    expect(parseTerseFields('Net\\Work:72')).toEqual(['Net\\Work', '72']);
  });

  it('treats a trailing lone backslash as a literal backslash', () => {
    // The scanner only consumes the next character when it's a `:`; a
    // backslash at end-of-string stays in the output.
    expect(parseTerseFields('foo\\')).toEqual(['foo\\']);
  });

  it('handles a field that is only an escaped colon', () => {
    // SSID named ":" would be serialized by nmcli as `\:`.
    expect(parseTerseFields('a:\\::b')).toEqual(['a', ':', 'b']);
  });

  it('handles consecutive escaped colons in one field with no other chars', () => {
    // Equivalent to "::" as a value.
    expect(parseTerseFields('a:\\:\\::b')).toEqual(['a', '::', 'b']);
  });
});
