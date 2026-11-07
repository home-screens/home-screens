// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import DisplayControlModule from '..';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import { RotationProvider, type RotationState } from '@/components/display/rotation-context';
import { BurnInProtectionProvider } from '@/components/display/burn-in-context';
import { pixelShiftMinute, wanderBetween } from '@/lib/pixel-shift';
import { controlMetrics } from '../metrics';
import enUSModules from '@/translations/en-US/modules.json';

/**
 * The dock pill answers the display's burn-in protection by drifting inside
 * the empty space around it, a pixel a minute on the minute boundary, and
 * holds still without it. Its room on each side is half the spare room in
 * its centring box plus the dock's margin, except on a side that sits
 * against the screen edge. jsdom lays nothing out, so the dock's box, the
 * pill's centring box, the pill and where the box sits on a 1080 by 1920
 * screen are all stubbed.
 */

vi.mock('@/hooks/useDisplayId', () => ({ useDisplayId: () => 'kitchen' }));

const rotation: RotationState = {
  screens: [
    { id: 's1', name: 'Home', iconType: 'clock' },
    { id: 's2', name: 'Calendar', iconType: 'calendar' },
  ],
  allScreens: [
    { id: 's1', name: 'Home', iconType: 'clock' },
    { id: 's2', name: 'Calendar', iconType: 'calendar' },
  ],
  activeScreenId: 's1',
  showScreen: vi.fn(),
};

const config = { layout: 'dock' as const, defaultTarget: 'self', allowRetargeting: false, compact: false };

type Size = { w: number; h: number };
let sizes: Record<string, Size> = {};
/** Where the dock's box sits on the screen: left and top, its size taken from `sizes.box`. */
let place = { left: 40, top: 800 };
const VIEWPORT = { w: 1080, h: 1920 };

/** Which stubbed size an element reports: the dock box, its centring box, or the pill. */
function sizeOf(el: Element): Size | undefined {
  const h = el as HTMLElement;
  if (h.dataset?.layout === 'dock') return sizes.box;
  if (h.dataset?.testid === 'display-control-dock-room') return sizes.room;
  if (h.dataset?.testid === 'display-control-dock') return sizes.pill;
  return undefined;
}

function rectOf(el: Element): DOMRect {
  if ((el as HTMLElement).dataset?.layout !== 'dock') return new DOMRect(0, 0, 0, 0);
  return new DOMRect(place.left, place.top, sizes.box.w, sizes.box.h);
}

function renderDock(protect: boolean | null, over: Partial<typeof config> = {}) {
  const tree = (children: ReactNode) => {
    const inner = (
      <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
        <RotationProvider value={rotation}>{children}</RotationProvider>
      </I18nProvider>
    );
    return protect === null ? inner : <BurnInProtectionProvider value={protect}>{inner}</BurnInProtectionProvider>;
  };
  const displays = [{ id: 'kitchen', name: 'Kitchen' }, { id: 'hall', name: 'Hall' }];
  return render(tree(<DisplayControlModule config={{ ...config, ...over }} availableDisplays={displays} />));
}

const pill = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="display-control-dock"]')!;
const at = (minute: number, x: readonly [number, number], y: readonly [number, number]) =>
  `translate(${wanderBetween(minute, x[0], x[1])}px, ${wanderBetween(minute, y[0], y[1])}px)`;

