// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useRef } from 'react';
import { useFitScale, FIT_FACTOR_ATTR, FIT_MEASURE_ATTR } from '../useFitScale';

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
/** Whether the hook reports the search finished. */
let dispatchedSettled = false;
/** The factor the DOM is actually laid out at. */
let renderedFactor = 1;
let commitQueue: number[] = [];
/** How many distinct factors the "browser" has laid out so far. */
let commitsLanded = 0;
/** After this many landed commits the browser stops committing (a stall). */
let stallAfterCommits = Infinity;

/**
 * One animation frame: the browser first lays out whatever React has committed
 * (delayed by `lagFrames`), then runs the frame callbacks.
 */
function tickFrame(lagFrames: number) {
  commitQueue.push(dispatchedFactor);
  if (commitQueue.length > lagFrames && commitsLanded < stallAfterCommits) {
    const next = commitQueue.shift()!;
    if (next !== renderedFactor) commitsLanded += 1;
    renderedFactor = next;
  }

  const due = frameCallbacks;
  frameCallbacks = [];
  for (const cb of due) cb(0);
}

/** Run frames until the loop stops asking for more, and prove it finished. */
function runToSettle(lagFrames: number, maxFrames = 400) {
  for (let i = 0; i < maxFrames && frameCallbacks.length > 0; i++) {
    act(() => { tickFrame(lagFrames); });
  }
  expect(frameCallbacks, 'the loop is still asking for frames').toHaveLength(0);
  expect(dispatchedSettled, 'the loop stopped without settling').toBe(true);
}

/**
 * `column` renders an interior box inside the measured root, stamped with
 * `FIT_MEASURE_ATTR` or not, for the interior-overflow tests.
 */
type Column = 'none' | 'stamped' | 'unstamped';

function Harness({ onFit, column = 'none' }: { onFit: (f: number, settled: boolean) => void; column?: Column }) {
  const ref = useRef<HTMLDivElement>(null);
  const { factor, settled } = useFitScale(ref, ['fixed-deps']);
  onFit(factor, settled);
  return (
    <div ref={ref} {...{ [FIT_FACTOR_ATTR]: String(factor) }}>
      {column === 'stamped' && <div {...{ [FIT_MEASURE_ATTR]: '' }} />}
      {column === 'unstamped' && <div />}
    </div>
  );
}

/**
 * Where the overflow lives. `root`: the root is taller than the canvas.
 * `interior`: the root fits on both axes, and every element *inside* it is
 * wider than its box — the fixed-width-column case, where the root's own
 * scroll metrics never move.
 */
type Overflow = 'root' | 'interior';

