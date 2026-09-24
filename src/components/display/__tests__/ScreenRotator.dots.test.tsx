// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act, fireEvent } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Screen } from '@/types/config';

/**
 * The Screen dots setting. The double-tap pause and the progress line both
 * live on the dots, so hiding them must also switch those off, including a
 * pause that was already on when the dots went away: with no pill and no dot
 * left to double-tap, a held pause would freeze the wall for good. Same mock
 * surface as ScreenRotator.preview.test.tsx.
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
// PaginationDots translates its paused pill; no locale blob is loaded here.
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

const rendered = () => dom.getByTestId('screen').textContent;

function doubleTapActiveDot() {
  const active = document.querySelector('button[aria-current="true"]');
  expect(active).not.toBeNull();
  act(() => {
    fireEvent.click(active!);
    fireEvent.click(active!);
  });
}

describe('ScreenRotator screen dots', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('draws no dots or progress line when switched off, and keeps rotating', () => {
    render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={makeSettings({ showPaginationDots: false })} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(dom.queryByTestId('pagination-dots')).toBeNull();
    expect(dom.queryByTestId('rotation-progress')).toBeNull();
    expect(rendered()).toBe('home');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('weather');
  });

  it('releases a pause that was on when the dots were switched off', () => {
    // Never auto-resumes, so only the dots switch can release it.
    const paused = makeSettings({ pauseTimeoutSeconds: 0 });
    const { rerender } = render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={paused} />);
    act(() => { vi.advanceTimersByTime(0); });
    doubleTapActiveDot();
    expect(dom.getByTestId('pause-pill')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(rendered()).toBe('home');

    rerender(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={{ ...paused, showPaginationDots: false }} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(dom.queryByTestId('pause-pill')).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('weather');

    // Turning the dots back on does not bring the old pause back.
    rerender(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={paused} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(dom.queryByTestId('pause-pill')).toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('alert');
  });
});
