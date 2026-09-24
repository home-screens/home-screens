import { describe, it, expect } from 'vitest';
import { resolveClockFormat24h } from '../hour-format';

describe('resolveClockFormat24h', () => {
  it('a clock without hourFormat keeps reading its own toggle, whatever the household chose', () => {
    expect(resolveClockFormat24h({ format24h: false }, '24h', 'en-US')).toBe(false);
    expect(resolveClockFormat24h({ format24h: true }, undefined, 'en-US')).toBe(true);
    expect(resolveClockFormat24h({ format24h: true }, '12h', 'en-US')).toBe(true);
  });

  it("inherit follows the household setting, and the language's own clock when it was never chosen", () => {
    expect(resolveClockFormat24h({ format24h: false, hourFormat: 'inherit' }, undefined, 'en-US')).toBe(false);
    expect(resolveClockFormat24h({ format24h: false, hourFormat: 'inherit' }, '12h', 'en-US')).toBe(false);
    expect(resolveClockFormat24h({ format24h: false, hourFormat: 'inherit' }, '24h', 'en-US')).toBe(true);
    expect(resolveClockFormat24h({ format24h: false, hourFormat: 'inherit' }, undefined, 'da-DK')).toBe(true);
    expect(resolveClockFormat24h({ format24h: false, hourFormat: 'inherit' }, '12h', 'da-DK')).toBe(false);
    // The legacy toggle is ignored once hourFormat is present.
    expect(resolveClockFormat24h({ format24h: true, hourFormat: 'inherit' }, undefined, 'en-US')).toBe(false);
  });

  it('an explicit choice wins over the household setting in both directions', () => {
    expect(resolveClockFormat24h({ format24h: false, hourFormat: '24h' }, undefined, 'en-US')).toBe(true);
    expect(resolveClockFormat24h({ format24h: true, hourFormat: '12h' }, '24h', 'en-US')).toBe(false);
  });
});
