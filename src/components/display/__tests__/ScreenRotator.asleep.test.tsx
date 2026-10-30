// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Profile, Screen } from '@/types/config';
import { sharedStateStore } from '@/lib/shared-state-store';

/**
 * A sleeping wall stops drawing its canvas. The sleep layer is a covering
 * div, so without this the current screen kept animating its clocks,
 * slideshows and colons all night under a black layer nobody could see.
 * While asleep the canvas, the pinned layer and the dots carry
 * `content-visibility: hidden` (layout kept, nothing painted, instant wake);
 * a takeover that overrides sleep draws again, and a dimmed display never
 * stops drawing because its content is visible at low brightness.
 *
 * Same harness as ScreenRotator.takeover.test.tsx: the real sleep manager
 * and rule engine over the real shared-state bus, leaf renderers mocked.
 */

vi.mock('../ScreenRenderer', () => ({
  default: ({ screen }: { screen: Screen }) => <div data-testid="screen">{screen.id}</div>,
}));
vi.mock('../SleepOverlay', () => ({
  default: ({ displayState }: { displayState: string }) => <div data-testid="sleep" data-state={displayState} />,
}));
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

import ScreenRotator from '../ScreenRotator';

const DOOR = 'plugin:ha:door';

// Each screen carries one ordinary module so it counts for rotation; the
// home screen also pins one, so the pinned layer has something to draw.
function screenOf(id: string, pinned = false): Screen {
  const mod = (suffix: string, extra: object = {}) => ({
    id: `${id}-${suffix}`, type: 'text' as const, position: { x: 0, y: 0 }, size: { w: 100, h: 100 }, zIndex: 1,
    config: { content: id }, style: {} as Screen['modules'][number]['style'], ...extra,
  });
  return {
    id,
    name: id,
    backgroundImage: '',
    modules: pinned ? [mod('text'), mod('pinned', { showOnEveryScreen: true })] : [mod('text')],
  };
}

const SCREENS: Screen[] = [screenOf('home', true), screenOf('weather'), screenOf('alert')];
const PROFILES: Profile[] = [{ id: 'day', name: 'Day', screenIds: ['home', 'weather'] }];

const takeoverRule: DisplayRule = {
  id: 'r-alert',
  name: 'Doorbell',
  when: [{ kind: 'state', sourceKey: DOOR, equals: 'open' }],
  action: { kind: 'showScreen', screenId: 'alert', mode: 'while' },
};

const SLEEP_ALL_DAY = {
  enabled: true,
  dimAfterMinutes: 1,
  sleepAfterMinutes: 1,
  dimBrightness: 20,
  schedule: { startTime: '00:00', endTime: '23:59' },
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

const rotator = (rules: DisplayRule[], settings: GlobalSettings) => (
  <ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={settings} profiles={PROFILES} rules={rules} />
);
const renderRotator = (rules: DisplayRule[], settings: GlobalSettings) => render(rotator(rules, settings));

function arm(key: string, value: string) {
  act(() => { sharedStateStore.publish(key, 'closed-baseline'); });
  act(() => { sharedStateStore.publish(key, value); });
}

const sleepState = () => dom.getByTestId('sleep').getAttribute('data-state');
const canvas = () => dom.getByTestId('display-canvas');
const drawing = (el: HTMLElement) => !el.hasAttribute('data-asleep')
  && (el.style as CSSStyleDeclaration & { contentVisibility?: string }).contentVisibility !== 'hidden';

describe('ScreenRotator while asleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sharedStateStore.__resetForTests();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops drawing the canvas, the pinned layer and the dots once the display sleeps', () => {
    const view = renderRotator([], makeSettings());
    act(() => { vi.advanceTimersByTime(0); });
    expect(sleepState()).toBe('active');
    expect(drawing(canvas())).toBe(true);
    expect(drawing(dom.getByTestId('pinned-layer'))).toBe(true);

    // A sleep schedule covering "now" arrives: the manager blacks out.
    view.rerender(rotator([], makeSettings({ sleep: SLEEP_ALL_DAY } as Partial<GlobalSettings>)));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(sleepState()).toBe('asleep');
    expect(drawing(canvas())).toBe(false);
    expect(drawing(dom.getByTestId('pinned-layer'))).toBe(false);
    const dots = dom.getByRole('button', { name: /Go to screen 2/ }).closest('[data-rotation-hold]') as HTMLElement;
    expect(drawing(dots)).toBe(false);
    // Nothing was unmounted: the screen is still in the tree for an instant wake.
    expect(dom.getByTestId('screen').textContent).toBe('home');
  });

  it('draws again while a takeover overrides sleep', () => {
    renderRotator([takeoverRule], makeSettings({ sleep: SLEEP_ALL_DAY } as Partial<GlobalSettings>));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(sleepState()).toBe('asleep');
    expect(drawing(canvas())).toBe(false);

    arm(DOOR, 'open');
    expect(dom.getByTestId('screen').textContent).toBe('alert');
    expect(sleepState()).toBe('active');
    expect(drawing(canvas())).toBe(true);
  });

  it('keeps drawing a dimmed display', () => {
    renderRotator([], makeSettings({
      sleep: { ...SLEEP_ALL_DAY, schedule: undefined, dimAfterMinutes: 1, sleepAfterMinutes: 60 },
    } as Partial<GlobalSettings>));
    act(() => { vi.advanceTimersByTime(70_000); });
    expect(sleepState()).toBe('dimmed');
    expect(drawing(canvas())).toBe(true);
  });
});
