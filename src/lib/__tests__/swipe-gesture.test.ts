import { describe, it, expect } from 'vitest';
import {
  classifySwipe,
  SWIPE_MIN_DISTANCE_PX,
  SWIPE_MAX_DURATION_MS,
  type SwipePoint,
} from '@/lib/swipe-gesture';

function point(x: number, y: number, t: number): SwipePoint {
  return { x, y, t };
}

describe('classifySwipe', () => {
  it('classifies a fast leftward flick as left', () => {
    expect(classifySwipe(point(800, 1400, 0), point(600, 1400, 200))).toBe('left');
  });

  it('classifies a fast rightward flick as right', () => {
    expect(classifySwipe(point(300, 1400, 0), point(500, 1400, 200))).toBe('right');
  });

  it('fires at exactly the minimum distance and rejects one px under', () => {
    expect(classifySwipe(point(500, 0, 0), point(500 - SWIPE_MIN_DISTANCE_PX, 0, 100))).toBe('left');
    expect(classifySwipe(point(500, 0, 0), point(500 - (SWIPE_MIN_DISTANCE_PX - 1), 0, 100))).toBeNull();
  });

  it('fires at exactly the maximum duration and rejects one ms over', () => {
    expect(classifySwipe(point(500, 0, 0), point(300, 0, SWIPE_MAX_DURATION_MS))).toBe('left');
    expect(classifySwipe(point(500, 0, 0), point(300, 0, SWIPE_MAX_DURATION_MS + 1))).toBeNull();
  });

  it('rejects a purely vertical gesture', () => {
    expect(classifySwipe(point(540, 1500, 0), point(540, 1100, 200))).toBeNull();
  });

  it('accepts a diagonal at the 2:1 dominance boundary and rejects just past it', () => {
    expect(classifySwipe(point(0, 0, 0), point(100, 50, 200))).toBe('right');
    expect(classifySwipe(point(0, 0, 0), point(100, 51, 200))).toBeNull();
  });

  it('rejects upward diagonals symmetrically', () => {
    expect(classifySwipe(point(0, 500, 0), point(100, 450, 200))).toBe('right');
    expect(classifySwipe(point(0, 500, 0), point(100, 449, 200))).toBeNull();
  });

  it('rejects a tap (near-zero movement)', () => {
    expect(classifySwipe(point(540, 960, 0), point(542, 963, 80))).toBeNull();
  });

  it('rejects a press-and-hold (no movement, long duration)', () => {
    expect(classifySwipe(point(540, 960, 0), point(540, 960, 1500))).toBeNull();
  });
});
