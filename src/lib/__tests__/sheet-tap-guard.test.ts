import { describe, it, expect } from 'vitest';
import { DOUBLE_TAP_MS, isRepeatTap, isTooSoonAfterOpen } from '../sheet-tap-guard';

describe('isRepeatTap', () => {
  it('counts two taps on the same item 100 ms apart once', () => {
    expect(isRepeatTap(null, 'milk', 1_000)).toBe(false);
    expect(isRepeatTap({ id: 'milk', at: 1_000 }, 'milk', 1_100)).toBe(true);
  });

  it('never swallows a tap on a different item', () => {
    expect(isRepeatTap({ id: 'milk', at: 1_000 }, 'eggs', 1_050)).toBe(false);
  });

  it('takes a second tap after the double tap window as a change of mind', () => {
    expect(isRepeatTap({ id: 'milk', at: 1_000 }, 'milk', 1_000 + DOUBLE_TAP_MS)).toBe(false);
  });
});

describe('isTooSoonAfterOpen', () => {
  it('takes a tap within a double tap of the sheet opening as the second half of the tap that opened it', () => {
    expect(isTooSoonAfterOpen(1_000, 1_000)).toBe(true);
    expect(isTooSoonAfterOpen(1_000, 1_000 + DOUBLE_TAP_MS - 1)).toBe(true);
  });

  it('lets a tap through once the double tap is over', () => {
    expect(isTooSoonAfterOpen(1_000, 1_000 + DOUBLE_TAP_MS)).toBe(false);
  });

  it('waits as long as a sheet asks, and not at all for a window of zero', () => {
    expect(isTooSoonAfterOpen(1_000, 1_400, 500)).toBe(true);
    expect(isTooSoonAfterOpen(1_000, 1_000, 0)).toBe(false);
  });
});
