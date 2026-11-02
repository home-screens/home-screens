import { describe, expect, it } from 'vitest';
import { isAwayFromHome, isNearEnd, wallScrollThumb } from '../wall-scroll';

describe('wallScrollThumb', () => {
  it('draws nothing when the content fits', () => {
    expect(wallScrollThumb(0, 500, 500)).toBeNull();
    expect(wallScrollThumb(0, 501, 500)).toBeNull();
  });

  it('sizes the bar by how much of the list shows', () => {
    expect(wallScrollThumb(0, 2000, 500)).toEqual({ top: 0, height: 125 });
  });

  it('moves the bar from the top to the bottom of the box', () => {
    expect(wallScrollThumb(1500, 2000, 500)).toEqual({ top: 375, height: 125 });
    expect(wallScrollThumb(750, 2000, 500)?.top).toBeCloseTo(187.5);
  });

  it('keeps a very long list a bar a finger can see', () => {
    expect(wallScrollThumb(0, 100_000, 500)?.height).toBe(24);
  });

  it('stays inside the box past the ends (overscroll)', () => {
    expect(wallScrollThumb(-40, 2000, 500)?.top).toBe(0);
    expect(wallScrollThumb(1600, 2000, 500)?.top).toBe(375);
  });
});

describe('isAwayFromHome', () => {
  it('ignores a nudge', () => {
    expect(isAwayFromHome(40, 0, 100)).toBe(false);
    expect(isAwayFromHome(100, 0, 400)).toBe(false);
  });

  it('shows the way back once a quarter of the box has gone by, either way', () => {
    expect(isAwayFromHome(101, 0, 400)).toBe(true);
    expect(isAwayFromHome(200, 400, 400)).toBe(true);
  });
});

describe('isNearEnd', () => {
  it('asks for more within most of a box of the end', () => {
    expect(isNearEnd(1300, 2000, 500)).toBe(true);
    expect(isNearEnd(1000, 2000, 500)).toBe(false);
  });
});
