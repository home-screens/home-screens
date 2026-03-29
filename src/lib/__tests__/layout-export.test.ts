import { describe, it, expect } from 'vitest';
import {
  createLayoutExport,
  importLayout,
  validateLayoutExport,
} from '../layout-export';
import type { ScreenConfiguration, Screen, Profile } from '@/types/config';
import type { LayoutExport } from '@/types/layout-export';

// ── Helpers ─────────────────────────────────────────────────────────

function makeScreen(id: string, name: string, moduleCount = 1): Screen {
  return {
    id,
    name,
    backgroundImage: '/bg.jpg',
    modules: Array.from({ length: moduleCount }, (_, i) => ({
      id: `${id}-mod-${i}`,
      type: 'clock' as const,
      position: { x: 0, y: 0 },
      size: { w: 200, h: 100 },
      zIndex: 1,
      config: {},
      style: {
        opacity: 1,
        borderRadius: 12,
        padding: 16,
        backgroundColor: 'rgba(0,0,0,0.4)',
        textColor: '#ffffff',
        fontFamily: 'Inter',
        fontSize: 16,
        backdropBlur: 12,
        borderWidth: 0,
        borderColor: '',
        shadowSize: 0,
      },
    })),
  };
}

function makeConfig(
  screens: Screen[],
  profiles?: Profile[],
): ScreenConfiguration {
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 44.7,
      longitude: -93.4,
      locationName: 'Prior Lake, MN',
      timezone: 'America/Chicago',
      weather: {
        provider: 'weatherapi',
        latitude: 44.7,
        longitude: -93.4,
        units: 'imperial',
      },
      calendar: {
        googleCalendarId: 'cal-id-1',
        googleCalendarIds: ['cal-id-1'],
        icalSources: [],
        maxEvents: 10,
        daysAhead: 7,
      },
      sleep: {
        enabled: false,
        dimAfterMinutes: 10,
        sleepAfterMinutes: 0,
        dimBrightness: 20,
      },
      screensaver: { mode: 'clock' },
      cursorHideSeconds: 3,
      transitionEffect: 'fade',
      transitionDuration: 0.6,
    },
    screens,
    profiles,
  };
}

// ── createLayoutExport ──────────────────────────────────────────────

describe('createLayoutExport', () => {
  it('strips personal settings and keeps visual settings + screens', () => {
    const config = makeConfig([makeScreen('s1', 'Home', 2)]);
    const layout = createLayoutExport(config, { name: 'Test' });

    expect(layout._type).toBe('home-screens-layout');
    expect(layout._version).toBe(1);
    expect(layout.metadata.name).toBe('Test');
    expect(layout.metadata.screenCount).toBe(1);
    expect(layout.metadata.moduleCount).toBe(2);
    expect(layout.metadata.sourceDisplay).toEqual({ width: 1080, height: 1920 });
    expect(layout.visual.rotationIntervalMs).toBe(30000);
    expect(layout.visual.transitionEffect).toBe('fade');
    expect(layout.screens).toHaveLength(1);

    // Personal settings must NOT appear anywhere in the layout
    const json = JSON.stringify(layout);
    expect(json).not.toContain('"latitude"');
    expect(json).not.toContain('"longitude"');
    expect(json).not.toContain('"locationName"');
    expect(json).not.toContain('"googleCalendarId"');
    expect(json).not.toContain('"sleep"');
    expect(json).not.toContain('"screensaver"');
  });

  it('exports only selected screens when screenIds provided', () => {
    const config = makeConfig([
      makeScreen('s1', 'Home'),
      makeScreen('s2', 'Weather'),
      makeScreen('s3', 'News'),
    ]);
    const layout = createLayoutExport(config, { screenIds: ['s1', 's3'] });

    expect(layout.screens).toHaveLength(2);
    expect(layout.screens.map((s) => s.name)).toEqual(['Home', 'News']);
    expect(layout.metadata.screenCount).toBe(2);
  });

  it('filters profiles to only reference selected screens', () => {
    const config = makeConfig(
      [makeScreen('s1', 'Home'), makeScreen('s2', 'Weather')],
      [
        { id: 'p1', name: 'All', screenIds: ['s1', 's2'] },
        { id: 'p2', name: 'Home Only', screenIds: ['s1'] },
      ],
    );
    const layout = createLayoutExport(config, { screenIds: ['s1'] });

    // Both profiles reference s1, so both should be included (with s2 filtered out of p1)
    expect(layout.profiles).toHaveLength(2);
    expect(layout.profiles![0].screenIds).toEqual(['s1']);
    expect(layout.profiles![1].screenIds).toEqual(['s1']);
  });

  it('omits profiles when no profiles exist', () => {
    const config = makeConfig([makeScreen('s1', 'Home')]);
    const layout = createLayoutExport(config);
    expect(layout.profiles).toBeUndefined();
  });

  it('uses default name when none provided', () => {
    const config = makeConfig([makeScreen('s1', 'Home')]);
    const layout = createLayoutExport(config);
    expect(layout.metadata.name).toBe('My Layout');
  });
});

