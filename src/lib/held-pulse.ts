/**
 * Keyframes for a slow, endless opacity pulse (clock colons, the calendar's
 * today glow, the meal planner's now dot) that the wall only redraws when the
 * value actually changes.
 *
 * A CSS animation with a smooth easing makes Chromium draw a frame on every
 * screen refresh for as long as it runs, and on a Pi each of those frames
 * also re-runs the blur of the card it sits in. Here the same ease-in-out
 * curve is sampled a fixed number of times a second and each value is held
 * (`step-end`) until the next, so the breathing looks the same but Chromium
 * draws 12 frames a second instead of 60 (measured: it skips the refreshes
 * where a held value does not change).
 */

export const PULSE_UPDATES_PER_SECOND = 12;

export interface HeldPulse {
  /** Opacity at the start and end of each cycle. */
  rest: number;
  /** Opacity halfway through the cycle. */
  peak: number;
  /** One full rest, peak, rest cycle. */
  periodMs: number;
  updatesPerSecond?: number;
}

/** CSS `ease-in-out`, cubic-bezier(0.42, 0, 0.58, 1), at progress x. */
export function easeInOut(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // x(s) is monotonic on [0, 1], so bisect for the curve parameter s.
  const bx = (s: number) => 3 * (1 - s) * (1 - s) * s * 0.42 + 3 * (1 - s) * s * s * 0.58 + s * s * s;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (bx(mid) < x) lo = mid;
    else hi = mid;
  }
  const s = (lo + hi) / 2;
  return 3 * s * s - 2 * s * s * s;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * `@keyframes <name>` running rest, peak, rest with ease-in-out on each half,
 * as held samples. Use it with `animation: <name> <periodMs>ms linear
 * infinite`; the keyframes carry their own timing, so the easing on the
 * animation itself does not matter.
 */
export function heldPulseKeyframes(name: string, pulse: HeldPulse): string {
  const { rest, peak, periodMs, updatesPerSecond = PULSE_UPDATES_PER_SECOND } = pulse;
  // An even count puts a sample exactly on the peak.
  const steps = Math.max(2, 2 * Math.round((periodMs / 1000) * updatesPerSecond / 2));
  const stops: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const opacity = t <= 0.5
      ? rest + (peak - rest) * easeInOut(t * 2)
      : peak + (rest - peak) * easeInOut(t * 2 - 1);
    const timing = i < steps ? ' animation-timing-function: step-end;' : '';
    stops.push(`${round(t * 100)}% { opacity: ${round(opacity)};${timing} }`);
  }
  return `@keyframes ${name} { ${stops.join(' ')} }`;
}
