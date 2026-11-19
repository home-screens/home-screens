import { describe, it, expect } from 'vitest';
import { dayPartFor } from '../day-part';

describe('dayPartFor', () => {
  it('splits the day at 5, 12, 17 and 21', () => {
    expect([4, 5, 11, 12, 16, 17, 20, 21, 23, 0].map(dayPartFor)).toEqual([
      'night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night', 'night',
    ]);
  });
});
