// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useScaledFontSize } from '../useScaledFontSize';

/**
 * jsdom has no layout and no ResizeObserver, which is exactly why the bug these
 * tests cover shipped: every module test stubs the observer out, and a stubbed
 * observer reports nothing, so a hook that measures nothing looked identical to
 * a hook that measures correctly.
 *
 * So this measures the wiring rather than the pixels. `clientHeight` is stubbed
 * on the prototype and the observer is a fake the test fires by hand; what is
 * being asserted is which element the hook ends up watching, and when.
 */
let boxHeight = 0;
let boxWidth = 600;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  targets: Element[] = [];
  constructor(private cb: ResizeObserverCallback) { FakeResizeObserver.instances.push(this); }
  /** Report a resize the way the browser would, entries and all. */
  fire() { act(() => this.cb([], this as unknown as ResizeObserver)); }
  observe(el: Element) { this.targets.push(el); }
  unobserve(el: Element) { this.targets = this.targets.filter((t) => t !== el); }
  disconnect() { this.targets = []; }
  /** The one observer still watching something, i.e. the live one. */
  static get live(): FakeResizeObserver | undefined {
    return FakeResizeObserver.instances.filter((i) => i.targets.length > 0).pop();
  }
}

beforeEach(() => {
  boxHeight = 0;
  boxWidth = 600;
  FakeResizeObserver.instances = [];
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => boxHeight });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => boxWidth });
  (globalThis as unknown as { ResizeObserver: typeof FakeResizeObserver }).ResizeObserver = FakeResizeObserver;
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
});

/** The size the hook reported on the last render, read back off the DOM so the
 *  harness has no state of its own to get out of sync. */
const latest = () => Number(screen.getByTestId('size').textContent);

/** A fresh tree each time, so a test that mounts twice reads one size, not two. */
function mount(props: Parameters<typeof Harness>[0]) {
  cleanup();
  return render(<Harness {...props} />);
}

/**
 * Stands in for a module that paints a loading branch before its real tree:
 * with `mounted` false the measured element does not exist yet, exactly as in
 * weather (always, on first paint) and news (whenever its feeds are in flight).
 */
function Harness({ mounted, base = 16, scale, factor = 0.1, tag = 'div' }: {
  mounted: boolean; base?: number; scale?: number; factor?: number; tag?: 'div' | 'section';
}) {
  const { containerRef, scaledFontSize } = useScaledFontSize({ fontSize: base, textScale: scale }, factor);
  return (
    <>
      <output data-testid="size">{scaledFontSize}</output>
      {mounted && (tag === 'div' ? <div ref={containerRef} /> : <section ref={containerRef as never} />)}
    </>
  );
}

describe('useScaledFontSize', () => {
  it('measures an element that mounts on a later render than the component', () => {
    boxHeight = 400;
    const { rerender } = mount({ mounted: false });
    // Nothing to measure yet, so the raw style size is all it can report.
    expect(latest()).toBe(16);

    rerender(<Harness mounted />);
    // The regression: an effect-attached RefObject ran once, while this element
    // did not exist, and nothing re-ran it — so every weather view rendered at
    // the raw 16 for the life of the page instead of 400 * 0.1.
    expect(latest()).toBe(40);
  });

  it('treats the style font size as a floor in pixels, never as a multiplier', () => {
    boxHeight = 400;
    // A card large enough shows the fitted size whatever the floor is. For one
    // release this read 32 as "2x" and rendered 80: every wall that had ever
    // set a normal pixel size on one of these modules doubled or tripled.
    mount({ mounted: true, base: 32 });
    expect(latest()).toBe(40);

    mount({ mounted: true, base: 8 });
    expect(latest()).toBe(40);

    mount({ mounted: true, base: 16 });
    expect(latest()).toBe(40);
  });

  it('never renders below the floor, however small the card', () => {
    // 100 * 0.1 = 10px, which is not readable across a room; the floor is the
    // style size, so a wall that raised it keeps what it asked for.
    boxHeight = 100;
    mount({ mounted: true });
    expect(latest()).toBe(16);

    mount({ mounted: true, base: 32 });
    expect(latest()).toBe(32);
  });

  it('a raised floor is what shows once it passes the fitted size', () => {
    boxHeight = 400;
    mount({ mounted: true, base: 48 });
    expect(latest()).toBe(48);
    mount({ mounted: true, base: 32 });
    expect(latest()).toBe(40);
  });

  it('Text size scales the fitted size in both directions, and absent is 100%', () => {
    boxHeight = 400;
    mount({ mounted: true, scale: 150 });
    expect(latest()).toBe(60);
    // Smaller than it fits: the case a floor alone could never reach.
    mount({ mounted: true, scale: 50 });
    expect(latest()).toBe(20);
    // The floor arrives already scaled (resolveModuleStyle), so in a card that
    // fits below it the floor is what shows.
    boxHeight = 100;
    mount({ mounted: true, base: 8, scale: 50 });
    expect(latest()).toBe(8);
    // Out-of-range and nonsense values are clamped or ignored, never trusted.
    boxHeight = 400;
    mount({ mounted: true, scale: 900 });
    expect(latest()).toBe(180);
    mount({ mounted: true, scale: Number.NaN });
    expect(latest()).toBe(40);
  });

  it('publishes the fitted size for the editor', () => {
    boxHeight = 400;
    const { container } = mount({ mounted: true });
    expect(container.querySelector('[data-fitted-px]')?.getAttribute('data-fitted-px')).toBe('40');
  });

  it('falls back to the raw size while the box measures zero', () => {
    boxHeight = 0;
    mount({ mounted: true });
    expect(latest()).toBe(16);
  });

  it('follows the node when a module hands the ref to a different element', () => {
    boxHeight = 400;
    const { rerender } = mount({ mounted: true });
    expect(latest()).toBe(40);

    // The fullscreen news module does this: a loading shell carries the ref,
    // then the real view does. An observer left on the detached shell would
    // keep reporting the old box.
    boxHeight = 800;
    rerender(<Harness mounted tag="section" />);
    expect(latest()).toBe(80);
    expect(FakeResizeObserver.live?.targets[0]?.tagName).toBe('SECTION');
  });

  it('re-measures the same element when the observer reports a new size', () => {
    boxHeight = 400;
    mount({ mounted: true });
    expect(latest()).toBe(40);

    // A module that grows has to win back the size it lost: the other half of
    // this bug class was a measurement that settled once and then ignored its
    // box forever.
    boxHeight = 1000;
    FakeResizeObserver.live!.fire();
    expect(latest()).toBe(100);
  });
});
