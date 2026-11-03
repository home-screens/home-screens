import { describe, it, expect } from 'vitest';
import { getOrientation } from '../orientation';

describe('getOrientation', () => {
  it('reads a wall on its side as landscape and upright as portrait', () => {
    expect(getOrientation(1920, 1080)).toBe('landscape');
    expect(getOrientation(1080, 1920)).toBe('portrait');
  });

  it('counts a square box as portrait, so it stacks instead of splitting into two narrow columns', () => {
    expect(getOrientation(1000, 1000)).toBe('portrait');
  });

  it('is portrait before the box is measured', () => {
    expect(getOrientation(0, 0)).toBe('portrait');
  });
});
