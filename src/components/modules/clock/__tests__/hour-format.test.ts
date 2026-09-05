import { describe, it, expect } from 'vitest';
import { resolveClockFormat24h } from '../hour-format';

describe('resolveClockFormat24h', () => {
  it('a clock without hourFormat keeps reading its own toggle, whatever the household chose', () => {
    expect(resolveClockFormat24h({ format24h: false }, '24h')).toBe(false);
    expect(resolveClockFormat24h({ format24h: true }, undefined)).toBe(true);
    expect(resolveClockFormat24h({ format24h: true }, '12h')).toBe(true);
  });

  it('inherit follows the household setting and defaults to 12-hour when it was never chosen', () => {
    expect(resolveClockFormat24h({ format24h: false, hourFormat: 'inherit' }, undefined)).toBe(false);
    expect(resolveClockFormat24h({ format24h: false, hourFormat: 'inherit' }, '12h')).toBe(false);
    expect(resolveClockFormat24h({ format24h: false, hourFormat: 'inherit' }, '24h')).toBe(true);
    // The legacy toggle is ignored once hourFormat is present.
    expect(resolveClockFormat24h({ format24h: true, hourFormat: 'inherit' }, undefined)).toBe(false);
  });

  it('an explicit choice wins over the household setting in both directions', () => {
    expect(resolveClockFormat24h({ format24h: false, hourFormat: '24h' }, undefined)).toBe(true);
    expect(resolveClockFormat24h({ format24h: true, hourFormat: '12h' }, '24h')).toBe(false);
  });
});
