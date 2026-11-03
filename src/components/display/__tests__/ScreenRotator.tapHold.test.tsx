// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Screen } from '@/types/config';
import { BROWSE_ROTATION_HOLD_MS, TAP_ROTATION_HOLD_MS } from '../useTapRotationHold';

/**
 * A tap on a control holds the rotation timer for a moment, so a screen
 * change cannot take the chart out from under a half-finished tap. It must
 * never swallow a flick: someone who ticks a chore and then flicks is asking
 * for the next screen. Same mock surface as ScreenRotator.dots.test.tsx, with
 * a button on every screen to tap.
 */

vi.mock('../ScreenRenderer', () => ({
  default: ({ screen }: { screen: Screen }) => (
    <div>
      <div data-testid="screen">{screen.id}</div>
      <button type="button">tick</button>
      <div data-rotation-hold="browse"><span>recipe tile</span></div>
    </div>
  ),
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

const SETTINGS = {
  timezone: 'UTC',
  rotationIntervalMs: 1000,
  displayWidth: 1080,
  displayHeight: 1920,
  latitude: 0,
  longitude: 0,
  weather: { provider: 'weatherapi', units: 'imperial' },
} as unknown as GlobalSettings;

const rendered = () => dom.getByTestId('screen').textContent;

function pointer(type: string, target: Element, clientX: number) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, isPrimary: true, pointerId: 1, clientX, clientY: 100,
  }));
}

function tapControl() {
  const button = dom.getByRole('button', { name: 'tick' });
  act(() => {
    pointer('pointerdown', button, 200);
    pointer('pointerup', button, 200);
  });
}

function flickLeft() {
  act(() => {
    pointer('pointerdown', document.body, 600);
    pointer('pointerup', document.body, 300);
  });
}

describe('ScreenRotator tap hold', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('keeps the screen in place for a moment after a tap on a control', () => {
    render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={SETTINGS} />);
    act(() => { vi.advanceTimersByTime(500); });
    tapControl();
    act(() => { vi.advanceTimersByTime(TAP_ROTATION_HOLD_MS - 1); });
    expect(rendered()).toBe('home');
    // Released, then a fresh dwell.
    act(() => { vi.advanceTimersByTime(1); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('weather');
  });

  // Someone reading recipes pauses longer than a chore tap's moment between touches.
  it('holds a browsing surface for a minute after any touch on it', () => {
    render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={SETTINGS} />);
    act(() => { vi.advanceTimersByTime(500); });
    const tile = dom.getByText('recipe tile');
    act(() => { pointer('pointerdown', tile, 200); pointer('pointerup', tile, 200); });
    act(() => { vi.advanceTimersByTime(10_000); });
    // A control tapped inside the minute does not cut it to eight seconds.
    tapControl();
    act(() => { vi.advanceTimersByTime(BROWSE_ROTATION_HOLD_MS - 10_000 - 1); });
    expect(rendered()).toBe('home');
    // Released, then a fresh dwell.
    act(() => { vi.advanceTimersByTime(1); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(rendered()).toBe('weather');
  });

  it('still changes screens on a flick right after a tap', () => {
    render(<ScreenRotator hubTimezone="UTC" screens={SCREENS} settings={SETTINGS} />);
    act(() => { vi.advanceTimersByTime(0); });
    tapControl();
    flickLeft();
    expect(rendered()).toBe('weather');
  });
});
