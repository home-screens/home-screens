import { describe, it, expect } from 'vitest';
import { validateConfig, type ConfigDiagnostic } from '../validate-config';
import type { ScreenConfiguration } from '@/types/config';

/** Minimal valid config for testing. */
function validConfig(overrides?: Partial<ScreenConfiguration>): ScreenConfiguration {
  return {
    version: 3,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 40.7,
      longitude: -74.0,
      weather: {
        provider: 'open-meteo',
        latitude: 40.7,
        longitude: -74.0,
        units: 'imperial',
      },
      calendar: {
        googleCalendarId: '',
        googleCalendarIds: [],
        icalSources: [],
        maxEvents: 20,
        daysAhead: 14,
      },
    },
    screens: [
      {
        id: 'screen-1',
        name: 'Main Screen',
        backgroundImage: '',
        modules: [
          {
            id: 'mod-1',
            type: 'clock',
            position: { x: 0, y: 0 },
            size: { w: 400, h: 200 },
            zIndex: 1,
            config: { view: 'classic' },
            style: {
              opacity: 1, borderRadius: 12, padding: 16,
              backgroundColor: 'rgba(0,0,0,0.4)', textColor: '#ffffff',
              fontFamily: 'Inter', fontSize: 16, backdropBlur: 12,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', shadowSize: 8,
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function findByCode(diagnostics: ConfigDiagnostic[], code: string): ConfigDiagnostic | undefined {
  return diagnostics.find((d) => d.code === code);
}

describe('validateConfig', () => {
  it('returns no diagnostics for a valid config', () => {
    const result = validateConfig(validConfig());
    expect(result).toEqual([]);
  });

  // ── Top-level structure ──────────────────────────────────────────────

  describe('top-level structure', () => {
    it('errors when version is missing', () => {
      const config = validConfig();
      delete (config as unknown as Record<string, unknown>).version;
      const result = validateConfig(config);
      expect(findByCode(result, 'MISSING_VERSION')).toBeDefined();
      expect(findByCode(result, 'MISSING_VERSION')!.severity).toBe('error');
    });

    it('errors when settings is missing', () => {
      const config = validConfig();
      delete (config as unknown as Record<string, unknown>).settings;
      const result = validateConfig(config);
      expect(findByCode(result, 'MISSING_SETTINGS')).toBeDefined();
    });

    it('errors when screens is missing', () => {
      const config = validConfig();
      delete (config as unknown as Record<string, unknown>).screens;
      const result = validateConfig(config);
      expect(findByCode(result, 'MISSING_SCREENS')).toBeDefined();
    });

    it('errors when screens is not an array', () => {
      const config = validConfig();
      (config as unknown as Record<string, unknown>).screens = 'not-an-array';
      const result = validateConfig(config);
      expect(findByCode(result, 'MISSING_SCREENS')).toBeDefined();
    });
  });

  // ── Schema version ───────────────────────────────────────────────────

  describe('schema version', () => {
    it('warns when version is outdated', () => {
      const config = validConfig({ version: 1 });
      const result = validateConfig(config);
      const diag = findByCode(result, 'OUTDATED_VERSION');
      expect(diag).toBeDefined();
      expect(diag!.severity).toBe('warning');
      expect(diag!.message).toContain('1');
    });

    it('does not warn when version is current', () => {
      const result = validateConfig(validConfig());
      expect(findByCode(result, 'OUTDATED_VERSION')).toBeUndefined();
    });
  });

  // ── Module types ─────────────────────────────────────────────────────

  describe('module types', () => {
    it('errors on unknown module type', () => {
      const config = validConfig();
      config.screens[0].modules[0].type = 'nonexistent-module' as never;
      const result = validateConfig(config);
      const diag = findByCode(result, 'UNKNOWN_MODULE_TYPE');
      expect(diag).toBeDefined();
      expect(diag!.severity).toBe('error');
      expect(diag!.message).toContain('nonexistent-module');
      expect(diag!.path).toContain('screen-1');
    });

    it('accepts all known builtin module types', () => {
      const builtinTypes = [
        'clock', 'calendar', 'weather', 'countdown', 'dad-joke', 'text',
        'image', 'quote', 'todo', 'sticky-note', 'greeting', 'news',
        'stock-ticker', 'crypto', 'word-of-day', 'history', 'moon-phase',
        'sunrise-sunset', 'photo-slideshow', 'qr-code', 'year-progress',
        'traffic', 'sports', 'air-quality', 'todoist', 'rain-map',
        'multi-month', 'garbage-day', 'standings', 'affirmations', 'date',
        'meal-planner', 'iframe', 'chore-chart', 'fullscreen-calendar',
        'fullscreen-chore-chart', 'fullscreen-meal-planner', 'fullscreen-photo',
      ] as const;

      for (const type of builtinTypes) {
        const config = validConfig();
        config.screens[0].modules[0].type = type;
        const result = validateConfig(config);
        expect(findByCode(result, 'UNKNOWN_MODULE_TYPE')).toBeUndefined();
      }
    });

    it('accepts plugin module types (plugin:* namespace)', () => {
      const config = validConfig();
      config.screens[0].modules[0].type = 'plugin:my-custom-widget' as never;
      const result = validateConfig(config);
      expect(findByCode(result, 'UNKNOWN_MODULE_TYPE')).toBeUndefined();
    });
  });

  // ── Screen structure ─────────────────────────────────────────────────

  describe('screen structure', () => {
    it('errors when a screen has no id', () => {
      const config = validConfig();
      delete (config.screens[0] as unknown as Record<string, unknown>).id;
      const result = validateConfig(config);
      expect(findByCode(result, 'SCREEN_MISSING_ID')).toBeDefined();
    });

    it('errors on duplicate screen ids', () => {
      const config = validConfig();
      config.screens.push({ ...config.screens[0] }); // same id
      const result = validateConfig(config);
      expect(findByCode(result, 'DUPLICATE_SCREEN_ID')).toBeDefined();
    });

    it('errors when a screen has no name', () => {
      const config = validConfig();
      delete (config.screens[0] as unknown as Record<string, unknown>).name;
      const result = validateConfig(config);
      expect(findByCode(result, 'SCREEN_MISSING_NAME')).toBeDefined();
    });
  });

  // ── Module structure ─────────────────────────────────────────────────

  describe('module structure', () => {
    it('errors when a module has no id', () => {
      const config = validConfig();
      delete (config.screens[0].modules[0] as unknown as Record<string, unknown>).id;
      const result = validateConfig(config);
      expect(findByCode(result, 'MODULE_MISSING_ID')).toBeDefined();
    });

    it('errors when a module has no type', () => {
      const config = validConfig();
      delete (config.screens[0].modules[0] as unknown as Record<string, unknown>).type;
      const result = validateConfig(config);
      expect(findByCode(result, 'MODULE_MISSING_TYPE')).toBeDefined();
    });

    it('errors on duplicate module ids within a screen', () => {
      const config = validConfig();
      const mod = config.screens[0].modules[0];
      config.screens[0].modules.push({ ...mod }); // same id
      const result = validateConfig(config);
      expect(findByCode(result, 'DUPLICATE_MODULE_ID')).toBeDefined();
    });

    it('errors when module position has negative coordinates', () => {
      const config = validConfig();
      config.screens[0].modules[0].position = { x: -10, y: 0 };
      const result = validateConfig(config);
      expect(findByCode(result, 'INVALID_MODULE_POSITION')).toBeDefined();
    });

    it('errors when module size has zero or negative dimensions', () => {
      const config = validConfig();
      config.screens[0].modules[0].size = { w: 0, h: 200 };
      const result = validateConfig(config);
      expect(findByCode(result, 'INVALID_MODULE_SIZE')).toBeDefined();
    });
  });

  // ── Profile references ───────────────────────────────────────────────

  describe('profile references', () => {
    it('errors when a profile references a nonexistent screen', () => {
      const config = validConfig({
        profiles: [
          { id: 'p1', name: 'Day', screenIds: ['screen-1', 'nonexistent'] },
        ],
      });
      const result = validateConfig(config);
      const diag = findByCode(result, 'PROFILE_DANGLING_SCREEN');
      expect(diag).toBeDefined();
      expect(diag!.message).toContain('nonexistent');
    });

    it('does not error when profile references are valid', () => {
      const config = validConfig({
        profiles: [
          { id: 'p1', name: 'Day', screenIds: ['screen-1'] },
        ],
      });
      const result = validateConfig(config);
      expect(findByCode(result, 'PROFILE_DANGLING_SCREEN')).toBeUndefined();
    });

    it('errors on duplicate profile ids', () => {
      const config = validConfig({
        profiles: [
          { id: 'p1', name: 'Day', screenIds: ['screen-1'] },
          { id: 'p1', name: 'Night', screenIds: ['screen-1'] },
        ],
      });
      const result = validateConfig(config);
      expect(findByCode(result, 'DUPLICATE_PROFILE_ID')).toBeDefined();
    });
  });

  // ── Settings ─────────────────────────────────────────────────────────

  describe('settings', () => {
    it('warns when latitude/longitude are both zero (unconfigured)', () => {
      const config = validConfig();
      config.settings.latitude = 0;
      config.settings.longitude = 0;
      const result = validateConfig(config);
      expect(findByCode(result, 'LOCATION_NOT_SET')).toBeDefined();
    });

    it('errors when displayWidth or displayHeight is zero or negative', () => {
      const config = validConfig();
      config.settings.displayWidth = 0;
      const result = validateConfig(config);
      expect(findByCode(result, 'INVALID_DIMENSIONS')).toBeDefined();
    });

    it('errors when rotationIntervalMs is negative', () => {
      const config = validConfig();
      config.settings.rotationIntervalMs = -1;
      const result = validateConfig(config);
      expect(findByCode(result, 'INVALID_ROTATION_INTERVAL')).toBeDefined();
    });
  });

  // ── Display validation (delegates to validateDisplays) ───────────────

  describe('displays', () => {
    it('passes display validation errors through', () => {
      const config = validConfig({
        displays: [
          { id: 'INVALID ID', name: 'Bad', screens: [] },
        ],
      });
      const result = validateConfig(config);
      expect(findByCode(result, 'DISPLAY_INVALID')).toBeDefined();
    });

    it('validates modules inside display-owned screens', () => {
      const config = validConfig({
        displays: [
          {
            id: 'kitchen',
            name: 'Kitchen',
            screens: [
              {
                id: 's1',
                name: 'Screen 1',
                backgroundImage: '',
                modules: [
                  {
                    id: 'm1',
                    type: 'bogus-type' as never,
                    position: { x: 0, y: 0 },
                    size: { w: 100, h: 100 },
                    zIndex: 1,
                    config: {},
                    style: {
                      opacity: 1, borderRadius: 0, padding: 0,
                      backgroundColor: '', textColor: '', fontFamily: '',
                      fontSize: 16, backdropBlur: 0, borderWidth: 0,
                      borderColor: '', shadowSize: 0,
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
      const result = validateConfig(config);
      expect(findByCode(result, 'UNKNOWN_MODULE_TYPE')).toBeDefined();
    });
  });

  // ── activeProfile reference ──────────────────────────────────────────

  describe('activeProfile', () => {
    it('warns when activeProfile references a nonexistent profile', () => {
      const config = validConfig({
        profiles: [
          { id: 'p1', name: 'Day', screenIds: ['screen-1'] },
        ],
      });
      config.settings.activeProfile = 'nonexistent';
      const result = validateConfig(config);
      expect(findByCode(result, 'ACTIVE_PROFILE_DANGLING')).toBeDefined();
    });
  });

  // ── Summary helpers ──────────────────────────────────────────────────

  describe('diagnostic metadata', () => {
    it('includes path information in diagnostics', () => {
      const config = validConfig();
      config.screens[0].modules[0].type = 'bogus' as never;
      const result = validateConfig(config);
      const diag = findByCode(result, 'UNKNOWN_MODULE_TYPE');
      expect(diag!.path).toBeDefined();
    });

    it('returns multiple diagnostics for multiple problems', () => {
      const config = validConfig();
      config.settings.displayWidth = -1;
      config.settings.rotationIntervalMs = -1;
      config.screens[0].modules[0].type = 'bogus' as never;
      const result = validateConfig(config);
      expect(result.length).toBeGreaterThanOrEqual(3);
    });
  });
});
