// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import DisplayControlModule from '..';
import { I18nProvider } from '@/i18n/provider';
import { __resetLoaderForTests } from '@/i18n/loader';
import { RotationProvider, type RotationState } from '@/components/display/rotation-context';
import { BurnInProtectionProvider } from '@/components/display/burn-in-context';
import { pixelShiftMinute, wanderOffset } from '@/lib/pixel-shift';
import enUSModules from '@/translations/en-US/modules.json';

/**
 * The dock pill answers the display's burn-in protection by drifting inside
 * the room around it, a pixel a minute on the minute boundary, as far as
 * that room allows, and holds still without it. jsdom lays nothing out, so
 * the dock's box, the pill's room and the pill itself are given sizes by
 * stubbing the element measurements the dock reads.
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

/** Which stubbed size an element reports: the dock box, its room, or the pill. */
function sizeOf(el: Element): Size | undefined {
  const h = el as HTMLElement;
  if (h.dataset?.layout === 'dock') return sizes.box;
  if (h.dataset?.testid === 'display-control-dock-room') return sizes.room;
  if (h.dataset?.testid === 'display-control-dock') return sizes.pill;
  return undefined;
}

function renderDock(protect: boolean | null) {
  const tree = (children: ReactNode) => {
    const inner = (
      <I18nProvider locale="en-US" blob={{ modules: enUSModules }}>
        <RotationProvider value={rotation}>{children}</RotationProvider>
      </I18nProvider>
    );
    return protect === null ? inner : <BurnInProtectionProvider value={protect}>{inner}</BurnInProtectionProvider>;
  };
  return render(tree(<DisplayControlModule config={config} availableDisplays={[]} />));
}

const pill = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="display-control-dock"]')!;
const at = (minute: number, rx: number, ry: number) => {
  const { x, y } = wanderOffset(minute, rx, ry, 'centre');
  return `translate(${x}px, ${y}px)`;
};

describe('Display Control dock wander', () => {
  const START = Date.parse('2026-11-07T15:30:20Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) { return sizeOf(this)?.w ?? 0; });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) { return sizeOf(this)?.h ?? 0; });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return sizeOf(this)?.w ?? 0; });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return sizeOf(this)?.h ?? 0; });
    // A bottom dock: a wide strip with a pill much shorter than it is.
    sizes = { box: { w: 1080, h: 160 }, room: { w: 1060, h: 140 }, pill: { w: 500, h: 120 } };
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

  it('drifts along a bottom dock by the long reach and across it by half the spare room, a pixel a minute on the boundary', () => {
    const { container } = renderDock(true);
    act(() => { vi.advanceTimersByTime(0); });
    // Along: (1060 - 500) / 2 = 280, capped at 30. Across: (140 - 120) / 2 = 10.
    const m0 = pixelShiftMinute(START);
    expect(pill(container).style.transform).toBe(at(m0, 30, 10));
    expect(pill(container).style.transition).toBe('');

    act(() => { vi.advanceTimersByTime(39_000); });
    expect(pill(container).style.transform).toBe(at(m0, 30, 10));
    act(() => { vi.advanceTimersByTime(1_100); });
    expect(pill(container).style.transform).toBe(at(m0 + 1, 30, 10));
    expect(at(m0 + 1, 30, 10)).not.toBe(at(m0, 30, 10));
  });

  it('runs the long reach down a side dock', () => {
    sizes = { box: { w: 200, h: 1000 }, room: { w: 180, h: 980 }, pill: { w: 150, h: 400 } };
    const { container } = renderDock(true);
    act(() => { vi.advanceTimersByTime(0); });
    // Across: (180 - 150) / 2 = 15, capped at 12. Along: (980 - 400) / 2 = 290, capped at 30.
    expect(pill(container).style.transform).toBe(at(pixelShiftMinute(START), 12, 30));
  });

  it('holds still when the pill fills its room, as a scrolling pill does', () => {
    sizes = { box: { w: 1080, h: 160 }, room: { w: 1060, h: 140 }, pill: { w: 1060, h: 140 } };
    const { container } = renderDock(true);
    act(() => { vi.advanceTimersByTime(0); });
    expect(pill(container).style.transform).toBe('translate(0px, 0px)');
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(pill(container).style.transform).toBe('translate(0px, 0px)');
  });
});
