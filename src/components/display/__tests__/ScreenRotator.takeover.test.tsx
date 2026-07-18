// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act, fireEvent } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Profile, Screen } from '@/types/config';
import { sharedStateStore } from '@/lib/shared-state-store';

/**
 * Integration check of ScreenRotator's rule-takeover wiring, driving the REAL
 * rule engine + sleep manager through the REAL shared-state bus (mirroring
 * ScreenRenderer.reactive.test.tsx's store-driving idiom). The heavy data
 * hooks (live config, prefetch, background rotation, command/status transport)
 * and the leaf render components are mocked to isolate the takeover behavior:
 *
 *  - a firing showScreen rule pins its target and rotation resumes at the
 *    prior index once the takeover releases;
 *  - manual navigation releases the takeover and it does not re-pin;
 *  - the sleep overlay is suppressed while a takeover is up on a
 *    sleep-scheduled display;
 *  - a sleep-action rule blacks out an active takeover.
 */

// --- Mock the leaf renderers so we can read exactly what ScreenRotator drives.
vi.mock('../ScreenRenderer', () => ({
  default: ({ screen }: { screen: Screen }) => <div data-testid="screen">{screen.id}</div>,
}));
vi.mock('../SleepOverlay', () => ({
  default: ({ displayState, dimOpacity }: { displayState: string; dimOpacity: number }) => (
    <div data-testid="sleep" data-state={displayState} data-dim={dimOpacity} />
  ),
}));
vi.mock('../BackgroundProviderLayer', () => ({ default: () => null }));
vi.mock('../PluginServiceLayer', () => ({ default: () => null }));
vi.mock('../AlertOverlay', () => ({ default: () => null }));
vi.mock('../NetworkIndicator', () => ({ default: () => null }));

// --- Mock the network/data hooks so the component runs offline & deterministic.
vi.mock('../useLiveConfig', () => ({
  useLiveConfig: (
    screens: Screen[],
    settings: GlobalSettings,
    profiles: unknown,
    _displayId: string | undefined,
    displays: unknown,
    rules: DisplayRule[] | undefined,
  ) => ({ screens, settings, profiles, rules, displays: displays ?? [] }),
}));
vi.mock('../useSharedDisplayData', () => ({ useSharedDisplayData: () => ({}) }));
vi.mock('../usePrefetchNextScreen', () => ({ usePrefetchNextScreen: () => {} }));
vi.mock('../useBackgroundRotation', () => ({ useBackgroundRotation: () => ({}) }));
vi.mock('@/hooks/useDisplayCommands', () => ({
  useDisplayCommands: () => {},
  useStatusReporter: () => {},
}));
vi.mock('@/stores/plugin-store', () => ({
  usePluginStore: (sel: (s: { loadPlugins: () => void; plugins: Map<string, unknown> }) => unknown) =>
    sel({ loadPlugins: () => {}, plugins: new Map() }),
}));

import ScreenRotator from '../ScreenRotator';

const DOOR = 'plugin:ha:door';
const PANIC = 'plugin:ha:panic';

function screenOf(id: string): Screen {
  return { id, name: id, backgroundImage: '', modules: [] };
}

// 'alert' lives in the display's full screen list but is excluded from the
// active rotation profile — the feature's primary shape (an alert screen only
// a takeover ever shows), which also keeps normal rotation off it in the test.
const SCREENS: Screen[] = [screenOf('home'), screenOf('weather'), screenOf('alert')];
const PROFILES: Profile[] = [{ id: 'day', name: 'Day', screenIds: ['home', 'weather'] }];

const takeoverRule: DisplayRule = {
  id: 'r-alert',
  name: 'Doorbell',
  when: [{ kind: 'state', sourceKey: DOOR, equals: 'open' }],
  action: { kind: 'showScreen', screenId: 'alert', mode: 'while' },
};
const sleepRule: DisplayRule = {
  id: 'r-sleep',
  name: 'Panic sleep',
  when: [{ kind: 'state', sourceKey: PANIC, equals: 'on' }],
  action: { kind: 'sleep' },
};

function makeSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    timezone: 'UTC',
    rotationIntervalMs: 1000,
    displayWidth: 1080,
    displayHeight: 1920,
    latitude: 0,
    longitude: 0,
    weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
    activeProfile: 'day',
    ...overrides,
  } as unknown as GlobalSettings;
}

function renderRotator(rules: DisplayRule[], settings: GlobalSettings) {
  return render(
    <ScreenRotator screens={SCREENS} settings={settings} profiles={PROFILES} rules={rules} />,
  );
}

/** Drive the rule condition to a definite value; publishing a non-matching
 *  value first makes the key "known" so the subsequent match is a real edge
 *  (the engine never fires on a key's first arrival — boot safety). */
function arm(key: string, value: string) {
  act(() => {
    sharedStateStore.publish(key, value === 'open' || value === 'on' ? 'closed-baseline' : value);
  });
  act(() => {
    sharedStateStore.publish(key, value);
  });
}

const rendered = () => dom.getByTestId('screen').textContent;

describe('ScreenRotator rule takeover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sharedStateStore.__resetForTests();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pins the takeover screen and resumes at the prior rotation index on release', () => {
    renderRotator([takeoverRule], makeSettings());
    // Let mount effects settle (viewport measure, first engine advance).
    act(() => { vi.advanceTimersByTime(0); });
    expect(rendered()).toBe('home');

    // Advance rotation one step so the "prior index" is weather (index 1).
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('weather');

    // Fire the takeover — it pins 'alert' without touching the rotation index.
    arm(DOOR, 'open');
    expect(rendered()).toBe('alert');

    // Condition clears; a `while` takeover holds for the 5s min-hold floor,
    // then releases back to the rotation screen it interrupted (weather).
    act(() => { sharedStateStore.publish(DOOR, 'closed'); });
    expect(rendered()).toBe('alert');
    act(() => { vi.advanceTimersByTime(5_100); });
    expect(rendered()).toBe('weather');
  });

  it('releases the takeover on manual navigation and does not re-pin', () => {
    renderRotator([takeoverRule], makeSettings());
    act(() => { vi.advanceTimersByTime(0); });

    arm(DOOR, 'open');
    expect(rendered()).toBe('alert');

    // Click the (non-active) pagination dot for screen 2 — manual nav wins.
    act(() => {
      fireEvent.click(dom.getByRole('button', { name: /Go to screen 2/ }));
    });
    expect(rendered()).toBe('weather');

    // Door is still 'open', but a released rule only re-fires on a fresh
    // false->true edge, so the takeover ('alert', excluded from rotation) must
    // never reassert itself — normal rotation only ever shows home/weather.
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(rendered()).not.toBe('alert');
  });

  it('suppresses the sleep overlay while a takeover is up on a sleep-scheduled display', () => {
    const settings = makeSettings({
      sleep: {
        enabled: true,
        dimAfterMinutes: 1,
        sleepAfterMinutes: 1,
        dimBrightness: 20,
        schedule: { startTime: '00:00', endTime: '23:59' },
      },
    } as Partial<GlobalSettings>);
    renderRotator([takeoverRule], settings);

    // The sleep schedule window covers "now" — the 10s manager tick blacks out.
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(dom.getByTestId('sleep').getAttribute('data-state')).toBe('asleep');

    // A takeover fires: ScreenRotator overrides the overlay to 'active' so the
    // alert screen is visible, and the schedule resumes when it releases.
    arm(DOOR, 'open');
    expect(rendered()).toBe('alert');
    expect(dom.getByTestId('sleep').getAttribute('data-state')).toBe('active');
    expect(dom.getByTestId('sleep').getAttribute('data-dim')).toBe('0');
  });

  it('blacks out an active takeover when a sleep-action rule fires', () => {
    renderRotator([takeoverRule, sleepRule], makeSettings());
    act(() => { vi.advanceTimersByTime(0); });

    arm(DOOR, 'open');
    expect(rendered()).toBe('alert');

    // The sleep rule fires: the engine drops the takeover and the display
    // sleeps, so the overlay blacks out and rotation owns the render again.
    arm(PANIC, 'on');
    expect(rendered()).not.toBe('alert');
    expect(dom.getByTestId('sleep').getAttribute('data-state')).toBe('asleep');
  });
});
