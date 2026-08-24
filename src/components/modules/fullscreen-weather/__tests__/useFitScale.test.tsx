// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useRef } from 'react';
import { useFitScale, FIT_FACTOR_ATTR } from '../useFitScale';

/**
 * The fit loop bisects for the largest scale factor that still fits the canvas,
 * one probe per animation frame. Its correctness used to rest on a timing
 * assumption that does not hold: that React has committed a probe by the frame
 * after the loop dispatched it. React commits on a MessageChannel task, so
 * under load — a burst of config edits in the editor is exactly that — the
 * commit slips a frame and the loop judges the new probe against the previous
 * layout.
 *
 * These tests model that slip. The "browser" here has two states: what React
 * has dispatched, and what the DOM actually renders. `lagFrames` is how many
 * frames the second trails the first. Layout advances once per frame whether or
 * not anyone measures it, because that is what a real browser does.
 *
 * Both the measured height and `FIT_FACTOR_ATTR` are served from the rendered
 * factor, never the dispatched one — React writes the attribute and the styles
 * in the same commit, so they can never disagree in a real DOM. That is exactly
 * what makes the attribute a trustworthy staleness signal.
 */

/** Content is 2000px tall at factor 1; the canvas is 1000px. */
const CONTENT_AT_FULL = 2000;
const CANVAS = 1000;
/** The largest factor that fits: 2000 * f <= 1000. */
const IDEAL = CANVAS / CONTENT_AT_FULL;

let frameCallbacks: FrameRequestCallback[] = [];
/** The factor React has rendered (the component's current state). */
let dispatchedFactor = 1;
/** The factor the DOM is actually laid out at. */
let renderedFactor = 1;
let commitQueue: number[] = [];

/**
 * One animation frame: the browser first lays out whatever React has committed
 * (delayed by `lagFrames`), then runs the frame callbacks.
 */
function tickFrame(lagFrames: number) {
  commitQueue.push(dispatchedFactor);
  if (commitQueue.length > lagFrames) renderedFactor = commitQueue.shift()!;

  const due = frameCallbacks;
  frameCallbacks = [];
  for (const cb of due) cb(0);
}

/** Run frames until the loop stops asking for more. */
function runToSettle(lagFrames: number, maxFrames = 300) {
  for (let i = 0; i < maxFrames && frameCallbacks.length > 0; i++) {
    act(() => { tickFrame(lagFrames); });
  }
}

function Harness({ onFactor }: { onFactor: (f: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const factor = useFitScale(ref, ['fixed-deps']);
  onFactor(factor);
  return <div ref={ref} {...{ [FIT_FACTOR_ATTR]: String(factor) }} />;
}

/** Serve every layout read from `renderedFactor`. jsdom has no layout of its own. */
function installFakeLayout() {
  const sizes: Record<string, () => number> = {
    clientHeight: () => CANVAS,
    clientWidth: () => CANVAS,
    scrollWidth: () => CANVAS,
    scrollHeight: () => Math.max(CANVAS, Math.round(CONTENT_AT_FULL * renderedFactor)),
  };
  for (const [prop, get] of Object.entries(sizes)) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get });
  }

  // React writes the attribute into jsdom immediately, but the *browser* only
  // exposes it once committed — serve the rendered value so the attribute and
  // the height always describe the same layout.
  const realGetAttribute = HTMLElement.prototype.getAttribute;
  Object.defineProperty(HTMLElement.prototype, 'getAttribute', {
    configurable: true,
    value(this: HTMLElement, name: string) {
      if (name === FIT_FACTOR_ATTR) return String(renderedFactor);
      return realGetAttribute.call(this, name);
    },
  });

  return () => {
    for (const prop of Object.keys(sizes)) {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
    }
    Object.defineProperty(HTMLElement.prototype, 'getAttribute', {
      configurable: true, value: realGetAttribute,
    });
  };
}

function measureConverged(lagFrames: number): number {
  dispatchedFactor = 1;
  renderedFactor = 1;
  commitQueue = [];
  frameCallbacks = [];

  const restore = installFakeLayout();
  try {
    act(() => {
      render(<Harness onFactor={(f) => { dispatchedFactor = f; }} />);
    });
    runToSettle(lagFrames);
    return dispatchedFactor;
  } finally {
    restore();
  }
}

describe('useFitScale', () => {
  beforeEach(() => {
    frameCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frameCallbacks.push(cb);
      return frameCallbacks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converges on the largest factor that fits when every commit lands on time', () => {
    const converged = measureConverged(0);
    // 7 bisection steps over [0.34, 1] resolve to about half a percent.
    expect(converged).toBeGreaterThan(IDEAL - 0.01);
    expect(converged).toBeLessThanOrEqual(IDEAL + 0.01);
  });

  /**
   * The regression.
   *
   * Before the staleness check, a one-frame lag made the loop judge probe 0.67
   * against the factor-1 layout, call it "does not fit", and bisect inside
   * [0.34, 0.67] — every later probe compounding the same error until it
   * bottomed out at the 0.34 floor. On screen that is type shrunk to a third of
   * its size with the layout swimming in slack, and it stuck: nothing re-runs
   * the effect until the deps change, so only a page reload cleared it.
   */
  it('still converges correctly when React commits a frame late', () => {
    const converged = measureConverged(1);
    expect(
      converged,
      `a one-frame commit lag must not move where the bisection lands (got ${converged}, ideal ${IDEAL})`,
    ).toBeGreaterThan(IDEAL - 0.01);
    expect(converged).toBeLessThanOrEqual(IDEAL + 0.01);
  });

  it('lands in the same place whether or not the commit lagged', () => {
    expect(measureConverged(1)).toBeCloseTo(measureConverged(0), 5);
  });

  it('survives a two-frame lag', () => {
    expect(measureConverged(2)).toBeCloseTo(measureConverged(0), 5);
  });
});
