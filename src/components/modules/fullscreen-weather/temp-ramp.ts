/**
 * Shared temperature colour ramp for the fullscreen weather module.
 *
 * Every temperature the module draws — ribbon stroke, 7-day range bars, the
 * Almanac's 12-hour strip — resolves through `tempColor`, so a given colour
 * means the same temperature everywhere on the screen. The ramp is
 * theme-independent on purpose: it encodes data, not chrome.
 *
 * Stops are in Fahrenheit. Metric input is converted before lookup so the
 * ramp does not need a second stop table.
 */

type Stop = readonly [number, readonly [number, number, number]];

const STOPS: readonly Stop[] = [
  [-20, [76, 29, 149]],   // deep violet
  [0, [30, 58, 138]],     // navy
  [15, [29, 78, 216]],    // blue
  [28, [2, 132, 199]],    // sky
  [36, [8, 145, 178]],    // cyan
  [46, [13, 148, 136]],   // teal
  [56, [101, 163, 13]],   // green — mild, matches Apple's convention
  [66, [202, 138, 4]],    // amber
  [76, [234, 88, 12]],    // orange
  [88, [220, 38, 38]],    // red
  [100, [159, 18, 57]],   // crimson
] as const;

const cToF = (c: number) => (c * 9) / 5 + 32;

/**
 * Resolve a temperature to an rgba string.
 *
 * @param temp  Temperature in the units the display is configured for.
 * @param units 'metric' converts to F before lookup.
 * @param alpha 0-1 opacity.
 */
export function tempColor(temp: number, units: 'metric' | 'imperial' = 'imperial', alpha = 1): string {
  if (!Number.isFinite(temp)) return `rgba(148,163,184,${alpha})`;
  const f = units === 'metric' ? cToF(temp) : temp;

  let i = 0;
  while (i < STOPS.length - 2 && f > STOPS[i + 1][0]) i++;
  const [t0, c0] = STOPS[i];
  const [t1, c1] = STOPS[i + 1];
  const span = t1 - t0;
  const k = span === 0 ? 0 : Math.max(0, Math.min(1, (f - t0) / span));

  const r = Math.round(c0[0] + (c1[0] - c0[0]) * k);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * k);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * k);
  return `rgba(${r},${g},${b},${alpha})`;
}
