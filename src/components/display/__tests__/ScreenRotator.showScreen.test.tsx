// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act, fireEvent } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Profile, Screen } from '@/types/config';
import { useRotation } from '../rotation-context';

/**
 * What the Display Control dock gets from ScreenRotator through
 * RotationContext: every switched-on screen, the showing one, and
 * `showScreen`, which jumps the rotation for a rotating screen and pins a
 * screen outside it (off-profile here) for one dwell, or for good when
 * rotation is off. The leaf renderer is replaced by a probe that reads the
 * context and offers one button per screen the way the dock does.
 */

vi.mock('../ScreenRenderer', () => {
  function ScreenProbe({ screen }: { screen: Screen }) {
    const rotation = useRotation();
    return (
      <div data-testid="screen" data-active={rotation?.activeScreenId ?? ''}>
        {screen.id}
        {rotation?.allScreens.map((s) => (
          <button key={s.id} type="button" onClick={() => rotation.showScreen(s.id)}>show:{s.id}</button>
        ))}
      </div>
    );
  }
  return { default: ScreenProbe };
});
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

import ScreenRotator from '../ScreenRotator';

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

// 'extra' is switched on but outside the active profile; 'off' is switched off.
const SCREENS: Screen[] = [screenOf('home'), screenOf('weather'), screenOf('extra'), screenOf('off', { enabled: false })];
const PROFILES: Profile[] = [{ id: 'day', name: 'Day', screenIds: ['home', 'weather'] }];

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

function renderRotator(settings: GlobalSettings) {
  return render(
    <ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={settings} profiles={PROFILES} rules={[]} />,
  );
}

const shown = () => dom.getByTestId('screen').firstChild?.textContent;
const active = () => dom.getByTestId('screen').getAttribute('data-active');
const show = (id: string) => act(() => { fireEvent.click(dom.getByRole('button', { name: `show:${id}` })); });

describe('ScreenRotator showScreen', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('offers every switched-on screen, rotating or not, and never a switched-off one', () => {
    renderRotator(makeSettings());
    act(() => { vi.advanceTimersByTime(0); });
    const offered = dom.getAllByRole('button', { name: /^show:/ }).map((b) => b.textContent);
    expect(offered).toEqual(['show:home', 'show:weather', 'show:extra']);
  });

  it('jumps the rotation for a rotating screen', () => {
    renderRotator(makeSettings());
    act(() => { vi.advanceTimersByTime(0); });
    expect(shown()).toBe('home');
    show('weather');
    expect(shown()).toBe('weather');
    expect(active()).toBe('weather');
    // A fresh dwell: the rotation moves on a full interval later, not sooner.
    act(() => { vi.advanceTimersByTime(900); });
    expect(shown()).toBe('weather');
    act(() => { vi.advanceTimersByTime(200); });
    expect(shown()).toBe('home');
  });

  it('pins a screen outside the rotation for one dwell, then rotation moves on', () => {
    renderRotator(makeSettings());
    act(() => { vi.advanceTimersByTime(0); });
    show('extra');
    expect(shown()).toBe('extra');
    expect(active()).toBe('extra');
    act(() => { vi.advanceTimersByTime(900); });
    expect(shown()).toBe('extra');
    act(() => { vi.advanceTimersByTime(200); });
    expect(['home', 'weather']).toContain(shown());
    // Released for good: the pin does not come back on the next turn.
    act(() => { vi.advanceTimersByTime(3000); });
    expect(shown()).not.toBe('extra');
  });

  it('with rotation off, a pinned screen stays until the next tap', () => {
    renderRotator(makeSettings({ rotationIntervalMs: 0 }));
    act(() => { vi.advanceTimersByTime(0); });
    show('extra');
    expect(shown()).toBe('extra');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(shown()).toBe('extra');
    show('home');
    expect(shown()).toBe('home');
  });
});