/** Serve every layout read from `renderedFactor`. jsdom has no layout of its own. */
function installFakeLayout(overflow: Overflow = 'root') {
  const content = () => Math.max(CANVAS, Math.round(CONTENT_AT_FULL * renderedFactor));
  const isRoot = (el: HTMLElement) => el.hasAttribute(FIT_FACTOR_ATTR);
  const sizes: Record<string, (this: HTMLElement) => number> = {
    clientHeight: () => CANVAS,
    clientWidth: () => CANVAS,
    scrollWidth() { return overflow === 'interior' && !isRoot(this) ? content() : CANVAS; },
    scrollHeight() { return overflow === 'root' ? content() : CANVAS; },
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

function resetBrowser() {
  dispatchedFactor = 1;
  dispatchedSettled = false;
  renderedFactor = 1;
  commitQueue = [];
  commitsLanded = 0;
  stallAfterCommits = Infinity;
  frameCallbacks = [];
}

function mountHarness(column: Column = 'none') {
  return render(<Harness column={column} onFit={(f, settled) => { dispatchedFactor = f; dispatchedSettled = settled; }} />);
}

function measureConverged(lagFrames: number): number {
  resetBrowser();
  const restore = installFakeLayout();
  try {
    act(() => { mountHarness(); });
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
   * Overflow inside a fixed-width column never reaches the root's scroll
   * metrics: the content renders over the neighbouring column instead. That
   * is how the landscape Panorama hero ended up on top of the temperature
   * ribbon at factor 1. A box stamped with `FIT_MEASURE_ATTR` is judged
   * alongside the root; an unstamped one is the caller's own business.
   */
  describe('interior boxes', () => {
    it('shrinks for a stamped box that overflows while the root fits', () => {
      resetBrowser();
      const restore = installFakeLayout('interior');
      try {
        act(() => { mountHarness('stamped'); });
        runToSettle(0);
        expect(dispatchedFactor).toBeGreaterThan(IDEAL - 0.01);
        expect(dispatchedFactor).toBeLessThanOrEqual(IDEAL + 0.01);
      } finally {
        restore();
      }
    });

    it('does not measure a box that is not stamped', () => {
      resetBrowser();
      const restore = installFakeLayout('interior');
      try {
        act(() => { mountHarness('unstamped'); });
        runToSettle(0);
        expect(dispatchedFactor).toBe(1);
      } finally {
        restore();
      }
    });
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

  /**
   * The wait used to give up after 20 frames and measure the stale layout
   * anyway, so a commit that slipped a third of a second (a busy machine)
   * reintroduced the corruption above. A slow commit must be waited out, and
   * the answer must be the same one a fast commit gives.
   */
  it('waits out a commit that slips well past the old 20-frame bound', () => {
    expect(measureConverged(25)).toBeCloseTo(measureConverged(0), 5);
  });

  /**
   * The expiry path. When a commit never arrives the loop must not judge the
   * stale layout, and it must not fall to the unmeasured MIN_FACTOR floor
   * either — that is the tiny type the loop exists to avoid. It settles on
   * the largest factor it has *measured* to fit, says so on the console, and
   * reports itself settled so nothing waits on it forever.
   */
  describe('when a commit never arrives', () => {
    it('settles on the largest factor already measured to fit, loudly', () => {
      resetBrowser();
      // Probe 1 (does not fit) and probe 0.67 (does not fit) commit; the
      // probe after that never does. Nothing has fitted yet at that point,
      // so fall through to a later stall: let three commits land, which
      // includes the first fitting probe (0.5 fits: 2000 * 0.5 = 1000).
      stallAfterCommits = 2;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const restore = installFakeLayout();
      try {
        act(() => { mountHarness(); });
        runToSettle(0, 400);
        // Committed layouts: 1 (start), 0.67 (fails), 0.505 (fits). The next
        // probe never lands, so the loop settles on 0.505.
        expect(dispatchedFactor).toBeCloseTo(0.505, 3);
        expect(dispatchedFactor).toBeGreaterThan(0.34);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toMatch(/never committed/);
      } finally {
        restore();
        warn.mockRestore();
      }
    });

    it('settles on the layout on screen when nothing has been measured to fit', () => {
      resetBrowser();
      // Only the first probe (1, does not fit) is ever laid out.
      stallAfterCommits = 0;
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const restore = installFakeLayout();
      try {
        act(() => { mountHarness(); });
        runToSettle(0, 400);
        expect(dispatchedFactor).toBe(1);
        expect(warn).toHaveBeenCalledTimes(1);
      } finally {
        restore();
        warn.mockRestore();
      }
    });
  });

  /**
   * A measurement taken while a web font is still loading describes the
   * fallback face; the swap changes every line's height after the loop has
   * settled, with nothing to re-run it. The loop discards such a measurement
   * and takes it again once the fonts are in.
   */
  it('re-measures after a pending web font lands instead of settling on the fallback face', async () => {
    resetBrowser();
    let resolveFonts!: () => void;
    const fonts = { status: 'loading' as 'loading' | 'loaded', ready: new Promise<void>((r) => { resolveFonts = r; }) };
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    const restore = installFakeLayout();
    try {
      act(() => { mountHarness(); });
      // While the font loads, frames pass and no probe is consumed.
      act(() => { tickFrame(0); });
      expect(frameCallbacks).toHaveLength(0);
      expect(dispatchedFactor).toBe(1);
      expect(dispatchedSettled).toBe(false);

      fonts.status = 'loaded';
      resolveFonts();
      await act(async () => { await fonts.ready; });
      expect(frameCallbacks).toHaveLength(1);
      runToSettle(0);
      expect(dispatchedFactor).toBeGreaterThan(IDEAL - 0.01);
      expect(dispatchedFactor).toBeLessThanOrEqual(IDEAL + 0.01);
    } finally {
      restore();
      delete (document as unknown as Record<string, unknown>).fonts;
    }
  });
});
