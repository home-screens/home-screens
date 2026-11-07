// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen as dom, cleanup, act, fireEvent } from '@testing-library/react';
import type { DisplayRule, GlobalSettings, Profile, Screen } from '@/types/config';
import { useRotation } from '../rotation-context';

/**
 * A screen that shows only when opened: never in the rotation, pinned when
 * a module's open button (or the dock) shows it, back to the screen it came
 * from after its quiet time or on the back chip, and released by any move.
 * The leaf renderer is replaced by a probe that offers one "show" button per
 * switched-on screen, the way the dock and an open button do.
 */

vi.mock('../ScreenRenderer', () => {
  // The chip is drawn inside the frame by the real renderer; the probe draws
  // it the same way from the same prop.
  function ScreenProbe({ screen, openedBack }: { screen: Screen; openedBack?: { name: string | null; onBack: () => void; hidden: boolean } }) {
    const rotation = useRotation();
    return (
      <div data-testid="screen" data-active={rotation?.activeScreenId ?? ''}>
        {screen.id}
        {openedBack && !openedBack.hidden && (
          <button type="button" data-testid="opened-screen-back" onClick={openedBack.onBack}>{`openedScreen.backTo:${openedBack.name}`}</button>
        )}
        {rotation?.allScreens.map((s) => (
          <button key={s.id} type="button" onClick={() => rotation.showScreen(s.id)}>show:{s.id}</button>
        ))}
        <span data-testid="dock">{rotation?.screens.map((s) => s.id).join(',')}</span>
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
vi.mock('@/i18n', () => ({ useTranslate: () => (key: string, vars?: Record<string, unknown>) => (vars?.name ? `${key}:${vars.name}` : key) }));
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
    name: `${id} name`,
    backgroundImage: '',
    modules: [{
      id: `${id}-text`, type: 'text', position: { x: 0, y: 0 }, size: { w: 100, h: 100 }, zIndex: 1,
      config: { content: id }, style: {} as Screen['modules'][number]['style'],
    }],
    ...extra,
  };
}

// 'recipes' shows only when opened, with a 5 s quiet time; 'extra' is on
// but off-profile (the dock's one-dwell pin); 'off' is switched off.
const SCREENS: Screen[] = [
  screenOf('home'),
  screenOf('weather'),
  screenOf('recipes', { rotation: 'opened', goBackAfterMs: 5_000 }),
  screenOf('extra'),
  screenOf('off', { enabled: false }),
];
const PROFILES: Profile[] = [{ id: 'day', name: 'Day', screenIds: ['home', 'weather', 'recipes'] }];

function makeSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    timezone: 'UTC',
    rotationIntervalMs: 1000,
    displayWidth: 1080,
    displayHeight: 1920,
    latitude: 0,
    longitude: 0,
    weather: { provider: 'weatherapi', units: 'imperial' },
    activeProfile: 'day',
    ...overrides,
  } as unknown as GlobalSettings;
}

function renderRotator(settings: GlobalSettings, screens = SCREENS) {
  return render(
    <ScreenRotator hubTimezone="UTC" screens={screens} settings={settings} profiles={PROFILES} rules={[]} />,
  );
}

const shown = () => dom.getByTestId('screen').firstChild?.textContent;
const show = (id: string) => act(() => { fireEvent.click(dom.getByRole('button', { name: `show:${id}` })); });
const touch = () => act(() => { fireEvent.pointerDown(dom.getByTestId('screen')); });
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
/** Past the guard that swallows a second tap right after a screen change. */
const settle = () => tick(500);

