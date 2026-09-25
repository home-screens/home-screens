import { describe, it, expect } from 'vitest';
import { easeInOut, heldPulseKeyframes } from '@/lib/held-pulse';

function stops(css: string) {
  return [...css.matchAll(/([\d.]+)% \{ opacity: ([\d.]+);( animation-timing-function: step-end;)? \}/g)]
    .map((m) => ({ at: Number(m[1]), opacity: Number(m[2]), held: Boolean(m[3]) }));
}

describe('easeInOut', () => {
  it('matches CSS ease-in-out at its ends, middle and known points', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
    // cubic-bezier(0.42, 0, 0.58, 1) is symmetric about the middle.
    expect(easeInOut(0.2) + easeInOut(0.8)).toBeCloseTo(1, 6);
    expect(easeInOut(0.25)).toBeCloseTo(0.1291, 3);
  });
});

describe('heldPulseKeyframes', () => {
  it('samples the colon pulse 12 times a second, holding each value', () => {
    const css = heldPulseKeyframes('clock-colon-pulse', { rest: 1, peak: 0.3, periodMs: 2000 });
    expect(css.startsWith('@keyframes clock-colon-pulse {')).toBe(true);
    const s = stops(css);
    expect(s).toHaveLength(25);
    expect(s[0]).toEqual({ at: 0, opacity: 1, held: true });
    expect(s[12]).toEqual({ at: 50, opacity: 0.3, held: true });
    expect(s[24]).toEqual({ at: 100, opacity: 1, held: false });
    expect(s.slice(0, 24).every((x) => x.held)).toBe(true);
  });

  it('follows the ease-in-out curve on the way down and back up', () => {
    const s = stops(heldPulseKeyframes('p', { rest: 0, peak: 1, periodMs: 4000 }));
    expect(s).toHaveLength(49);
    for (let i = 1; i <= 24; i++) expect(s[i].opacity).toBeGreaterThanOrEqual(s[i - 1].opacity);
    for (let i = 25; i <= 48; i++) expect(s[i].opacity).toBeLessThanOrEqual(s[i - 1].opacity);
    expect(s[6].opacity).toBeCloseTo(easeInOut(0.25), 3);
    expect(s[42].opacity).toBeCloseTo(s[6].opacity, 3);
  });

  it('keeps an even sample count so the peak is always hit', () => {
    const s = stops(heldPulseKeyframes('p', { rest: 1, peak: 0.3, periodMs: 1500, updatesPerSecond: 5 }));
    expect(s.length % 2).toBe(1);
    expect(s[(s.length - 1) / 2].opacity).toBe(0.3);
  });
});
