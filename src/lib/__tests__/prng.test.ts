import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../prng';
import { shuffleArray } from '../shuffle';

describe('mulberry32', () => {
  // The first draws of a few seeds, recorded before the generator moved here.
  // The word of the day and the sky's stars are picked by these numbers, so a
  // different sequence would move every word to another day.
  it('draws the sequence it always has for a given seed', () => {
    const draws = (seed: number) => {
      const rand = mulberry32(seed);
      return [rand(), rand(), rand()];
    };
    expect(draws(1)).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    expect(draws(20260820)).toEqual([0.42649109894409776, 0.931091831298545, 0.559535087319091]);
    expect(draws(2026)).toEqual([0.45540769933722913, 0.30849614599719644, 0.6611574492417276]);
    expect(draws(-5)).toEqual([0.48384718922898173, 0.05296749505214393, 0.9390332337934524]);
  });

  it('stays within [0, 1) and differs between seeds', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const value = rand();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe('shuffleArray with a seeded source', () => {
  it('gives the same order for the same seed and leaves the input alone', () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7];
    const a = shuffleArray(input, mulberry32(3));
    const b = shuffleArray(input, mulberry32(3));
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(input);
    expect(input).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('is the Fisher-Yates walk the word of the day was dealt with', () => {
    // Worked by hand from the seed-1 draws above: i=3 j=floor(0.627*4)=2
    // gives [0,1,3,2]; i=2 j=floor(0.0027*3)=0 gives [3,1,0,2]; i=1
    // j=floor(0.527*2)=1 leaves it.
    expect(shuffleArray([0, 1, 2, 3], mulberry32(1))).toEqual([3, 1, 0, 2]);
  });
});