// ── importLayout ────────────────────────────────────────────────────

describe('importLayout', () => {
  function makeLayout(screens: Screen[], profiles?: Profile[]): LayoutExport {
    return {
      _type: 'home-screens-layout',
      _version: 1,
      metadata: {
        name: 'Test',
        exportedAt: new Date().toISOString(),
        configVersion: 1,
        sourceDisplay: { width: 1080, height: 1920 },
        screenCount: screens.length,
        moduleCount: screens.reduce((s, sc) => s + sc.modules.length, 0),
      },
      visual: {
        rotationIntervalMs: 15000,
        transitionEffect: 'slide',
        transitionDuration: 0.8,
      },
      screens,
      profiles,
    };
  }

  it('regenerates all IDs on import', () => {
    const layout = makeLayout([makeScreen('s1', 'Home', 2)]);
    const existing = makeConfig([makeScreen('existing', 'Existing')]);
    const result = importLayout(layout, existing, { mode: 'add' });

    // New screen should have a different ID than the original
    const importedScreen = result.screens.find((s) => s.name === 'Home');
    expect(importedScreen).toBeDefined();
    expect(importedScreen!.id).not.toBe('s1');
    // Module IDs should also be regenerated
    expect(importedScreen!.modules[0].id).not.toBe('s1-mod-0');
    expect(importedScreen!.modules[1].id).not.toBe('s1-mod-1');
  });

  it('resolves name conflicts with " (imported)" suffix', () => {
    const layout = makeLayout([makeScreen('s1', 'Home')]);
    const existing = makeConfig([makeScreen('existing', 'Home')]);
    const result = importLayout(layout, existing, { mode: 'add' });

    const names = result.screens.map((s) => s.name);
    expect(names).toContain('Home');
    expect(names).toContain('Home (imported)');
  });

  it('resolves double name conflicts with incrementing suffix', () => {
    const layout = makeLayout([makeScreen('s1', 'Home')]);
    const existing = makeConfig([
      makeScreen('e1', 'Home'),
      makeScreen('e2', 'Home (imported)'),
    ]);
    const result = importLayout(layout, existing, { mode: 'add' });

    const names = result.screens.map((s) => s.name);
    expect(names).toContain('Home');
    expect(names).toContain('Home (imported)');
    expect(names).toContain('Home (imported 2)');
  });

  it('add mode appends screens', () => {
    const layout = makeLayout([makeScreen('s1', 'Imported')]);
    const existing = makeConfig([makeScreen('e1', 'Existing')]);
    const result = importLayout(layout, existing, { mode: 'add' });

    expect(result.screens).toHaveLength(2);
    expect(result.screens[0].name).toBe('Existing');
    expect(result.screens[1].name).toBe('Imported');
  });

  it('replace mode replaces all screens', () => {
    const layout = makeLayout([makeScreen('s1', 'New')]);
    const existing = makeConfig([
      makeScreen('e1', 'Old1'),
      makeScreen('e2', 'Old2'),
    ]);
    const result = importLayout(layout, existing, { mode: 'replace' });

    expect(result.screens).toHaveLength(1);
    expect(result.screens[0].name).toBe('New');
  });

  it('preserves existing settings when applyVisual is false', () => {
    const layout = makeLayout([makeScreen('s1', 'Home')]);
    const existing = makeConfig([makeScreen('e1', 'Existing')]);
    const result = importLayout(layout, existing, { mode: 'add', applyVisual: false });

    expect(result.settings.rotationIntervalMs).toBe(30000);
    expect(result.settings.transitionEffect).toBe('fade');
  });

  it('applies visual settings when applyVisual is true', () => {
    const layout = makeLayout([makeScreen('s1', 'Home')]);
    const existing = makeConfig([makeScreen('e1', 'Existing')]);
    const result = importLayout(layout, existing, { mode: 'add', applyVisual: true });

    expect(result.settings.rotationIntervalMs).toBe(15000);
    expect(result.settings.transitionEffect).toBe('slide');
    expect(result.settings.transitionDuration).toBe(0.8);
    // Personal settings should be untouched
    expect(result.settings.latitude).toBe(44.7);
    expect(result.settings.locationName).toBe('Prior Lake, MN');
  });

  it('remaps profile screenIds correctly', () => {
    const layout = makeLayout(
      [makeScreen('s1', 'A'), makeScreen('s2', 'B')],
      [{ id: 'p1', name: 'Both', screenIds: ['s1', 's2'] }],
    );
    const existing = makeConfig([makeScreen('e1', 'Existing')]);
    const result = importLayout(layout, existing, { mode: 'add' });

    const importedProfile = result.profiles!.find((p) => p.name === 'Both');
    expect(importedProfile).toBeDefined();
    expect(importedProfile!.screenIds).toHaveLength(2);
    // Profile screenIds should map to the new screen IDs, not the originals
    expect(importedProfile!.screenIds).not.toContain('s1');
    expect(importedProfile!.screenIds).not.toContain('s2');
    // They should match the imported screens' new IDs
    const importedScreenIds = result.screens
      .filter((s) => s.name === 'A' || s.name === 'B')
      .map((s) => s.id);
    expect(importedProfile!.screenIds.sort()).toEqual(importedScreenIds.sort());
  });

  it('preserves personal settings on replace', () => {
    const layout = makeLayout([makeScreen('s1', 'New')]);
    const existing = makeConfig([makeScreen('e1', 'Old')]);
    const result = importLayout(layout, existing, { mode: 'replace' });

    // All personal settings must survive a replace
    expect(result.settings.latitude).toBe(44.7);
    expect(result.settings.longitude).toBe(-93.4);
    expect(result.settings.locationName).toBe('Prior Lake, MN');
    expect(result.settings.calendar.googleCalendarId).toBe('cal-id-1');
    expect(result.settings.sleep?.enabled).toBe(false);
  });

  it('scales module positions and sizes to target display dimensions', () => {
    // Layout designed for 1080x1920
    const layout = makeLayout([makeScreen('s1', 'Home', 1)]);
    // Module at position (100, 200), size (400, 300)
    layout.screens[0].modules[0].position = { x: 100, y: 200 };
    layout.screens[0].modules[0].size = { w: 400, h: 300 };

    // Target display is 1920x1080 (landscape) — 2x wider, ~0.56x shorter
    const existing = makeConfig([makeScreen('e1', 'Existing')]);
    existing.settings.displayWidth = 1920;
    existing.settings.displayHeight = 1080;

    const result = importLayout(layout, existing, { mode: 'add' });
    const imported = result.screens.find((s) => s.name === 'Home')!;
    const mod = imported.modules[0];

    // scaleX = 1920/1080 ≈ 1.778, scaleY = 1080/1920 ≈ 0.5625
    expect(mod.position.x).toBe(Math.round(100 * (1920 / 1080)));
    expect(mod.position.y).toBe(Math.round(200 * (1080 / 1920)));
    expect(mod.size.w).toBe(Math.round(400 * (1920 / 1080)));
    expect(mod.size.h).toBe(Math.round(300 * (1080 / 1920)));
  });

  it('does not scale when source and target dimensions match', () => {
    const layout = makeLayout([makeScreen('s1', 'Home', 1)]);
    layout.screens[0].modules[0].position = { x: 100, y: 200 };
    layout.screens[0].modules[0].size = { w: 400, h: 300 };

    const existing = makeConfig([makeScreen('e1', 'Existing')]);
    // Same dimensions as layout source (1080x1920)
    const result = importLayout(layout, existing, { mode: 'add' });
    const imported = result.screens.find((s) => s.name === 'Home')!;
    const mod = imported.modules[0];

    expect(mod.position).toEqual({ x: 100, y: 200 });
    expect(mod.size).toEqual({ w: 400, h: 300 });
  });

  it('clears activeProfile on replace mode', () => {
    const existing = makeConfig([makeScreen('e1', 'Old')]);
    existing.settings.activeProfile = 'old-profile-id';
    const layout = makeLayout(
      [makeScreen('s1', 'New')],
      [{ id: 'p1', name: 'Profile', screenIds: ['s1'] }],
    );
    const result = importLayout(layout, existing, { mode: 'replace' });

    // activeProfile must be cleared since old profiles are gone
    expect(result.settings.activeProfile).toBeUndefined();
  });
});

