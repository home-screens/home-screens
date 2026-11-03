/**
 * mulberry32, a small seeded random number generator: the same seed gives the
 * same sequence on every device and reload, which Math.random cannot. The
 * sky's star scatter, the word of the day and the meal shuffle tests all
 * draw from it, so a change here moves every word to a different day.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
