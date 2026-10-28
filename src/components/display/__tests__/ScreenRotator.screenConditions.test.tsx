// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen as dom, cleanup, act } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Screen } from '@/types/config';
import { sharedStateStore } from '@/lib/shared-state-store';

/**
 * Integration check of a screen's own visibility conditions in ScreenRotator,
 * driving the REAL shared-state bus (same harness as the takeover test):
 *
 *  - a conditional screen is out of the rotation while its key is unpublished
 *    or unmet, and joins the moment the value matches;
 *  - the display keeps the screen it is showing when another screen leaves;
 *  - when the shown screen itself leaves, the display moves to the screen
 *    that followed it;
 *  - with every screen conditioned out, every enabled screen rotates;
 *  - a showScreen rule still pins a screen the conditions keep out.
 */

// Keyed by screen id, with a mount log: a frame that shows another screen
// between two renders of the same one is a remount of its modules, which the
// text content alone cannot tell apart from a steady render.
const mounts: string[] = [];
function ScreenStub({ screen }: { screen: Screen }) {
  useEffect(() => { mounts.push(screen.id); }, [screen.id]);
  return <div data-testid="screen">{screen.id}</div>;
}
vi.mock('../ScreenRenderer', () => ({
  default: ({ screen }: { screen: Screen }) => <ScreenStub key={screen.id} screen={screen} />,
}));
vi.mock('../SleepOverlay', () => ({ default: () => null }));
vi.mock('../BackgroundProviderLayer', () => ({ default: () => null }));
vi.mock('../PluginServiceLayer', () => ({ default: () => null }));
vi.mock('../AlertOverlay', () => ({ default: () => null }));
vi.mock('../TimerOverlay', () => ({ default: () => null }));
vi.mock('../NetworkIndicator', () => ({ default: () => null }));
vi.mock('../useLiveConfig', () => ({
  useLiveConfig: (
    screens: Screen[],
    settings: GlobalSettings,
    hubTimezone: string,
    profiles: unknown,
    _displayId: string | undefined,
    displays: unknown,
    rules: DisplayRule[] | undefined,
  ) => ({ screens, settings: { ...settings, timezone: settings.timezone || hubTimezone }, profiles, rules, displays: displays ?? [] }),
}));
vi.mock('../useSharedDisplayData', () => ({ useSharedDisplayData: () => ({}) }));
vi.mock('../usePrefetchNextScreen', () => ({ usePrefetchNextScreen: () => {} }));
vi.mock('../useBootWarmup', () => ({ useBootWarmup: () => {} }));
vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));
vi.mock('../useBackgroundRotation', () => ({ useBackgroundRotation: () => ({}) }));
vi.mock('@/hooks/useDisplayCommands', () => ({
  useDisplayCommands: () => {},
  useStatusReporter: () => {},
}));
vi.mock('@/stores/plugin-store', () => ({
  usePluginStore: (sel: (s: { loadPlugins: () => void; plugins: Map<string, unknown> }) => unknown) =>
    sel({ loadPlugins: () => {}, plugins: new Map() }),
}));

import ScreenRotator, { placeAfterSetChange } from '../ScreenRotator';

const SOON = 'calendar.next_event_in_minutes';

function screenOf(id: string, extra: Partial<Screen> = {}): Screen {
  return {
    id,
    name: id,
    backgroundImage: '',
    modules: [{
      id: `${id}-text`, type: 'text', position: { x: 0, y: 0 }, size: { w: 100, h: 100 }, zIndex: 1,
      config: { content: id }, style: {} as Screen['modules'][number]['style'],
    }],
    ...extra,
  };
}

const eventSoon = { conditions: [{ kind: 'numeric' as const, sourceKey: SOON, below: 60 }] };
const SCREENS: Screen[] = [
  screenOf('home'),
  screenOf('travel', { visibility: eventSoon }),
  screenOf('weather'),
];

function makeSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    timezone: 'UTC',
    rotationIntervalMs: 1000,
    displayWidth: 1080,
    displayHeight: 1920,
    latitude: 0,
    longitude: 0,
    weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
    ...overrides,
  } as unknown as GlobalSettings;
}

function renderRotator(screens: Screen[] = SCREENS, rules: DisplayRule[] = []) {
  const out = render(
    <ScreenRotator hubTimezone="UTC" screens={screens} settings={makeSettings()} profiles={[]} rules={rules} />,
  );
  act(() => { vi.advanceTimersByTime(0); });
  return out;
}

