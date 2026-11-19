/**
 * The moon's lit shape, as pure geometry, so every drawing of tonight's moon
 * shows the same crescent and agrees with the percentage printed beside it.
 *
 * `phase` is 0 at new moon, .5 at full, waxing below .5 (SunCalc's
 * convention).
 */

/**
 * The lit fraction of the disc, 0 to 1. The phase is an angle around the
 * cycle and the lit fraction is its cosine: a quarter moon at .25 is half
 * lit, a .125 crescent about 15%. A straight line through the phase (25% at
 * .125) draws a crescent fatter than the figure SunCalc reports.
 */
export function moonLitFraction(phase: number): number {
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

/**
 * The unlit part of a moon of diameter `size`, as one SVG path: the dark
 * limb's half disc plus (crescent) or minus (gibbous) the terminator
 * ellipse. Waxing moons are lit on the right.
 */
export function moonShadowPath(phase: number, size: number): string {
  const r = size / 2;
  const lit = moonLitFraction(phase);
  const tx = Math.abs(lit * 2 - 1) * r;
  const limb = phase < 0.5 ? 0 : 1;
  // The terminator bulges into the lit side for a crescent and into the dark
  // side for a gibbous, which is the same arc swept the other way.
  const terminator = (phase < 0.5) === (lit <= 0.5) ? 0 : 1;
  return `M ${r} 0 A ${r} ${r} 0 0 ${limb} ${r} ${size} A ${tx} ${r} 0 0 ${terminator} ${r} 0`;
}
