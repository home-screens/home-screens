// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Screen } from '@/types/config';
import { pixelShiftMinute, pixelShiftOffset, pixelShiftTransform } from '@/lib/pixel-shift';

/**
 * Burn-in protection: with `pixelShift` on, the wall's root box is translated
 * along the lattice and steps on the minute boundary with no transition.
 * Off (the default) and in the editor's preview, the root carries no
 * transform at all. Same mock surface as ScreenRotator.dots.test.tsx.
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

const SCREENS: Screen[] = [{
  id: 'home',
  name: 'home',
  backgroundImage: '',
  modules: [{
    id: 'home-text', type: 'text', position: { x: 0, y: 0 }, size: { w: 100, h: 100 }, zIndex: 1,
    config: { content: 'home' }, style: {} as Screen['modules'][number]['style'],
  }],
}];

function makeSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    timezone: 'UTC',
    rotationIntervalMs: 0,
    displayWidth: 1080,
    displayHeight: 1920,
    latitude: 0,
    longitude: 0,
    weather: { provider: 'weatherapi', units: 'imperial' },
    ...overrides,
  } as unknown as GlobalSettings;
}

const root = () => dom.getByTestId('display-root');
// The rotator measures the jsdom window on mount, so the scale is known.
const translateOf = (offset: { x: number; y: number }) => pixelShiftTransform(offset, window.innerWidth, window.innerHeight);

describe('ScreenRotator burn-in protection', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('leaves the root untouched while off', () => {
    render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={makeSettings()} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(root().style.transform).toBe('');
  });

  it('sits on the current minute\'s spot, holds still inside the minute, and steps on the boundary', () => {
    // 20 s into a minute, so the first boundary is 40 s away.
    const start = Date.parse('2026-11-05T15:30:20Z');
    vi.setSystemTime(start);
    render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={makeSettings({ pixelShift: true })} />);
    act(() => { vi.advanceTimersByTime(0); });

    const first = translateOf(pixelShiftOffset(pixelShiftMinute(start)));
    expect(root().style.transform).toBe(first);
    expect(first).toContain('scale(');
    // A glide would redraw the wall every frame for its whole duration.
    expect(root().style.transition).toBe('');

    act(() => { vi.advanceTimersByTime(39_000); });
    expect(root().style.transform).toBe(first);

    act(() => { vi.advanceTimersByTime(1_100); });
    const second = translateOf(pixelShiftOffset(pixelShiftMinute(start) + 1));
    expect(second).not.toBe(first);
    expect(root().style.transform).toBe(second);
  });

  it('never shifts the editor preview', () => {
    render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={makeSettings({ pixelShift: true })} preview />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(root().style.transform).toBe('');
  });

  it('returns the root to rest when the setting is switched off', () => {
    const { rerender } = render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={makeSettings({ pixelShift: true })} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(root().style.transform).not.toBe('');
    rerender(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={makeSettings({ pixelShift: false })} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(root().style.transform).toBe('');
  });
});
