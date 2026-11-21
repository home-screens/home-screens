import { describe, it, expect } from 'vitest';
import { MAX_STEP_SEC, MIN_STEP_SEC, secondsFromFields } from '../timer-logic';

const step = { min: MIN_STEP_SEC, max: MAX_STEP_SEC };

describe('secondsFromFields', () => {
  it('adds the two boxes, an empty one counting as 0', () => {
    expect(secondsFromFields('2', '30', step)).toBe(150);
    expect(secondsFromFields('', '30', step)).toBe(30);
    expect(secondsFromFields('5', '', step)).toBe(300);
  });

  it('refuses a length outside the limits it was given', () => {
    expect(secondsFromFields('', '4', step)).toBeNull();
    expect(secondsFromFields('', '5', step)).toBe(5);
    expect(secondsFromFields('240', '0', step)).toBe(MAX_STEP_SEC);
    expect(secondsFromFields('240', '1', step)).toBeNull();
    expect(secondsFromFields('', '', step)).toBeNull();
    // A caller with a higher floor.
    expect(secondsFromFields('', '30', { min: 60, max: 600 })).toBeNull();
  });

  it('refuses anything that is not a whole number in its own range', () => {
    expect(secondsFromFields('1.5', '0', step)).toBeNull();
    expect(secondsFromFields('1', '60', step)).toBeNull();
    expect(secondsFromFields('241', '0', step)).toBeNull();
    expect(secondsFromFields('-1', '30', step)).toBeNull();
    expect(secondsFromFields('two', '0', step)).toBeNull();
  });
});
