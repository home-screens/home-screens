// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen as dom, cleanup, act, fireEvent } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Profile, Screen } from '@/types/config';

/**
 * The editor's Preview button opens `/display?screen=<id>&preview=1`. Checks
 * that ScreenRotator honours both: it starts on the requested screen (pinned
 * if the rotation excludes it), and in preview mode neither rotates nor talks
 * to the hub. Same mock surface as ScreenRotator.takeover.test.tsx.
 */

vi.mock('../ScreenRenderer', () => ({
  default: ({ screen }: { screen: Screen }) => <div data-testid="screen">{screen.id}</div>,
}));
vi.mock('../SleepOverlay', () => ({ default: () => null }));
vi.mock('../BackgroundProviderLayer', () => ({ default: () => null }));
vi.mock('../PluginServiceLayer', () => ({ default: () => null }));
vi.mock('../AlertOverlay', () => ({ default: () => null }));
const timerOverlay = vi.fn(() => <div data-testid="live-timer" />);
vi.mock('../TimerOverlay', () => ({ default: () => timerOverlay() }));
vi.mock('../NetworkIndicator', () => ({ default: () => null }));
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
vi.mock('../useBootWarmup', () => ({ useBootWarmup: () => {} }));
// PaginationDots translates its paused pill; no locale blob is loaded here.
vi.mock('@/i18n', () => ({ useTranslate: () => (key: string) => key }));
vi.mock('../useBackgroundRotation', () => ({ useBackgroundRotation: () => ({}) }));
const useDisplayCommands = vi.fn();
const useStatusReporter = vi.fn();
vi.mock('@/hooks/useDisplayCommands', () => ({
  useDisplayCommands: (...args: unknown[]) => useDisplayCommands(...args),
  useStatusReporter: (...args: unknown[]) => useStatusReporter(...args),
}));
vi.mock('@/stores/plugin-store', () => ({
  usePluginStore: (sel: (s: { loadPlugins: () => void; plugins: Map<string, unknown> }) => unknown) =>
    sel({ loadPlugins: () => {}, plugins: new Map() }),
}));

import ScreenRotator from '../ScreenRotator';

function screenOf(id: string): Screen {
  return {
    id,
    name: id,
    backgroundImage: '',
    modules: [{
      id: `${id}-text`, type: 'text', position: { x: 0, y: 0 }, size: { w: 100, h: 100 }, zIndex: 1,
      config: { content: id }, style: {} as Screen['modules'][number]['style'],
    }],
  };
}

const SCREENS: Screen[] = [screenOf('home'), screenOf('weather'), screenOf('alert')];
const PROFILES: Profile[] = [{ id: 'day', name: 'Day', screenIds: ['home', 'weather'] }];

function makeSettings(): GlobalSettings {
  return {
    timezone: 'UTC',
    rotationIntervalMs: 1000,
    displayWidth: 1080,
    displayHeight: 1920,
    latitude: 0,
    longitude: 0,
    weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
    activeProfile: 'day',
  } as unknown as GlobalSettings;
}

const rendered = () => dom.getByTestId('screen').textContent;

