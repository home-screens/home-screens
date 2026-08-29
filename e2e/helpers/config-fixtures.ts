import { getLatestSchemaVersion } from '@/lib/migrations';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import type { ModuleInstance, Screen, ScreenConfiguration } from '@/types/config';

/** A text module with distinctive content — the workhorse for display assertions. */
export function textModule(content: string, overrides: Partial<ModuleInstance> = {}): ModuleInstance {
  return {
    id: `text-${content.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    type: 'text',
    position: { x: 100, y: 100 },
    size: { w: 800, h: 200 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    // Mirrors the registry defaultConfig for 'text' (src/lib/module-registry.ts)
    config: {
      content,
      alignment: 'center',
      orientation: 'horizontal',
      verticalAlign: 'center',
      effect: 'none',
      textTransform: 'none',
      letterSpacing: 0,
      gradientFrom: '#a78bfa',
      gradientTo: '#22d3ee',
      gradientAngle: 90,
    },
    ...overrides,
  };
}

/** A chore-chart module (its presence gates the /chores page and the remote Chores tab). */
export function choreChartModule(): ModuleInstance {
  return {
    id: 'chore-chart-1',
    type: 'chore-chart',
    position: { x: 100, y: 400 },
    size: { w: 500, h: 650 },
    zIndex: 1,
    style: { ...DEFAULT_MODULE_STYLE },
    // Mirrors the registry defaultConfig for 'chore-chart'
    config: {
      view: 'board',
      weekStartDay: 'monday',
      showPoints: true,
      showStreaks: true,
      showTimeOfDay: true,
      allowDisplayComplete: true,
      accentColor: '#8b5cf6',
    },
  };
}

export function makeScreen(id: string, name: string, modules: ModuleInstance[], extra: Partial<Screen> = {}): Screen {
  return { id, name, backgroundImage: '', modules, ...extra };
}

interface BaseConfigOverrides {
  screens?: Screen[];
  settings?: Record<string, unknown>;
  displays?: unknown[];
}

/**
 * Minimal valid config, mirroring DEFAULT_CONFIG in src/lib/config.ts, with
 * telemetry off and rotation effectively frozen (1h) unless a test overrides.
 */
export function baseConfig(overrides: BaseConfigOverrides = {}): ScreenConfiguration {
  const config = {
    version: getLatestSchemaVersion(),
    settings: {
      rotationIntervalMs: 3_600_000,
      displayWidth: 1080,
      displayHeight: 1920,
      displayTransform: '90',
      latitude: 0,
      longitude: 0,
      telemetryEnabled: false,
      weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
      ...(overrides.settings ?? {}),
    },
    screens: overrides.screens ?? [makeScreen('screen-1', 'Screen 1', [textModule('E2E HOME SCREEN')])],
  } as unknown as ScreenConfiguration;
  if (overrides.displays) {
    (config as unknown as Record<string, unknown>).displays = overrides.displays;
  }
  return config;
}
