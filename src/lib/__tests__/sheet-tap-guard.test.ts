import { describe, it, expect } from 'vitest';
import { DOUBLE_TAP_MS, isRepeatTap } from '../sheet-tap-guard';

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
