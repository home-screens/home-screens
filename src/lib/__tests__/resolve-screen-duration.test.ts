import { describe, it, expect } from 'vitest';
import { resolveScreenDuration } from '@/lib/resolve-screen-duration';
import type { Screen, GlobalSettings } from '@/types/config';

function makeScreen(overrides: Partial<Screen> = {}): Screen {
  return {
    id: 'a',
    name: 'A',
    backgroundImage: '',
    modules: [],
    ...overrides,
  };
}

function makeSettings(rotationIntervalMs: number): GlobalSettings {
  return {
    rotationIntervalMs,
    displayWidth: 1080,
    displayHeight: 1920,
    latitude: 0,
    longitude: 0,
    weather: { provider: 'open-meteo', latitude: 0, longitude: 0, units: 'imperial' },
    calendar: {
      googleCalendarId: '',
      googleCalendarIds: [],
      icalSources: [],
      daysAhead: 0,
    },
  };
}

describe('resolveScreenDuration', () => {
  it('falls back to settings.rotationIntervalMs when screen has no override', () => {
    const screen = makeScreen();
    const settings = makeSettings(30_000);
    expect(resolveScreenDuration(screen, settings)).toBe(30_000);
  });

  it('returns the screen value when positive', () => {
    const screen = makeScreen({ rotationDurationMs: 15_000 });
    const settings = makeSettings(30_000);
    expect(resolveScreenDuration(screen, settings)).toBe(15_000);
  });

  it('keeps a short override as typed (the editor only warns)', () => {
    const screen = makeScreen({ rotationDurationMs: 5_000 });
    const settings = makeSettings(30_000);
    expect(resolveScreenDuration(screen, settings)).toBe(5_000);
  });

  it('does not touch the global default', () => {
    const screen = makeScreen();
    const settings = makeSettings(5_000);
    expect(resolveScreenDuration(screen, settings)).toBe(5_000);
  });

  it('returns 0 (sticky) when the screen sets 0, regardless of global', () => {
    const screen = makeScreen({ rotationDurationMs: 0 });
    const settings = makeSettings(30_000);
    expect(resolveScreenDuration(screen, settings)).toBe(0);
  });
});
