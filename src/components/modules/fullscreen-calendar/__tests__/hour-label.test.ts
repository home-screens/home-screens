import { describe, it, expect } from 'vitest';
import { formatHourLabel } from '../shared-time-grid';

describe('formatHourLabel', () => {
  it('writes a time grid hour the way the formatting language does', () => {
    expect(formatHourLabel(8, '24h', 'en-US')).toBe('08:00');
    expect(formatHourLabel(20, '24h', 'da-DK')).toBe('20.00');
    expect(formatHourLabel(8, '24h', 'es-ES')).toBe('8:00');
    expect(formatHourLabel(20, '12h', 'en-US')).toBe('8 PM');
    expect(formatHourLabel(20, '12h', 'es-ES')).toBe('8 p. m.');
    // German's 12-hour day period is Intl's, not the old dictionary's "nachm.".
    expect(formatHourLabel(20, '12h', 'de-DE')).toBe('8 PM');
  });

  it('reads the end-of-day line, 24, as midnight', () => {
    expect(formatHourLabel(24, '12h', 'en-US')).toBe('12 AM');
    expect(formatHourLabel(24, '24h', 'nl-NL')).toBe('00:00');
  });
});
