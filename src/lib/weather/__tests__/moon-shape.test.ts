import { describe, it, expect } from 'vitest';
import { moonLitFraction, moonShadowPath } from '../moon-shape';

describe('moonLitFraction', () => {
  it('follows the cosine of the phase', () => {
    expect(moonLitFraction(0)).toBeCloseTo(0);
    expect(moonLitFraction(0.25)).toBeCloseTo(0.5);
    expect(moonLitFraction(0.5)).toBeCloseTo(1);
    expect(moonLitFraction(0.75)).toBeCloseTo(0.5);
    // A crescent an eighth of the way round is about 15% lit, not the 25% a
    // straight line through the phase gives.
    expect(moonLitFraction(0.125)).toBeCloseTo(0.146, 3);
  });
});

describe('moonShadowPath', () => {
  const terminator = (path: string) => Number(path.split(' A ')[2].split(' ')[0]);
  const sweeps = (path: string) => path.split(' A ').slice(1).map((arc) => arc.split(' ')[4]);

  it('sets the terminator from the lit fraction', () => {
    // 14.6% lit on a 140 px disc: the terminator sits 0.707 of a radius out.
    expect(terminator(moonShadowPath(0.125, 140))).toBeCloseTo(49.5, 1);
    expect(terminator(moonShadowPath(0.25, 140))).toBeCloseTo(0, 5);
  });

  it('shades the left of a waxing moon and the right of a waning one', () => {
    expect(sweeps(moonShadowPath(0.125, 120))).toEqual(['0', '0']); // waxing crescent
    expect(sweeps(moonShadowPath(0.375, 120))).toEqual(['0', '1']); // waxing gibbous
    expect(sweeps(moonShadowPath(0.625, 120))).toEqual(['1', '0']); // waning gibbous
    expect(sweeps(moonShadowPath(0.875, 120))).toEqual(['1', '1']); // waning crescent
  });
});