describe('ScreenRotator start screen and preview mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useDisplayCommands.mockClear();
    useStatusReporter.mockClear();
    timerOverlay.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts on the requested screen and rotates on from there', () => {
    render(<ScreenRotator screens={SCREENS} settings={makeSettings()} profiles={PROFILES} initialScreenId="weather" />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(rendered()).toBe('weather');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('home');
  });

  it('still starts on the requested screen when Strict Mode runs mount effects twice', () => {
    render(
      <StrictMode>
        <ScreenRotator screens={SCREENS} settings={makeSettings()} profiles={PROFILES} initialScreenId="weather" preview />
      </StrictMode>,
    );
    act(() => { vi.advanceTimersByTime(0); });
    expect(rendered()).toBe('weather');
  });

  it('pins a requested screen the rotation excludes until the first navigation', () => {
    render(<ScreenRotator screens={SCREENS} settings={makeSettings()} profiles={PROFILES} initialScreenId="alert" preview />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(rendered()).toBe('alert');

    act(() => {
      fireEvent.click(dom.getByRole('button', { name: /Go to screen 2/ }));
    });
    expect(rendered()).toBe('weather');
  });

  it('forgets the requested start screen once the user navigates away from it', () => {
    // 'alert' is off-profile: pinned at first, then the user taps a dot.
    const { rerender } = render(
      <ScreenRotator screens={SCREENS} settings={makeSettings()} profiles={PROFILES} initialScreenId="alert" preview />,
    );
    act(() => { vi.advanceTimersByTime(0); });
    expect(rendered()).toBe('alert');
    act(() => { fireEvent.click(dom.getByRole('button', { name: /Go to screen 2/ })); });
    expect(rendered()).toBe('weather');

    // A profile switch that now includes 'alert' must not yank the display
    // back to it (the screen set changed, so the rotation resets to its first).
    const wider: Profile[] = [{ id: 'day', name: 'Day', screenIds: ['home', 'weather', 'alert'] }];
    rerender(<ScreenRotator screens={SCREENS} settings={makeSettings()} profiles={wider} initialScreenId="alert" preview />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(rendered()).toBe('home');
  });

  it('preview holds rotation and keeps the tab out of the hub\'s command and status traffic', () => {
    render(<ScreenRotator screens={SCREENS} settings={makeSettings()} profiles={PROFILES} initialScreenId="weather" preview />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(rendered()).toBe('weather');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(rendered()).toBe('weather');
    expect(dom.getByTestId('pause-pill')).toBeTruthy();

    // Third arg of useDisplayCommands / last arg of useStatusReporter is `enabled`.
    expect(useDisplayCommands).toHaveBeenCalled();
    expect(useDisplayCommands.mock.calls.every((c) => c[2] === false)).toBe(true);
    expect(useStatusReporter.mock.calls.every((c) => c[c.length - 1] === false)).toBe(true);
  });

  it('preview runs no display rules, so a showScreen rule cannot swap the previewed screen', async () => {
    const { sharedStateStore } = await import('@/lib/shared-state-store');
    sharedStateStore.__resetForTests();
    const rule: DisplayRule = {
      id: 'r', name: 'Door', when: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'open' }],
      action: { kind: 'showScreen', screenId: 'alert', mode: 'while' },
    };
    render(<ScreenRotator screens={SCREENS} settings={makeSettings()} profiles={PROFILES} rules={[rule]} initialScreenId="weather" preview />);
    act(() => { vi.advanceTimersByTime(0); });
    act(() => { sharedStateStore.publish('plugin:ha:door', 'closed'); });
    act(() => { sharedStateStore.publish('plugin:ha:door', 'open'); });
    expect(rendered()).toBe('weather');
  });

  it('never mounts the live timer in a preview, including after polling intervals', () => {
    render(<ScreenRotator screens={SCREENS} settings={makeSettings()} profiles={PROFILES} displayId="main" initialScreenId="weather" preview />);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(rendered()).toBe('weather');
    // TimerOverlay owns its polling, sound and step-done POST. Keeping it
    // unmounted prevents all three, as well as covering the previewed screen.
    expect(timerOverlay).not.toHaveBeenCalled();
    expect(dom.queryByTestId('live-timer')).toBeNull();
  });

  it('a normal display keeps hub traffic on', () => {
    render(<ScreenRotator screens={SCREENS} settings={makeSettings()} profiles={PROFILES} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(useDisplayCommands.mock.calls.every((c) => c[2] === true)).toBe(true);
    expect(useStatusReporter.mock.calls.every((c) => c[c.length - 1] === true)).toBe(true);
    expect(dom.getByTestId('live-timer')).toBeTruthy();
  });
});
