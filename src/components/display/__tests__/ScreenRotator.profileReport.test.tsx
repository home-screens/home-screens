// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Profile, Screen } from '@/types/config';

/**
 * The heartbeat names the profile the wall is rotating, not the manual pick.
 * A scheduled profile overrides the pick while its window is open, and the
 * phone ticked the pick anyway because the heartbeat only carried that. Same
 * mock surface as ScreenRotator.preview.test.tsx.
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

const SCREENS: Screen[] = [screenOf('home'), screenOf('weather'), screenOf('homework')];
const PROFILES: Profile[] = [
  { id: 'school', name: 'School', screenIds: ['homework'], schedule: { startTime: '07:00', endTime: '15:00' } },
  { id: 'day', name: 'Day', screenIds: ['home', 'weather'] },
];

const SETTINGS = {
  timezone: 'UTC',
  rotationIntervalMs: 1000,
  displayWidth: 1080,
  displayHeight: 1920,
  latitude: 0,
  longitude: 0,
  weather: { provider: 'weatherapi', units: 'imperial' },
  activeProfile: 'day',
} as unknown as GlobalSettings;

/** The profile argument of the most recent status report. */
const reportedProfile = () => {
  const last = useStatusReporter.mock.calls.at(-1)!;
  const { profileId, scheduled } = last[4] as { profileId: string | null; scheduled: boolean };
  return { profileId, scheduled };
};

describe('ScreenRotator profile report', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useStatusReporter.mockClear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('reports the scheduled profile while its window is open', () => {
    vi.setSystemTime(new Date('2026-10-05T09:00:00Z'));
    render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={SETTINGS} profiles={PROFILES} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(reportedProfile()).toEqual({ profileId: 'school', scheduled: true });
  });

  it('reports the manual pick once no schedule matches', () => {
    vi.setSystemTime(new Date('2026-10-05T17:00:00Z'));
    render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={SETTINGS} profiles={PROFILES} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(reportedProfile()).toEqual({ profileId: 'day', scheduled: false });
  });
});
