// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Screen } from '@/types/config';

/**
 * A screen with nothing on it must not take a turn on the wall: adding one in
 * the editor used to put it straight into the rotation, so a wall that cycled
 * three screens went dark for a whole interval in every four. The rule itself
 * is in rotating-screens.test.ts; this is the wiring, including the two
 * things it must not break, the first-boot watermark and a pinned preview of
 * the screen somebody is still building.
 *
 * Same mock surface as ScreenRotator.dots.test.tsx.
 */

vi.mock('../ScreenRenderer', () => ({
  default: ({ screen }: { screen: Screen }) => <div data-testid="screen">{screen.id}</div>,
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

import ScreenRotator from '../ScreenRotator';

function emptyScreen(id: string): Screen {
  return { id, name: id, backgroundImage: '', modules: [] };
}

function screenOf(id: string): Screen {
  return {
    ...emptyScreen(id),
    modules: [{
      id: `${id}-text`, type: 'text', position: { x: 0, y: 0 }, size: { w: 100, h: 100 }, zIndex: 1,
      config: { content: id }, style: {} as Screen['modules'][number]['style'],
    }],
  };
}

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

const rendered = () => dom.queryByTestId('screen')?.textContent;
const dotLabels = () => [...document.querySelectorAll('[data-testid="pagination-dots"] button')]
  .map((b) => b.getAttribute('aria-label'));

describe('ScreenRotator with an unfinished screen in the list', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('rotates past the empty screen instead of showing it', () => {
    render(<ScreenRotator hubTimezone="UTC" screens={[screenOf('home'), emptyScreen('blank'), screenOf('weather')]} settings={makeSettings()} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(rendered()).toBe('home');

    // Three intervals: the two screens with content, and back again.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('weather');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('home');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('weather');
  });

  it('leaves no dot for a screen the rotation skips', () => {
    render(<ScreenRotator hubTimezone="UTC" screens={[screenOf('home'), emptyScreen('blank'), screenOf('weather')]} settings={makeSettings()} />);
    act(() => { vi.advanceTimersByTime(0); });

    // The active dot is the pause control and does not name its screen; the
    // other one names the screen it goes to, and it is not the blank one.
    expect(dotLabels()).toHaveLength(2);
    expect(dotLabels().join(' ')).not.toContain('blank');
    expect(dom.queryByTestId('empty-display-hint')).toBeNull();
  });

  it('still shows the setup watermark when every screen is empty', () => {
    render(<ScreenRotator hubTimezone="UTC" screens={[emptyScreen('one'), emptyScreen('two')]} settings={makeSettings()} />);
    act(() => { vi.advanceTimersByTime(0); });

    expect(dom.getByTestId('empty-display-hint')).toBeTruthy();
    expect(rendered()).toBeUndefined();
  });

  it('shows the empty screen when it is the one being previewed', () => {
    render(
      <ScreenRotator hubTimezone="UTC"
        screens={[screenOf('home'), emptyScreen('blank')]}
        settings={makeSettings()}
        initialScreenId="blank"
        preview
      />,
    );
    act(() => { vi.advanceTimersByTime(0); });

    expect(rendered()).toBe('blank');
    expect(dom.queryByTestId('empty-display-hint')).toBeNull();
  });
});