const rendered = () => dom.getByTestId('screen').textContent;
const publish = (key: string, value: string) => act(() => { sharedStateStore.publish(key, value); });
const tick = (ms = 1000) => act(() => { vi.advanceTimersByTime(ms); });

describe('ScreenRotator screen conditions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sharedStateStore.__resetForTests();
    mounts.length = 0;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps a conditional screen out until its value matches, then rotates through it', () => {
    renderRotator();
    expect(rendered()).toBe('home');
    // Unpublished key, whenUnknown defaults to hide: home -> weather -> home.
    tick(); expect(rendered()).toBe('weather');
    tick(); expect(rendered()).toBe('home');

    publish(SOON, '45');
    tick(); expect(rendered()).toBe('travel');
    tick(); expect(rendered()).toBe('weather');

    publish(SOON, '180');
    tick(); expect(rendered()).toBe('home');
    tick(); expect(rendered()).toBe('weather');
  });

  it('stays on the screen it is showing when another screen leaves', () => {
    renderRotator();
    publish(SOON, '45');
    tick(); tick();
    expect(rendered()).toBe('weather');

    // travel leaves while weather is up: weather stays, no jump to home.
    publish(SOON, '180');
    expect(rendered()).toBe('weather');
    tick(); expect(rendered()).toBe('home');
  });

  it('does not remount the screen that stays when another screen leaves', () => {
    renderRotator();
    publish(SOON, '45');
    tick(); tick();
    expect(rendered()).toBe('weather');
    const before = mounts.length;

    // The index of weather shifts from 2 to 1. The commit that delivers the
    // new set must already show weather: a frame of home in between would
    // unmount weather's modules (an open recipe, a paged list) and mount
    // them again.
    publish(SOON, '180');
    expect(rendered()).toBe('weather');
    expect(mounts.slice(before)).toEqual([]);
  });

  it('keeps the running dwell when a screen joins or leaves mid-countdown', () => {
    renderRotator();
    expect(rendered()).toBe('home');
    // travel joins 400 ms into home's 1 s dwell: home still advances at 1 s.
    tick(400);
    publish(SOON, '45');
    tick(600);
    expect(rendered()).toBe('travel');

    tick();
    expect(rendered()).toBe('weather');
    // travel leaves 400 ms into weather's dwell: weather still advances at 1 s.
    tick(400);
    publish(SOON, '180');
    tick(600);
    expect(rendered()).toBe('home');
  });

  it('moves to the screen that followed when the shown screen leaves', () => {
    renderRotator();
    publish(SOON, '45');
    tick();
    expect(rendered()).toBe('travel');

    publish(SOON, '180');
    expect(rendered()).toBe('weather');
  });

  it('rotates every enabled screen when the conditions leave nothing', () => {
    const allGated = [
      screenOf('a', { visibility: eventSoon }),
      screenOf('b', { visibility: eventSoon }),
      screenOf('off', { enabled: false }),
    ];
    renderRotator(allGated);
    expect(rendered()).toBe('a');
    tick(); expect(rendered()).toBe('b');
    tick(); expect(rendered()).toBe('a');
  });

  it('lets a showScreen rule pin a screen the conditions keep out', () => {
    const DOOR = 'plugin:ha:door';
    const rule: DisplayRule = {
      id: 'r', name: 'Doorbell',
      when: [{ kind: 'state', sourceKey: DOOR, equals: 'open' }],
      action: { kind: 'showScreen', screenId: 'travel', mode: 'while' },
    };
    renderRotator(SCREENS, [rule]);
    expect(rendered()).toBe('home');
    publish(DOOR, 'closed');
    publish(DOOR, 'open');
    expect(rendered()).toBe('travel');
  });
});

describe('placeAfterSetChange', () => {
  const s = (ids: string[]) => ids.map((id) => screenOf(id));

  it('keeps the shown screen at its new index', () => {
    expect(placeAfterSetChange(s(['a', 'b', 'c']), 2, s(['a', 'c']))).toBe(1);
  });

  it('moves to the first following screen that survived', () => {
    expect(placeAfterSetChange(s(['a', 'b', 'c', 'd']), 1, s(['a', 'd']))).toBe(1);
  });

  it('falls back to the first screen when nothing after the shown one survived', () => {
    expect(placeAfterSetChange(s(['a', 'b', 'c']), 2, s(['a', 'b']))).toBe(0);
    expect(placeAfterSetChange(s(['a']), 0, s(['x', 'y']))).toBe(0);
    expect(placeAfterSetChange([], 0, s(['x']))).toBe(0);
  });
});
