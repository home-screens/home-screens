import { describe, it, expect } from 'vitest';
import { CALENDAR_COLOR_PALETTE, resolveSwatches } from '@/lib/calendar-color';

/**
 * `resolveSwatches` is what stands between a hand-edited config and the
 * wall's recolour sheet. The palette itself is the one every calendar is
 * offered in Settings, so this covers only what the household's own list
 * does to it: a short list, a bad entry, a stray extra, mixed case.
 */
describe('resolveSwatches', () => {
  it('uses the shipped colours when nothing is saved', () => {
    expect(resolveSwatches(undefined)).toEqual([...CALENDAR_COLOR_PALETTE]);
    expect(resolveSwatches([])).toEqual([...CALENDAR_COLOR_PALETTE]);
  });

  it('takes the saved colours', () => {
    const saved = CALENDAR_COLOR_PALETTE.map((_, index) => `#12345${index}`);
    expect(resolveSwatches(saved)).toEqual(saved);
  });

  it('fills a short list from the defaults rather than returning a short grid', () => {
    // A ragged last row has no sensible layout in the wall's sheet.
    const out = resolveSwatches(['#123456', '#654321']);
    expect(out).toHaveLength(CALENDAR_COLOR_PALETTE.length);
    expect(out[0]).toBe('#123456');
    expect(out[2]).toBe(CALENDAR_COLOR_PALETTE[2]);
  });

  it('replaces only the bad entries', () => {
    // One mistyped colour must cost that swatch, not the whole palette.
    const saved = [...CALENDAR_COLOR_PALETTE] as string[];
    saved[3] = 'rebeccapurple';
    saved[5] = '#abc';
    const out = resolveSwatches(saved);
    expect(out[3]).toBe(CALENDAR_COLOR_PALETTE[3]);
    expect(out[5]).toBe(CALENDAR_COLOR_PALETTE[5]);
    expect(out[4]).toBe(CALENDAR_COLOR_PALETTE[4]);
  });

  it('lowercases, so a saved colour matches the ringed swatch', () => {
    // The sheet decides which swatch is current by string comparison.
    expect(resolveSwatches(['#AABBCC'])[0]).toBe('#aabbcc');
  });

  it('ignores anything past the end of the grid', () => {
    const out = resolveSwatches([...CALENDAR_COLOR_PALETTE, '#000000', '#111111']);
    expect(out).toHaveLength(CALENDAR_COLOR_PALETTE.length);
  });

  it('never offers the same colour twice', () => {
    const saved = [...CALENDAR_COLOR_PALETTE];
    saved[1] = saved[0];
    saved[5] = saved[0].toUpperCase();
    const resolved = resolveSwatches(saved);
    expect(new Set(resolved).size).toBe(CALENDAR_COLOR_PALETTE.length);
    // The first holder keeps it; the repeats take the defaults nobody else holds.
    expect(resolved[0]).toBe(CALENDAR_COLOR_PALETTE[0]);
    expect(resolved[1]).toBe(CALENDAR_COLOR_PALETTE[1]);
    expect(resolved[5]).toBe(CALENDAR_COLOR_PALETTE[5]);
  });
});
