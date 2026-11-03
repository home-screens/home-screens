import { describe, it, expect } from 'vitest';
import { clockHourFormat, resolveClockFormat24h } from '../hour-format';

describe('clockHourFormat', () => {
  it('reads the stored choice, and inherit for a hand-edited clock without one', () => {
    expect(clockHourFormat({ hourFormat: '24h' })).toBe('24h');
    expect(clockHourFormat({})).toBe('inherit');
  });
});

describe('resolveClockFormat24h', () => {
  it("inherit follows the household setting, and the language's own clock when it was never chosen", () => {
    expect(resolveClockFormat24h({ hourFormat: 'inherit' }, undefined, 'en-US')).toBe(false);
    expect(resolveClockFormat24h({ hourFormat: 'inherit' }, '12h', 'en-US')).toBe(false);
    expect(resolveClockFormat24h({ hourFormat: 'inherit' }, '24h', 'en-US')).toBe(true);
    expect(resolveClockFormat24h({ hourFormat: 'inherit' }, undefined, 'da-DK')).toBe(true);
    expect(resolveClockFormat24h({ hourFormat: 'inherit' }, '12h', 'da-DK')).toBe(false);
  });

  it('an explicit choice wins over the household setting in both directions', () => {
    expect(resolveClockFormat24h({ hourFormat: '24h' }, undefined, 'en-US')).toBe(true);
    expect(resolveClockFormat24h({ hourFormat: '12h' }, '24h', 'en-US')).toBe(false);
  });
});
