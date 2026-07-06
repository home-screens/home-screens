import { describe, it, expect } from 'vitest';
import { aggregateDaily, pickDominant, average } from '../daily';

describe('pickDominant', () => {
  it('returns the most frequent key', () => {
    const counts = new Map([['rain', 2], ['cloudy', 5], ['sun', 1]]);
    expect(pickDominant(counts)).toBe('cloudy');
  });

  it('resolves ties to the first key to reach the max count', () => {
    const counts = new Map([['rain', 3], ['sun', 3]]);
    expect(pickDominant(counts)).toBe('rain');
  });

  it('returns undefined for an empty map', () => {
    expect(pickDominant(new Map())).toBeUndefined();
  });

  it('works with numeric keys (SMHI symbol codes)', () => {
    const counts = new Map([[1, 1], [19, 4]]);
    expect(pickDominant(counts)).toBe(19);
  });
});

describe('average', () => {
  it('averages values', () => {
    expect(average([2, 4, 6])).toBe(4);
  });

  it('returns undefined for an empty array', () => {
    expect(average([])).toBeUndefined();
  });
});

describe('aggregateDaily', () => {
  it('buckets samples by date and derives high/low, dominant symbol, and precip stats', () => {
    const days = aggregateDaily(
      [
        { date: '2026-07-06', tempC: 10, humidity: 60, windSpeedMs: 2, symbol: 'rain', precipMm: 1.5, precipProb: 40 },
        { date: '2026-07-06', tempC: 18, humidity: 50, windSpeedMs: 4, symbol: 'cloudy', precipMm: 0.5, precipProb: 80 },
        { date: '2026-07-06', tempC: 14, symbol: 'cloudy', precipProb: 20 },
        { date: '2026-07-07', tempC: 21, symbol: 'sun' },
      ],
      7,
    );

    expect(days).toHaveLength(2);
    expect(days[0]).toEqual({
      date: '2026-07-06',
      highC: 18,
      lowC: 10,
      symbol: 'cloudy',
      precipMm: 2,
      precipProb: 80,
      humidity: 55,
      windSpeedMs: 3,
    });
    expect(days[1]).toMatchObject({ date: '2026-07-07', highC: 21, lowC: 21, symbol: 'sun' });
  });

  it('defaults high/low to 0 and averages to undefined when a day has no samples for them', () => {
    const days = aggregateDaily([{ date: '2026-07-06', symbol: 'fog' }], 7);
    expect(days[0]).toEqual({
      date: '2026-07-06',
      highC: 0,
      lowC: 0,
      symbol: 'fog',
      precipMm: 0,
      precipProb: 0,
      humidity: undefined,
      windSpeedMs: undefined,
    });
  });

  it('rounds averaged humidity but leaves wind speed unrounded for the caller', () => {
    const days = aggregateDaily(
      [
        { date: '2026-07-06', humidity: 50, windSpeedMs: 1 },
        { date: '2026-07-06', humidity: 51, windSpeedMs: 2 },
      ],
      7,
    );
    expect(days[0].humidity).toBe(51); // 50.5 rounds
    expect(days[0].windSpeedMs).toBe(1.5); // raw m/s — rounding happens after unit conversion
  });

  it('caps output at maxDays in first-seen date order', () => {
    const days = aggregateDaily(
      [
        { date: '2026-07-06', tempC: 1 },
        { date: '2026-07-07', tempC: 2 },
        { date: '2026-07-08', tempC: 3 },
      ],
      2,
    );
    expect(days.map((d) => d.date)).toEqual(['2026-07-06', '2026-07-07']);
  });
});