describe('ScreenRotator: a screen that shows only when opened', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('never takes a turn, but is offered to open', () => {
    renderRotator(makeSettings());
    tick(0);
    expect(dom.getByTestId('dock').textContent).toBe('home,weather');
    const offered = dom.getAllByRole('button', { name: /^show:/ }).map((b) => b.textContent);
    expect(offered).toEqual(['show:home', 'show:weather', 'show:recipes', 'show:extra']);
    tick(2500);
    expect(['home', 'weather']).toContain(shown());
    tick(3000);
    expect(shown()).not.toBe('recipes');
  });

  it('opens, holds through its quiet time with no rotation, and goes back where it came from', () => {
    renderRotator(makeSettings());
    tick(0);
    expect(shown()).toBe('home');
    expect(dom.getByTestId('rotation-progress')).toBeTruthy();
    show('recipes');
    expect(shown()).toBe('recipes');
    expect(dom.getByTestId('opened-screen-back')).toBeTruthy();
    expect(dom.getByRole('button', { name: 'openedScreen.backTo:home name' })).toBeTruthy();
    // The dots go with the rotation: the opened screen has no place in it.
    expect(dom.queryByTestId('rotation-progress')).toBeNull();
    // The rotation's own interval passes without moving the display.
    tick(4000);
    expect(shown()).toBe('recipes');
    tick(1100);
    expect(shown()).toBe('home');
    expect(dom.queryByTestId('opened-screen-back')).toBeNull();
    // A fresh dwell on the way back.
    tick(900);
    expect(shown()).toBe('home');
    tick(200);
    expect(shown()).toBe('weather');
  });

  it('any touch starts the quiet time again', () => {
    renderRotator(makeSettings());
    tick(0);
    show('recipes');
    tick(4000);
    touch();
    tick(4000);
    expect(shown()).toBe('recipes');
    tick(1100);
    expect(shown()).toBe('home');
  });

  it('goes back to the screen it left even when that was the second one', () => {
    renderRotator(makeSettings());
    tick(0);
    show('weather');
    settle();
    show('recipes');
    tick(5100);
    expect(shown()).toBe('weather');
  });

  it('the back chip returns at once', () => {
    renderRotator(makeSettings());
    tick(0);
    show('recipes');
    settle();
    act(() => { fireEvent.click(dom.getByRole('button', { name: 'openedScreen.backTo:home name' })); });
    expect(shown()).toBe('home');
  });

  it('a quiet time of 0 stays until someone moves on', () => {
    renderRotator(makeSettings(), SCREENS.map((s) => (s.id === 'recipes' ? { ...s, goBackAfterMs: 0 } : s)));
    tick(0);
    show('recipes');
    tick(60_000);
    expect(shown()).toBe('recipes');
    show('weather');
    expect(shown()).toBe('weather');
    expect(dom.queryByTestId('opened-screen-back')).toBeNull();
  });

  it('a screen that names no quiet time gets the two-minute default', () => {
    renderRotator(makeSettings(), SCREENS.map((s) => (s.id === 'recipes' ? { ...s, goBackAfterMs: undefined } : s)));
    tick(0);
    show('recipes');
    tick(119_000);
    expect(shown()).toBe('recipes');
    tick(1_100);
    expect(shown()).toBe('home');
  });

  it('with rotation off, the quiet time still takes the display back', () => {
    renderRotator(makeSettings({ rotationIntervalMs: 0 }));
    tick(0);
    show('recipes');
    tick(5100);
    expect(shown()).toBe('home');
    tick(10_000);
    expect(shown()).toBe('home');
  });

  it('a screen that is on but off-profile still pins for one dwell, with no chip', () => {
    renderRotator(makeSettings());
    tick(0);
    show('extra');
    expect(shown()).toBe('extra');
    expect(dom.queryByTestId('opened-screen-back')).toBeNull();
    tick(1100);
    expect(['home', 'weather']).toContain(shown());
  });

  it('a pause set by hand survives a visit to the opened screen', () => {
    renderRotator(makeSettings());
    tick(0);
    // The pause gesture is a double tap on the active dot.
    const dot = dom.getAllByRole('button', { name: /pause rotation/i })[0];
    act(() => { fireEvent.click(dot); fireEvent.click(dot); });
    expect(dom.getByTestId('pause-pill')).toBeTruthy();
    show('recipes');
    tick(5_100);
    expect(shown()).toBe('home');
    expect(dom.getByTestId('pause-pill')).toBeTruthy();
    tick(5_000);
    expect(shown()).toBe('home');
  });

  it('an opened-only screen outside its schedule cannot be opened, and is not offered', () => {
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
    const evening = SCREENS.map((s) => (s.id === 'recipes' ? { ...s, schedule: { startTime: '18:00', endTime: '21:00' } } : s));
    renderRotator(makeSettings(), evening);
    tick(0);
    expect(dom.queryByRole('button', { name: 'show:recipes' })).toBeNull();
    cleanup();

    vi.setSystemTime(new Date('2026-11-06T19:00:00Z'));
    renderRotator(makeSettings(), evening);
    tick(0);
    show('recipes');
    expect(shown()).toBe('recipes');
  });

  it('the way back gives the returning screen its own dwell, not a hold earned on the book', async () => {
    const { holdRotationFor } = await import('@/lib/interaction-hold');
    renderRotator(makeSettings());
    tick(0);
    show('recipes');
    settle();
    // A flick on the book's list earns a minute's browse hold.
    act(() => { holdRotationFor(60_000); });
    act(() => { fireEvent.click(dom.getByRole('button', { name: 'openedScreen.backTo:home name' })); });
    expect(shown()).toBe('home');
    tick(1_100);
    expect(shown()).toBe('weather');
  });

  it('swallows a second tap right after a screen change, then lets taps through', () => {
    renderRotator(makeSettings());
    tick(0);
    show('recipes');
    // A quick second tap on whatever is under the finger now does nothing.
    act(() => { fireEvent.click(dom.getByRole('button', { name: 'openedScreen.backTo:home name' })); });
    expect(shown()).toBe('recipes');
    settle();
    act(() => { fireEvent.click(dom.getByRole('button', { name: 'openedScreen.backTo:home name' })); });
    expect(shown()).toBe('home');
  });

  it('asked for again while it is up, it keeps its way back and starts its time again', () => {
    renderRotator(makeSettings());
    tick(0);
    show('recipes');
    tick(4_000);
    show('recipes');
    expect(dom.getByRole('button', { name: 'openedScreen.backTo:home name' })).toBeTruthy();
    tick(4_000);
    expect(shown()).toBe('recipes');
    tick(1_100);
    expect(shown()).toBe('home');
  });

  it('Escape on a keyboard goes back', () => {
    renderRotator(makeSettings());
    tick(0);
    show('recipes');
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(shown()).toBe('home');
  });
});