// ── validateLayoutExport ────────────────────────────────────────────

describe('validateLayoutExport', () => {
  it('validates a correct layout export', () => {
    const layout: LayoutExport = {
      _type: 'home-screens-layout',
      _version: 1,
      metadata: {
        name: 'Test',
        exportedAt: new Date().toISOString(),
        configVersion: 1,
        sourceDisplay: { width: 1080, height: 1920 },
        screenCount: 1,
        moduleCount: 0,
      },
      visual: { rotationIntervalMs: 30000 },
      screens: [{ id: 's1', name: 'Home', backgroundImage: '', modules: [] }],
    };
    const result = validateLayoutExport(layout);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('catches missing _type', () => {
    const result = validateLayoutExport({ screens: [], metadata: { name: 'x' }, visual: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('_type'))).toBe(true);
  });

  it('catches missing metadata', () => {
    const result = validateLayoutExport({ _type: 'home-screens-layout', screens: [], visual: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('metadata'))).toBe(true);
  });

  it('catches missing screens', () => {
    const result = validateLayoutExport({
      _type: 'home-screens-layout',
      metadata: { name: 'x' },
      visual: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('screens'))).toBe(true);
  });

  it('catches invalid screen structure', () => {
    const result = validateLayoutExport({
      _type: 'home-screens-layout',
      metadata: { name: 'x' },
      visual: {},
      screens: [{ name: 'no id' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Screen 0'))).toBe(true);
  });

  it('catches metadata present but name missing', () => {
    const result = validateLayoutExport({
      _type: 'home-screens-layout',
      metadata: { exportedAt: '2026-01-01' },
      visual: {},
      screens: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('metadata.name'))).toBe(true);
  });

  it('catches missing visual settings', () => {
    const result = validateLayoutExport({
      _type: 'home-screens-layout',
      metadata: { name: 'x' },
      screens: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('visual'))).toBe(true);
  });

  it('catches non-object input', () => {
    expect(validateLayoutExport(null).valid).toBe(false);
    expect(validateLayoutExport('string').valid).toBe(false);
    expect(validateLayoutExport(42).valid).toBe(false);
  });
});

