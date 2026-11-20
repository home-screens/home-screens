import { describe, it, expect } from 'vitest';
import { getProgress } from '../YearProgressModule';

describe('getProgress week bar', () => {
  // Sunday 14 June 2026, noon.
  const sundayNoon = new Date(2026, 5, 14, 12, 0);
  // Monday 15 June 2026, midnight.
  const mondayStart = new Date(2026, 5, 15, 0, 0);

  it('is nearly full on Sunday where the week starts on Monday', () => {
    expect(getProgress(sundayNoon, 'monday').weekPercent).toBeCloseTo((6.5 / 7) * 100, 5);
    expect(getProgress(mondayStart, 'monday').weekPercent).toBe(0);
  });

  it('starts over on Sunday where the week starts on Sunday', () => {
    expect(getProgress(sundayNoon, 'sunday').weekPercent).toBeCloseTo((0.5 / 7) * 100, 5);
    expect(getProgress(mondayStart, 'sunday').weekPercent).toBeCloseTo((1 / 7) * 100, 5);
  });

  it('leaves the year, month and day bars alone', () => {
    const { weekPercent: _a, ...monday } = getProgress(sundayNoon, 'monday');
    const { weekPercent: _b, ...sunday } = getProgress(sundayNoon, 'sunday');
    expect(sunday).toEqual(monday);
  });
});