describe('Display Control dock wander', () => {
  const START = Date.parse('2026-11-07T15:30:20Z');
  const m0 = pixelShiftMinute(START);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) { return sizeOf(this)?.w ?? 0; });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) { return sizeOf(this)?.h ?? 0; });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return sizeOf(this)?.w ?? 0; });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return sizeOf(this)?.h ?? 0; });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) { return rectOf(this); });
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(VIEWPORT.w);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VIEWPORT.h);
    // A bottom-style dock clear of every screen edge: a wide strip with a
    // pill much narrower than it and a little shorter.
    sizes = { box: { w: 1000, h: 160 }, room: { w: 980, h: 140 }, pill: { w: 500, h: 130 } };
    place = { left: 40, top: 800 };
  });
  afterEach(() => {
    cleanup();
    __resetLoaderForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('holds still without protection, and with the provider saying no', () => {
    expect(pill(renderDock(null).container).style.transform).toBe('');
    cleanup();
    expect(pill(renderDock(false).container).style.transform).toBe('');
  });

  it('drifts along by the long reach and across by the spare room plus the margin, a pixel a minute on the boundary', () => {
    const { container } = renderDock(true);
    act(() => { vi.advanceTimersByTime(0); });
    // The margin on a 160 px tall dock is 9.6 px. Along: (980 - 500) / 2 +
    // 9.6, capped at 30. Across: (140 - 130) / 2 + 9.6 = 14.6, capped at 12.
    expect(pill(container).style.transform).toBe(at(m0, [-30, 30], [-12, 12]));
    expect(pill(container).style.transition).toBe('');

    act(() => { vi.advanceTimersByTime(39_000); });
    expect(pill(container).style.transform).toBe(at(m0, [-30, 30], [-12, 12]));
    act(() => { vi.advanceTimersByTime(1_100); });
    expect(pill(container).style.transform).toBe(at(m0 + 1, [-30, 30], [-12, 12]));
    expect(at(m0 + 1, [-30, 30], [-12, 12])).not.toBe(at(m0, [-30, 30], [-12, 12]));
  });

  it('runs the long reach down a side dock', () => {
    sizes = { box: { w: 200, h: 1000 }, room: { w: 180, h: 980 }, pill: { w: 150, h: 400 } };
    place = { left: 700, top: 400 };
    const { container } = renderDock(true);
    act(() => { vi.advanceTimersByTime(0); });
    // Across: (180 - 150) / 2 + 12, capped at 12. Along: (980 - 400) / 2 + 12, capped at 30.
    expect(pill(container).style.transform).toBe(at(m0, [-12, 12], [-30, 30]));
  });

  it('moves into the margin when the pill fills its centring box, as the tiles do across most docks', () => {
    sizes = { box: { w: 1000, h: 200 }, room: { w: 976, h: 176 }, pill: { w: 838, h: 176 } };
    const { container } = renderDock(true);
    act(() => { vi.advanceTimersByTime(0); });
    // The margin on a 200 px tall dock is 12 px: all the room there is across it.
    expect(pill(container).style.transform).toBe(at(m0, [-30, 30], [-12, 12]));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(pill(container).style.transform).toBe(at(m0 + 1, [-30, 30], [-12, 12]));
  });

  it('flush with the bottom of the screen, drifts up into its margin and never below where it rests', () => {
    sizes = { box: { w: 1080, h: 200 }, room: { w: 1056, h: 176 }, pill: { w: 838, h: 176 } };
    place = { left: 0, top: 1720 };
    const { container } = renderDock(true);
    act(() => { vi.advanceTimersByTime(0); });
    // Against the left, right and bottom edges: no margin there. Along, the
    // spare room alone is past the cap; across, only the margin above.
    expect(pill(container).style.transform).toBe(at(m0, [-30, 30], [-12, 0]));
    const ys = new Set<number>();
    for (let i = 0; i < 30; i++) {
      ys.add(Number(pill(container).style.transform.match(/, (-?\d+)px\)$/)![1]));
      act(() => { vi.advanceTimersByTime(60_000); });
    }
    expect(Math.max(...ys)).toBe(0);
    expect(Math.min(...ys)).toBe(-12);
  });

  it('keeps clear of the picker row above it: the gap to the picker caps the drift upward', () => {
    sizes = { box: { w: 1000, h: 300 }, room: { w: 976, h: 150 }, pill: { w: 838, h: 150 } };
    const { container } = renderDock(true, { allowRetargeting: true });
    act(() => { vi.advanceTimersByTime(0); });
    // The pill fills its centring box across, so its room upward is the gap
    // to the picker row and its room downward the 12 px margin.
    const gap = controlMetrics({ w: 1000, h: 300, layout: 'bar', compact: false, showPicker: true }).gap;
    expect(gap).toBeLessThan(12);
    expect(pill(container).style.transform).toBe(at(m0, [-30, 30], [-Math.floor(gap), 12]));
  });
});
