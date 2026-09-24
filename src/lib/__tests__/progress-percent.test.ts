import { describe, it, expect } from 'vitest';
import { formatProgressPercent } from '../progress-percent';

describe('formatProgressPercent', () => {
  it('floors, so a bar two minutes short of full does not read 100.0%', () => {
    // Dec 31 23:58 in a 365-day year.
    const year = ((364 + (23 * 60 + 58) / 1440) / 365) * 100;
    expect(formatProgressPercent(year, 'en-US')).toBe('99.9%');
    // Sunday 23:58 for the week.
    expect(formatProgressPercent(((6 * 1440 + 1438) / (7 * 1440)) * 100, 'en-US')).toBe('99.9%');
    expect(formatProgressPercent(100, 'en-US')).toBe('100.0%');
  });

  it('keeps an exact share exact', () => {
    // 07:12 is 432 of 1440 minutes, exactly 30%.
    expect(formatProgressPercent((432 / 1440) * 100, 'en-US')).toBe('30.0%');
    expect(formatProgressPercent(0, 'en-US')).toBe('0.0%');
  });

  it("writes the locale's own decimal mark and percent sign", () => {
    expect(formatProgressPercent(30.85, 'da-DK')).toBe('30,8 %');
    expect(formatProgressPercent(30.85, 'pt-BR')).toBe('30,8%');
    expect(formatProgressPercent(30.85, 'de-DE')).toBe('30,8 %');
  });

  it('clamps outside 0 to 100', () => {
    expect(formatProgressPercent(-3, 'en-US')).toBe('0.0%');
    expect(formatProgressPercent(140, 'en-US')).toBe('100.0%');
  });
});
