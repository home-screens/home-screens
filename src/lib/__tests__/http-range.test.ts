import { describe, it, expect } from 'vitest';
import { parseRangeHeader } from '@/lib/http-range';

describe('parseRangeHeader', () => {
  const SIZE = 1000;

  it('returns null when no header is present (full 200 response)', () => {
    expect(parseRangeHeader(null, SIZE)).toBeNull();
  });

  it('parses a mid-file range', () => {
    expect(parseRangeHeader('bytes=100-199', SIZE)).toEqual({ start: 100, end: 199 });
  });

  it('parses an open-ended range to the last byte', () => {
    expect(parseRangeHeader('bytes=500-', SIZE)).toEqual({ start: 500, end: 999 });
  });

  it('parses a suffix range (last N bytes)', () => {
    expect(parseRangeHeader('bytes=-200', SIZE)).toEqual({ start: 800, end: 999 });
  });

  it('clamps a suffix larger than the file to the whole file', () => {
    expect(parseRangeHeader('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 });
  });

  it('clamps an end past EOF to the last byte', () => {
    expect(parseRangeHeader('bytes=900-5000', SIZE)).toEqual({ start: 900, end: 999 });
  });

  it('rejects a start at or past EOF', () => {
    expect(parseRangeHeader('bytes=1000-', SIZE)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=1500-1600', SIZE)).toBe('unsatisfiable');
  });

  it('rejects an inverted range', () => {
    expect(parseRangeHeader('bytes=200-100', SIZE)).toBe('unsatisfiable');
  });

  it('rejects malformed headers', () => {
    for (const bad of ['bytes=-', 'bytes=', 'items=0-99', 'bytes=a-b', 'bytes=0-99,200-299']) {
      expect(parseRangeHeader(bad, SIZE)).toBe('unsatisfiable');
    }
  });

  it('rejects a zero-length suffix', () => {
    expect(parseRangeHeader('bytes=-0', SIZE)).toBe('unsatisfiable');
  });

  it('rejects any range against an empty file', () => {
    expect(parseRangeHeader('bytes=0-', 0)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=-100', 0)).toBe('unsatisfiable');
  });

  it('accepts whitespace around the header value', () => {
    expect(parseRangeHeader(' bytes=0-9 ', SIZE)).toEqual({ start: 0, end: 9 });
  });
});
