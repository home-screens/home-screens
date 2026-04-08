import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ScreenConfiguration } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';

// Must import the module registry so modules are registered before store operations
import '@/lib/module-registry';

// Mock browser APIs not available in node test environment
const mockReplaceState = vi.fn();
vi.stubGlobal('window', {
  location: { href: 'http://localhost/editor', search: '' },
  history: { replaceState: mockReplaceState },
});

// Dynamic import to reset store state between tests
let useEditorStore: typeof import('@/stores/editor-store').useEditorStore;

function makeConfig(overrides?: Partial<ScreenConfiguration>): ScreenConfiguration {
  return {
    version: 1,
    settings: {
      rotationIntervalMs: 30000,
      displayWidth: 1080,
      displayHeight: 1920,
      latitude: 0,
      longitude: 0,
      weather: { provider: 'weatherapi', latitude: 0, longitude: 0, units: 'imperial' },
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], maxEvents: 10, daysAhead: 7 },
    },
    screens: [
      {
        id: 'screen-1',
        name: 'Screen 1',
        backgroundImage: '',
        modules: [],
      },
    ],
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  // Re-import to get fresh store
  await import('@/lib/module-registry');
  const mod = await import('@/stores/editor-store');
  useEditorStore = mod.useEditorStore;
});

describe('editor store', () => {
  describe('addModule', () => {
    it('adds a module to the correct screen', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().addModule('screen-1', 'clock');

      const state = store.getState();
      const screen = state.config!.screens[0];
      expect(screen.modules).toHaveLength(1);
      expect(screen.modules[0].type).toBe('clock');
      expect(screen.modules[0].position).toEqual({ x: 100, y: 100 });
      expect(screen.modules[0].style).toEqual(DEFAULT_MODULE_STYLE);
      expect(state.isDirty).toBe(true);
      expect(state.selectedModuleId).toBe(screen.modules[0].id);
    });

    it('does nothing when config is null', () => {
      const store = useEditorStore;
      store.setState({ config: null });
      store.getState().addModule('screen-1', 'clock');
      expect(store.getState().config).toBeNull();
    });

    it('does nothing for unknown module type', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });
      store.getState().addModule('screen-1', 'nonexistent' as never);
      expect(store.getState().config!.screens[0].modules).toHaveLength(0);
      expect(store.getState().isDirty).toBe(false);
    });
  });

  describe('removeModule', () => {
    it('removes a module and clears selection if it was selected', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [{
        id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 },
        zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
      }];
      store.setState({ config, selectedModuleId: 'mod-1' });

      store.getState().removeModule('screen-1', 'mod-1');

      expect(store.getState().config!.screens[0].modules).toHaveLength(0);
      expect(store.getState().selectedModuleId).toBeNull();
      expect(store.getState().isDirty).toBe(true);
    });

    it('keeps selection if a different module was removed', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [
        { id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
        { id: 'mod-2', type: 'text', position: { x: 100, y: 100 }, size: { w: 400, h: 150 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
      ];
      store.setState({ config, selectedModuleId: 'mod-1' });

      store.getState().removeModule('screen-1', 'mod-2');

      expect(store.getState().selectedModuleId).toBe('mod-1');
      expect(store.getState().config!.screens[0].modules).toHaveLength(1);
    });
  });

  describe('moveModule', () => {
    it('updates module position', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [{
        id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 },
        zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
      }];
      store.setState({ config });

      store.getState().moveModule('screen-1', 'mod-1', { x: 200, y: 300 });

      const mod = store.getState().config!.screens[0].modules[0];
      expect(mod.position).toEqual({ x: 200, y: 300 });
    });
  });

  describe('resizeModule', () => {
    it('updates module size', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [{
        id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 },
        zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
      }];
      store.setState({ config });

      store.getState().resizeModule('screen-1', 'mod-1', { w: 600, h: 400 });

      const mod = store.getState().config!.screens[0].modules[0];
      expect(mod.size).toEqual({ w: 600, h: 400 });
    });
  });

  describe('updateModuleStyle', () => {
    it('merges partial style updates', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [{
        id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 },
        zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
      }];
      store.setState({ config });

      store.getState().updateModuleStyle('screen-1', 'mod-1', { opacity: 0.5, fontSize: 24 });

      const style = store.getState().config!.screens[0].modules[0].style;
      expect(style.opacity).toBe(0.5);
      expect(style.fontSize).toBe(24);
      // Other properties unchanged
      expect(style.borderRadius).toBe(DEFAULT_MODULE_STYLE.borderRadius);
    });
  });

  describe('addScreen', () => {
    it('adds a new screen and selects it', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), selectedScreenId: 'screen-1' });

      store.getState().addScreen();

      const state = store.getState();
      expect(state.config!.screens).toHaveLength(2);
      expect(state.config!.screens[1].name).toBe('Screen 2');
      expect(state.config!.screens[1].modules).toEqual([]);
      expect(state.selectedScreenId).toBe(state.config!.screens[1].id);
      expect(state.selectedModuleId).toBeNull();
      expect(state.isDirty).toBe(true);
    });
  });

  describe('removeScreen', () => {
    it('removes a screen and reselects if it was selected', () => {
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'Screen 1', backgroundImage: '', modules: [] },
          { id: 's2', name: 'Screen 2', backgroundImage: '', modules: [] },
        ],
      });
      store.setState({ config, selectedScreenId: 's2' });

      store.getState().removeScreen('s2');

      expect(store.getState().config!.screens).toHaveLength(1);
      expect(store.getState().selectedScreenId).toBe('s1');
    });

    it('prevents removing the last screen', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), selectedScreenId: 'screen-1', isDirty: false });

      store.getState().removeScreen('screen-1');

      expect(store.getState().config!.screens).toHaveLength(1);
      expect(store.getState().isDirty).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('merges partial settings', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig() });

      store.getState().updateSettings({ rotationIntervalMs: 60000 });

      const settings = store.getState().config!.settings;
      expect(settings.rotationIntervalMs).toBe(60000);
      // Other settings unchanged
      expect(settings.weather.provider).toBe('weatherapi');
    });
  });

  describe('importConfig', () => {
    it('imports valid config JSON', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig() });

      const imported = makeConfig({
        screens: [
          { id: 'imported', name: 'Imported', backgroundImage: '/bg.png', modules: [] },
        ],
      });
      store.getState().importConfig(JSON.stringify(imported));

      expect(store.getState().config!.screens[0].id).toBe('imported');
      expect(store.getState().selectedScreenId).toBe('imported');
      expect(store.getState().isDirty).toBe(true);
    });

    it('rejects config missing screens', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig() });

      expect(() => {
        store.getState().importConfig(JSON.stringify({ settings: {} }));
      }).toThrow('Invalid config file');
    });

    it('rejects config missing settings', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig() });

      expect(() => {
        store.getState().importConfig(JSON.stringify({ screens: [] }));
      }).toThrow('Invalid config file');
    });

    it('rejects invalid JSON', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig() });

      expect(() => {
        store.getState().importConfig('not json');
      }).toThrow();
    });
  });

  describe('addProfile', () => {
    it('adds a profile with all current screen IDs', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().addProfile('Morning');

      const state = store.getState();
      expect(state.config!.profiles).toHaveLength(1);
      expect(state.config!.profiles![0].name).toBe('Morning');
      expect(state.config!.profiles![0].screenIds).toEqual(['screen-1']);
      expect(state.isDirty).toBe(true);
    });

    it('appends to existing profiles', () => {
      const store = useEditorStore;
      const config = makeConfig({ profiles: [{ id: 'p1', name: 'Existing', screenIds: ['screen-1'] }] });
      store.setState({ config });

      store.getState().addProfile('New Profile');

      expect(store.getState().config!.profiles).toHaveLength(2);
      expect(store.getState().config!.profiles![1].name).toBe('New Profile');
    });

    it('does nothing when config is null', () => {
      const store = useEditorStore;
      store.setState({ config: null });
      store.getState().addProfile('Test');
      expect(store.getState().config).toBeNull();
    });
  });

  describe('removeProfile', () => {
    it('removes a profile by ID', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [
          { id: 'p1', name: 'A', screenIds: ['screen-1'] },
          { id: 'p2', name: 'B', screenIds: ['screen-1'] },
        ],
      });
      store.setState({ config });

      store.getState().removeProfile('p1');

      expect(store.getState().config!.profiles).toHaveLength(1);
      expect(store.getState().config!.profiles![0].id).toBe('p2');
    });

    it('clears activeProfile when the active profile is removed', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [{ id: 'p1', name: 'A', screenIds: ['screen-1'] }],
      });
      config.settings.activeProfile = 'p1';
      store.setState({ config });

      store.getState().removeProfile('p1');

      expect(store.getState().config!.settings.activeProfile).toBeUndefined();
    });

    it('preserves activeProfile when a different profile is removed', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [
          { id: 'p1', name: 'A', screenIds: ['screen-1'] },
          { id: 'p2', name: 'B', screenIds: ['screen-1'] },
        ],
      });
      config.settings.activeProfile = 'p1';
      store.setState({ config });

      store.getState().removeProfile('p2');

      expect(store.getState().config!.settings.activeProfile).toBe('p1');
    });
  });

  describe('updateProfile', () => {
    it('merges partial updates into the correct profile', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [
          { id: 'p1', name: 'A', screenIds: ['screen-1'] },
          { id: 'p2', name: 'B', screenIds: ['screen-1'] },
        ],
      });
      store.setState({ config });

      store.getState().updateProfile('p1', { name: 'Updated', screenIds: [] });

      const profiles = store.getState().config!.profiles!;
      expect(profiles[0].name).toBe('Updated');
      expect(profiles[0].screenIds).toEqual([]);
      expect(profiles[1].name).toBe('B'); // untouched
    });
  });

  describe('reorderScreens', () => {
    it('moves a screen from one index to another', () => {
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'A', backgroundImage: '', modules: [] },
          { id: 's2', name: 'B', backgroundImage: '', modules: [] },
          { id: 's3', name: 'C', backgroundImage: '', modules: [] },
        ],
      });
      store.setState({ config, isDirty: false });

      store.getState().reorderScreens(0, 2);

      const ids = store.getState().config!.screens.map((s) => s.id);
      expect(ids).toEqual(['s2', 's3', 's1']);
      expect(store.getState().isDirty).toBe(true);
    });

    it('moves last screen to first position', () => {
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'A', backgroundImage: '', modules: [] },
          { id: 's2', name: 'B', backgroundImage: '', modules: [] },
          { id: 's3', name: 'C', backgroundImage: '', modules: [] },
        ],
      });
      store.setState({ config, isDirty: false });

      store.getState().reorderScreens(2, 0);

      const ids = store.getState().config!.screens.map((s) => s.id);
      expect(ids).toEqual(['s3', 's1', 's2']);
    });
  });

  describe('reorderProfiles', () => {
    it('moves a profile from one index to another', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [
          { id: 'p1', name: 'A', screenIds: [] },
          { id: 'p2', name: 'B', screenIds: [] },
          { id: 'p3', name: 'C', screenIds: [] },
        ],
      });
      store.setState({ config, isDirty: false });

      store.getState().reorderProfiles(0, 2);

      const ids = store.getState().config!.profiles!.map((p) => p.id);
      expect(ids).toEqual(['p2', 'p3', 'p1']);
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('setActiveProfile', () => {
    it('sets activeProfile on settings', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().setActiveProfile('p1');

      expect(store.getState().config!.settings.activeProfile).toBe('p1');
      expect(store.getState().isDirty).toBe(true);
    });

    it('clears activeProfile with undefined', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.settings.activeProfile = 'p1';
      store.setState({ config });

      store.getState().setActiveProfile(undefined);

      expect(store.getState().config!.settings.activeProfile).toBeUndefined();
    });
  });

  describe('scaleAllModules', () => {
    it('scales modules across all screens and marks dirty', () => {
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          {
            id: 's1', name: 'Screen 1', backgroundImage: '', modules: [
              { id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 1040, h: 1900 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
            ],
          },
          {
            id: 's2', name: 'Screen 2', backgroundImage: '', modules: [
              { id: 'mod-2', type: 'text', position: { x: 0, y: 1600 }, size: { w: 1040, h: 300 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
            ],
          },
        ],
      });
      store.setState({ config, isDirty: false });

      // Portrait 1080x1920 → Landscape 1920x1080
      store.getState().scaleAllModules(1080, 1920, 1920, 1080);

      const state = store.getState();
      expect(state.isDirty).toBe(true);
      // Both screens should have modules that fit within 1920x1080
      for (const screen of state.config!.screens) {
        for (const mod of screen.modules) {
          expect(mod.position.x + mod.size.w).toBeLessThanOrEqual(1920);
          expect(mod.position.y + mod.size.h).toBeLessThanOrEqual(1080);
        }
      }
    });

    it('does nothing when config is null', () => {
      const store = useEditorStore;
      store.setState({ config: null });
      store.getState().scaleAllModules(1080, 1920, 1920, 1080);
      expect(store.getState().config).toBeNull();
    });
  });

  describe('removeScreen prunes profiles', () => {
    it('removes deleted screen ID from all profile screenIds', () => {
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'Screen 1', backgroundImage: '', modules: [] },
          { id: 's2', name: 'Screen 2', backgroundImage: '', modules: [] },
        ],
        profiles: [
          { id: 'p1', name: 'A', screenIds: ['s1', 's2'] },
          { id: 'p2', name: 'B', screenIds: ['s2'] },
        ],
      });
      store.setState({ config, selectedScreenId: 's1' });

      store.getState().removeScreen('s2');

      const profiles = store.getState().config!.profiles!;
      expect(profiles[0].screenIds).toEqual(['s1']);
      expect(profiles[1].screenIds).toEqual([]);
    });
  });

  /* ─── Display CRUD ────────────────────────────── */

  describe('addDisplay', () => {
    it('auto-creates a Main display alongside the first added display', () => {
      // This is the "hub display fix": adding the first display also
      // registers a `main` entry so the hub Pi's kiosk (loading /display,
      // which redirects to /display/main) keeps showing its existing
      // screens instead of whatever new display was just added.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'A', backgroundImage: '', modules: [] },
          { id: 's2', name: 'B', backgroundImage: '', modules: [] },
        ],
      });
      store.setState({ config, isDirty: false });

      store.getState().addDisplay({ id: 'kitchen', name: 'Kitchen' });

      const displays = store.getState().config!.displays!;
      expect(displays).toHaveLength(2);
      expect(displays[0].id).toBe('main');
      expect(displays[0].name).toBe('Main Display');
      expect(displays[1].id).toBe('kitchen');
      expect(store.getState().isDirty).toBe(true);
    });

    it('main inherits the existing global screens and global dimensions', () => {
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'A', backgroundImage: '', modules: [] },
          { id: 's2', name: 'B', backgroundImage: '', modules: [] },
        ],
      });
      config.settings.displayWidth = 1920;
      config.settings.displayHeight = 1080;
      store.setState({ config });

      store.getState().addDisplay({ id: 'kitchen', name: 'Kitchen' });

      const main = store.getState().config!.displays!.find((d) => d.id === 'main')!;
      expect(main.screens?.map((s) => s.id)).toEqual(['s1', 's2']);
      expect(main.displayWidth).toBe(1920);
      expect(main.displayHeight).toBe(1080);
    });

    it('new non-main displays start with an empty screens list', () => {
      // Per the data model: a freshly-added display owns an empty list of
      // screens so the user designs fresh layouts at its own resolution
      // rather than inheriting the hub's layout which won't translate.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'A', backgroundImage: '', modules: [] },
        ],
      });
      store.setState({ config });

      store.getState().addDisplay({ id: 'kitchen', name: 'Kitchen' });

      const kitchen = store.getState().config!.displays!.find((d) => d.id === 'kitchen')!;
      expect(kitchen.screens).toEqual([]);
      expect(kitchen.screenIds).toBeUndefined();
    });

    it('auto-migrates the legacy profile pool onto Main on first addDisplay', () => {
      // Multi-display mode always has per-display owned profiles — there is
      // no runtime "switch to per-display profiles" choice. The bootstrap
      // path must deep-clone `config.profiles` onto Main's own list so the
      // hub's existing profile layout keeps working and isn't mirrored on
      // every subsequent display. `config.settings.activeProfile` is also
      // carried forward as `main.activeProfile`.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'A', backgroundImage: '', modules: [] },
          { id: 's2', name: 'B', backgroundImage: '', modules: [] },
        ],
        profiles: [
          { id: 'day', name: 'Day', screenIds: ['s1', 's2'] },
          { id: 'night', name: 'Night', screenIds: ['s1'] },
        ],
      });
      config.settings.activeProfile = 'day';
      store.setState({ config });

      store.getState().addDisplay({ id: 'kitchen', name: 'Kitchen' });

      const main = store.getState().config!.displays!.find((d) => d.id === 'main')!;
      expect(main.profiles?.map((p) => p.id)).toEqual(['day', 'night']);
      expect(main.profiles?.[0].screenIds).toEqual(['s1', 's2']);
      expect(main.activeProfile).toBe('day');
    });

    it('main profile migration is a deep clone (no back-leak from later edits)', () => {
      // Regression guard: later edits to main.profiles[0].screenIds must
      // NOT mutate the original config.profiles pool through a shared
      // reference. structuredClone protects against this at bootstrap.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [{ id: 's1', name: 'A', backgroundImage: '', modules: [] }],
        profiles: [{ id: 'day', name: 'Day', screenIds: ['s1'] }],
      });
      store.setState({ config });

      store.getState().addDisplay({ id: 'kitchen', name: 'Kitchen' });

      const mainBefore = store.getState().config!.displays!.find((d) => d.id === 'main')!;
      // Mutate main's profile through the store (not via raw state) so we
      // exercise the normal edit path.
      store.setState({ selectedDisplayId: 'main' });
      store.getState().updateProfile(mainBefore.profiles![0].id, { screenIds: [] });

      const after = store.getState().config!;
      // The ghost pool on config.profiles keeps its original screenIds
      // because main owns its own cloned list.
      expect(after.profiles?.[0].screenIds).toEqual(['s1']);
      const mainAfter = after.displays!.find((d) => d.id === 'main')!;
      expect(mainAfter.profiles?.[0].screenIds).toEqual([]);
    });

    it('new non-main displays start with an empty profile list, not the shared pool', () => {
      // A kitchen display designed for 1080×1920 shouldn't automatically
      // pick up the hub's profiles (which reference screens that don't
      // exist on kitchen). `profiles: []` is semantically "owned empty",
      // which is distinct from "no profiles field, fall through to
      // config.profiles".
      const store = useEditorStore;
      const config = makeConfig({
        screens: [{ id: 's1', name: 'A', backgroundImage: '', modules: [] }],
        profiles: [{ id: 'day', name: 'Day', screenIds: ['s1'] }],
      });
      store.setState({ config });

      store.getState().addDisplay({ id: 'kitchen', name: 'Kitchen' });

      const kitchen = store.getState().config!.displays!.find((d) => d.id === 'kitchen')!;
      expect(kitchen.profiles).toEqual([]);
      expect(kitchen.activeProfile).toBeUndefined();
    });

    it('does not double-create main when explicitly adding a display called "main"', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig() });

      store.getState().addDisplay({ id: 'main', name: 'Main' });

      const displays = store.getState().config!.displays!;
      expect(displays).toHaveLength(1);
      expect(displays[0].id).toBe('main');
    });

    it('does not re-create main when a second display is added', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig() });

      store.getState().addDisplay({ id: 'kitchen', name: 'Kitchen' });
      store.getState().addDisplay({ id: 'bedroom', name: 'Bedroom' });

      const displays = store.getState().config!.displays!;
      // main + kitchen + bedroom
      expect(displays.map((d) => d.id)).toEqual(['main', 'kitchen', 'bedroom']);
    });

    it('omits optional fields when not provided to keep saved JSON minimal', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig() });

      store.getState().addDisplay({ id: 'main', name: 'Main' });

      const display = store.getState().config!.displays![0];
      expect(display).not.toHaveProperty('profileIds');
      expect(display).not.toHaveProperty('activeProfile');
      expect(display).not.toHaveProperty('settings');
    });

    it('applies explicit per-display dimensions when provided', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig() });

      // Add main first to skip the auto-main branch
      store.getState().addDisplay({ id: 'main', name: 'Main' });
      store.getState().addDisplay({
        id: 'kitchen',
        name: 'Kitchen',
        displayWidth: 1080,
        displayHeight: 1920,
        displayTransform: '90',
      });

      const kitchen = store.getState().config!.displays!.find((d) => d.id === 'kitchen')!;
      expect(kitchen.displayWidth).toBe(1080);
      expect(kitchen.displayHeight).toBe(1920);
      expect(kitchen.displayTransform).toBe('90');
    });
  });

  describe('updateDisplay', () => {
    it('merges partial updates into the matching display', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [{ id: 'kitchen', name: 'Old name', screenIds: ['s1'] }],
      });
      store.setState({ config });

      store.getState().updateDisplay('kitchen', { name: 'Kitchen' });

      const display = store.getState().config!.displays![0];
      expect(display.name).toBe('Kitchen');
      expect(display.screenIds).toEqual(['s1']);
    });

    it('does not affect other displays', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [
          { id: 'kitchen', name: 'Kitchen', screenIds: [] },
          { id: 'bedroom', name: 'Bedroom', screenIds: [] },
        ],
      });
      store.setState({ config });

      store.getState().updateDisplay('kitchen', { name: 'New' });

      expect(store.getState().config!.displays![1].name).toBe('Bedroom');
    });
  });

  describe('updateDisplaySettings', () => {
    it('sets a new override on a display with no existing settings', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [{ id: 'kitchen', name: 'Kitchen', screenIds: [] }],
      });
      store.setState({ config });

      store.getState().updateDisplaySettings('kitchen', { cursorHideSeconds: 10 });

      const display = store.getState().config!.displays![0];
      expect(display.settings).toEqual({ cursorHideSeconds: 10 });
    });

    it('merges new overrides with existing ones', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screenIds: [],
          settings: { cursorHideSeconds: 10 },
        }],
      });
      store.setState({ config });

      store.getState().updateDisplaySettings('kitchen', { rotationIntervalMs: 60_000 });

      const display = store.getState().config!.displays![0];
      expect(display.settings).toEqual({
        cursorHideSeconds: 10,
        rotationIntervalMs: 60_000,
      });
    });

    it('deletes a key when the value is explicitly undefined (reset-to-inherited)', () => {
      // This is how "Reset to inherited" reaches the data layer: the form
      // sends `undefined` for the field, which we must NOT spread into
      // display.settings as-is — otherwise the merged GlobalSettings would
      // carry an `undefined` override that shadows the global value with
      // `undefined`. Delete the key so the shallow merge falls through.
      const store = useEditorStore;
      const config = makeConfig({
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screenIds: [],
          settings: { cursorHideSeconds: 10, rotationIntervalMs: 60_000 },
        }],
      });
      store.setState({ config });

      store.getState().updateDisplaySettings('kitchen', { cursorHideSeconds: undefined });

      const display = store.getState().config!.displays![0];
      expect(display.settings).toEqual({ rotationIntervalMs: 60_000 });
      expect(display.settings && 'cursorHideSeconds' in display.settings).toBe(false);
    });

    it('removes display.settings entirely when the last override is cleared', () => {
      // Keeps the on-disk JSON clean — no empty `settings: {}` left behind.
      const store = useEditorStore;
      const config = makeConfig({
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screenIds: [],
          settings: { cursorHideSeconds: 10 },
        }],
      });
      store.setState({ config });

      store.getState().updateDisplaySettings('kitchen', { cursorHideSeconds: undefined });

      const display = store.getState().config!.displays![0];
      expect('settings' in display).toBe(false);
    });

    it('does nothing when the display does not exist', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [{ id: 'kitchen', name: 'Kitchen', screenIds: [] }],
      });
      store.setState({ config, isDirty: false });

      store.getState().updateDisplaySettings('ghost', { cursorHideSeconds: 10 });

      // No-op: the original display is unchanged and nothing got marked dirty.
      const displays = store.getState().config!.displays!;
      expect(displays).toHaveLength(1);
      expect(displays[0].settings).toBeUndefined();
    });

    it('does nothing in legacy single-display mode (no displays array)', () => {
      const store = useEditorStore;
      const config = makeConfig();
      store.setState({ config, isDirty: false });

      store.getState().updateDisplaySettings('main', { cursorHideSeconds: 10 });

      expect(store.getState().config!.displays).toBeUndefined();
    });

    it('does not leak the new settings object to sibling displays', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [
          { id: 'kitchen', name: 'Kitchen', screenIds: [] },
          { id: 'bedroom', name: 'Bedroom', screenIds: [] },
        ],
      });
      store.setState({ config });

      store.getState().updateDisplaySettings('kitchen', { cursorHideSeconds: 10 });

      const displays = store.getState().config!.displays!;
      expect(displays[0].settings).toEqual({ cursorHideSeconds: 10 });
      expect(displays[1].settings).toBeUndefined();
    });
  });

  describe('removeDisplay', () => {
    it('removes the display by ID', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [
          { id: 'kitchen', name: 'Kitchen', screenIds: [] },
          { id: 'bedroom', name: 'Bedroom', screenIds: [] },
        ],
      });
      store.setState({ config });

      store.getState().removeDisplay('kitchen');

      const displays = store.getState().config!.displays!;
      expect(displays).toHaveLength(1);
      expect(displays[0].id).toBe('bedroom');
    });

    it('collapses to undefined when the last display is removed', () => {
      // Removing the last display must not leave `displays: []` behind —
      // that would promote a legacy single-display config into an empty
      // multi-display state that later code could misinterpret.
      const store = useEditorStore;
      const config = makeConfig({
        displays: [{ id: 'kitchen', name: 'Kitchen', screenIds: [] }],
      });
      store.setState({ config });

      store.getState().removeDisplay('kitchen');

      expect(store.getState().config!.displays).toBeUndefined();
    });
  });

  /* ─── cascade prune of display references ─────── */

  describe('removeScreen prunes display references', () => {
    it('removes deleted screen ID from each display.screenIds', () => {
      // This path exists specifically so the writeConfig validator
      // (validateDisplays) does not reject saves after a screen deletion.
      // A regression here only surfaces as a 400 on next save.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'A', backgroundImage: '', modules: [] },
          { id: 's2', name: 'B', backgroundImage: '', modules: [] },
        ],
        displays: [
          { id: 'kitchen', name: 'Kitchen', screenIds: ['s1', 's2'] },
          { id: 'bedroom', name: 'Bedroom', screenIds: ['s2'] },
        ],
      });
      store.setState({ config, selectedScreenId: 's1' });

      store.getState().removeScreen('s2');

      const displays = store.getState().config!.displays!;
      expect(displays[0].screenIds).toEqual(['s1']);
      expect(displays[1].screenIds).toEqual([]);
    });
  });

  describe('removeProfile prunes display references', () => {
    it('strips the deleted profile from display.profileIds and clears matching activeProfile', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [
          { id: 'day', name: 'Day', screenIds: [] },
          { id: 'night', name: 'Night', screenIds: [] },
        ],
        displays: [
          {
            id: 'kitchen',
            name: 'Kitchen',
            screenIds: [],
            profileIds: ['day', 'night'],
            activeProfile: 'day',
          },
          {
            id: 'bedroom',
            name: 'Bedroom',
            screenIds: [],
            profileIds: ['night'],
            activeProfile: 'night',
          },
        ],
      });
      store.setState({ config });

      store.getState().removeProfile('day');

      const displays = store.getState().config!.displays!;
      expect(displays[0].profileIds).toEqual(['night']);
      // activeProfile was 'day' on kitchen — should now be undefined
      expect(displays[0].activeProfile).toBeUndefined();
      // bedroom only had 'night' — should be untouched
      expect(displays[1].profileIds).toEqual(['night']);
      expect(displays[1].activeProfile).toBe('night');
    });
  });

  describe('saveConfig', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    function mockFetchOk() {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
    }

    function _mockFetchDelayed(_ms: number) {
      return () => {
        let resolver: (res: { ok: boolean; status: number }) => void;
        const promise = new Promise<{ ok: boolean; status: number }>((resolve) => {
          resolver = resolve;
        });
        fetchMock.mockReturnValueOnce(promise);
        return {
          resolve: () => resolver({ ok: true, status: 200 }),
          reject: () => resolver({ ok: false, status: 500 }),
        };
      };
    }

    function setupStoreWithConfig() {
      const store = useEditorStore;
      const config = makeConfig();
      store.setState({ config, isDirty: true, isSaving: false, saveError: null });
      return store;
    }

    it('saves successfully and clears isDirty when no changes occur during save', async () => {
      const store = setupStoreWithConfig();
      mockFetchOk();

      await store.getState().saveConfig();

      const state = store.getState();
      expect(state.isDirty).toBe(false);
      expect(state.isSaving).toBe(false);
      expect(state.saveError).toBeNull();
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith('/api/config', expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    it('sets isSaving to true during save', async () => {
      const store = setupStoreWithConfig();
      let capturedIsSaving = false;
      fetchMock.mockImplementation(() => {
        capturedIsSaving = store.getState().isSaving;
        return Promise.resolve({ ok: true, status: 200 });
      });

      await store.getState().saveConfig();

      expect(capturedIsSaving).toBe(true);
      expect(store.getState().isSaving).toBe(false);
    });

    it('keeps isDirty true when config changes during an in-flight save', async () => {
      const store = setupStoreWithConfig();

      // Set up a fetch that we control the resolution of
      let resolveFetch!: () => void;
      fetchMock.mockImplementation(() => new Promise<{ ok: boolean; status: number }>((resolve) => {
        resolveFetch = () => resolve({ ok: true, status: 200 });
      }));

      // Start save (don't await yet)
      const savePromise = store.getState().saveConfig();

      // While save is in flight, mutate the config — this creates a new object reference
      store.getState().updateSettings({ rotationIntervalMs: 99999 });

      // The config reference is now different from the snapshot taken before the save
      expect(store.getState().isDirty).toBe(true);

      // Resolve the fetch to complete the save
      resolveFetch();
      await savePromise;

      // isDirty must remain true because config changed during the save
      expect(store.getState().isDirty).toBe(true);
      expect(store.getState().isSaving).toBe(false);
      expect(store.getState().saveError).toBeNull();
    });

    it('concurrent save call is a no-op while another save is in flight', async () => {
      const store = setupStoreWithConfig();

      let resolveFetch!: () => void;
      fetchMock.mockImplementation(() => new Promise<{ ok: boolean; status: number }>((resolve) => {
        resolveFetch = () => resolve({ ok: true, status: 200 });
      }));

      // Start first save
      const firstSave = store.getState().saveConfig();
      expect(store.getState().isSaving).toBe(true);

      // Attempt a second save while first is in flight — should be a no-op
      const secondSave = store.getState().saveConfig();

      // Only one fetch call should have been made
      expect(fetchMock).toHaveBeenCalledOnce();

      // Resolve and finish
      resolveFetch();
      await firstSave;
      await secondSave;

      expect(store.getState().isSaving).toBe(false);
      // Still only one fetch call total
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('save error keeps isDirty true so retry can happen', async () => {
      const store = setupStoreWithConfig();
      fetchMock.mockResolvedValue({ ok: false, status: 500 });

      await expect(store.getState().saveConfig()).rejects.toThrow('Save failed: 500');

      const state = store.getState();
      // isDirty was never cleared — save error should not lose unsaved changes
      expect(state.isDirty).toBe(true);
      expect(state.isSaving).toBe(false);
      expect(state.saveError).toBe('Failed to save');
    });

    it('save error from network failure keeps isDirty true', async () => {
      const store = setupStoreWithConfig();
      fetchMock.mockRejectedValue(new Error('Network error'));

      await expect(store.getState().saveConfig()).rejects.toThrow('Network error');

      const state = store.getState();
      expect(state.isDirty).toBe(true);
      expect(state.isSaving).toBe(false);
      expect(state.saveError).toBe('Failed to save');
    });

    it('retry after error works correctly', async () => {
      const store = setupStoreWithConfig();

      // First save fails
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(store.getState().saveConfig()).rejects.toThrow();
      expect(store.getState().isDirty).toBe(true);
      expect(store.getState().isSaving).toBe(false);

      // Retry succeeds
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
      await store.getState().saveConfig();

      expect(store.getState().isDirty).toBe(false);
      expect(store.getState().isSaving).toBe(false);
      expect(store.getState().saveError).toBeNull();
    });

    it('does nothing when config is null', async () => {
      const store = useEditorStore;
      store.setState({ config: null, isDirty: false, isSaving: false });
      mockFetchOk();

      await store.getState().saveConfig();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('multiple rapid mutations followed by a single save sends latest config', async () => {
      const store = setupStoreWithConfig();
      mockFetchOk();

      // Perform several rapid mutations
      store.getState().updateSettings({ rotationIntervalMs: 10000 });
      store.getState().updateSettings({ rotationIntervalMs: 20000 });
      store.getState().updateSettings({ rotationIntervalMs: 30000 });

      await store.getState().saveConfig();

      // The body sent should contain the latest value
      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sentBody.settings.rotationIntervalMs).toBe(30000);
      expect(store.getState().isDirty).toBe(false);
    });

    it('save clears a previous saveError on success', async () => {
      const store = setupStoreWithConfig();

      // First save fails to set saveError
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
      await expect(store.getState().saveConfig()).rejects.toThrow();
      expect(store.getState().saveError).toBe('Failed to save');

      // Second save succeeds — error should be cleared
      fetchMock.mockResolvedValueOnce({ ok: true, status: 200 });
      await store.getState().saveConfig();
      expect(store.getState().saveError).toBeNull();
    });

    it('sequential save after in-flight save completes picks up new changes', async () => {
      const store = setupStoreWithConfig();

      let resolveFetch!: () => void;
      let fetchCallCount = 0;
      fetchMock.mockImplementation(() => new Promise<{ ok: boolean; status: number }>((resolve) => {
        fetchCallCount++;
        resolveFetch = () => resolve({ ok: true, status: 200 });
      }));

      // Start first save
      const firstSave = store.getState().saveConfig();

      // Mutate while first save is in flight
      store.getState().updateSettings({ rotationIntervalMs: 55555 });

      // Complete first save
      resolveFetch();
      await firstSave;

      // isDirty should still be true (mutation happened during save)
      expect(store.getState().isDirty).toBe(true);
      expect(fetchCallCount).toBe(1);

      // Now second save should send the new config
      const secondSave = store.getState().saveConfig();
      resolveFetch();
      await secondSave;

      expect(fetchCallCount).toBe(2);
      // Verify the second save sent the updated value
      const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(secondBody.settings.rotationIntervalMs).toBe(55555);
      expect(store.getState().isDirty).toBe(false);
    });

    it('mutation during save does not corrupt the in-flight snapshot', async () => {
      const store = setupStoreWithConfig();

      let capturedBody = '';
      fetchMock.mockImplementation((_url: string, opts: RequestInit) => {
        capturedBody = opts.body as string;
        // Mutate config WHILE fetch is being processed (simulating synchronous interleaving)
        store.getState().addModule('screen-1', 'clock');
        return Promise.resolve({ ok: true, status: 200 });
      });

      await store.getState().saveConfig();

      // The body that was sent should match the original snapshot, NOT include the module added during fetch
      const sentConfig = JSON.parse(capturedBody);
      expect(sentConfig.screens[0].modules).toHaveLength(0);

      // But the current state should have the new module
      expect(store.getState().config!.screens[0].modules).toHaveLength(1);

      // And isDirty should be true since config changed during save
      expect(store.getState().isDirty).toBe(true);
    });

    it('isSaving guard prevents stale snapshot from overwriting newer data', async () => {
      const store = setupStoreWithConfig();

      let resolveFetch!: () => void;
      fetchMock.mockImplementation(() => new Promise<{ ok: boolean; status: number }>((resolve) => {
        resolveFetch = () => resolve({ ok: true, status: 200 });
      }));

      // Start first save — captures snapshot of config
      const firstSave = store.getState().saveConfig();

      // Mutate config multiple times while save is in flight
      store.getState().updateSettings({ rotationIntervalMs: 11111 });
      store.getState().updateSettings({ rotationIntervalMs: 22222 });

      // Attempt another save — should be blocked by isSaving guard
      const blockedSave = store.getState().saveConfig();

      // Complete first save
      resolveFetch();
      await firstSave;
      await blockedSave;

      // Config should retain the latest mutations, not be overwritten
      expect(store.getState().config!.settings.rotationIntervalMs).toBe(22222);
      // isDirty should be true since config diverged from what was saved
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('toggleSnap', () => {
    it('defaults to true', () => {
      expect(useEditorStore.getState().snapEnabled).toBe(true);
    });

    it('toggles snapEnabled off and on', () => {
      const store = useEditorStore;
      store.getState().toggleSnap();
      expect(store.getState().snapEnabled).toBe(false);
      store.getState().toggleSnap();
      expect(store.getState().snapEnabled).toBe(true);
    });

    it('does not set isDirty', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });
      store.getState().toggleSnap();
      expect(store.getState().isDirty).toBe(false);
    });
  });

  describe('undo/redo', () => {
    it('undo restores previous config and selection', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false, selectedModuleId: null });

      store.getState().addModule('screen-1', 'clock');
      expect(store.getState().config!.screens[0].modules).toHaveLength(1);
      const addedModuleId = store.getState().selectedModuleId;
      expect(addedModuleId).not.toBeNull();

      store.getState().undo();

      expect(store.getState().config!.screens[0].modules).toHaveLength(0);
      expect(store.getState().selectedModuleId).toBeNull();
      expect(store.getState().isDirty).toBe(true);
    });

    it('redo restores undone state', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().addModule('screen-1', 'clock');
      const moduleId = store.getState().config!.screens[0].modules[0].id;

      store.getState().undo();
      expect(store.getState().config!.screens[0].modules).toHaveLength(0);

      store.getState().redo();
      expect(store.getState().config!.screens[0].modules).toHaveLength(1);
      expect(store.getState().config!.screens[0].modules[0].id).toBe(moduleId);
      expect(store.getState().selectedModuleId).toBe(moduleId);
    });

    it('new mutation clears redo stack', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().addModule('screen-1', 'clock');
      store.getState().undo();
      expect(store.getState()._future.length).toBeGreaterThan(0);

      // New mutation should clear future
      store.getState().addModule('screen-1', 'text');
      expect(store.getState()._future).toHaveLength(0);
    });

    it('enforces max history of 50 entries', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      for (let i = 0; i < 55; i++) {
        store.getState().addModule('screen-1', 'clock');
      }

      expect(store.getState()._past.length).toBeLessThanOrEqual(50);
    });

    it('loadConfig clears history', async () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().addModule('screen-1', 'clock');
      store.getState().addModule('screen-1', 'text');
      expect(store.getState()._past.length).toBeGreaterThan(0);

      // Mock fetch for loadConfig
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(makeConfig()),
      });
      vi.stubGlobal('fetch', fetchMock);

      await store.getState().loadConfig();

      expect(store.getState()._past).toHaveLength(0);
      expect(store.getState()._future).toHaveLength(0);
    });

    it('importConfig records history before replacement', () => {
      const store = useEditorStore;
      const originalConfig = makeConfig();
      store.setState({ config: originalConfig, isDirty: false, selectedScreenId: 'screen-1' });

      const imported = makeConfig({
        screens: [{ id: 'new-screen', name: 'New', backgroundImage: '', modules: [] }],
      });
      store.getState().importConfig(JSON.stringify(imported));

      expect(store.getState().config!.screens[0].id).toBe('new-screen');
      expect(store.getState()._past).toHaveLength(1);

      // Undo should restore original
      store.getState().undo();
      expect(store.getState().config!.screens[0].id).toBe('screen-1');
    });

    it('coalescing merges rapid updates into single entry', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [{
        id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 },
        zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
      }];
      store.setState({ config, isDirty: false });

      // Rapid updateModuleStyle calls (coalesce: true) with no time gap
      store.getState().updateModuleStyle('screen-1', 'mod-1', { opacity: 0.5 });
      store.getState().updateModuleStyle('screen-1', 'mod-1', { opacity: 0.3 });
      store.getState().updateModuleStyle('screen-1', 'mod-1', { opacity: 0.1 });

      // Should coalesce into a single history entry
      expect(store.getState()._past).toHaveLength(1);

      // Undo should go back to original opacity
      store.getState().undo();
      expect(store.getState().config!.screens[0].modules[0].style.opacity).toBe(DEFAULT_MODULE_STYLE.opacity);
    });

    it('discrete actions (addModule) do not coalesce', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().addModule('screen-1', 'clock');
      store.getState().addModule('screen-1', 'text');

      // Each addModule should be a separate history entry
      expect(store.getState()._past).toHaveLength(2);
    });

    it('different action keys do not coalesce even within time window', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [
        { id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
        { id: 'mod-2', type: 'text', position: { x: 100, y: 100 }, size: { w: 400, h: 150 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
      ];
      store.setState({ config, isDirty: false });

      // Move module A then style module B within same tick — different action keys
      store.getState().moveModule('screen-1', 'mod-1', { x: 50, y: 50 });
      store.getState().updateModuleStyle('screen-1', 'mod-2', { opacity: 0.5 });

      // Should be two separate history entries
      expect(store.getState()._past).toHaveLength(2);
    });

    it('future stack is capped at MAX_HISTORY', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      // Create 55 history entries
      for (let i = 0; i < 55; i++) {
        store.getState().addModule('screen-1', 'clock');
      }

      // Undo all of them — future stack should be capped
      for (let i = 0; i < 55; i++) {
        store.getState().undo();
      }

      expect(store.getState()._future.length).toBeLessThanOrEqual(50);
    });

    it('undo is a no-op when past is empty', () => {
      const store = useEditorStore;
      const config = makeConfig();
      store.setState({ config, isDirty: false });

      store.getState().undo();

      // State should be unchanged
      expect(store.getState().config).toBe(config);
      expect(store.getState().isDirty).toBe(false);
    });

    it('redo is a no-op when future is empty', () => {
      const store = useEditorStore;
      const config = makeConfig();
      store.setState({ config, isDirty: false });

      store.getState().redo();

      expect(store.getState().config).toBe(config);
      expect(store.getState().isDirty).toBe(false);
    });

    it('undo sets isDirty to true', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().addModule('screen-1', 'clock');
      // Simulate that auto-save cleared isDirty
      store.setState({ isDirty: false });

      store.getState().undo();
      expect(store.getState().isDirty).toBe(true);
    });

    it('undo after screen removal restores the screen', () => {
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'Screen 1', backgroundImage: '', modules: [] },
          { id: 's2', name: 'Screen 2', backgroundImage: '', modules: [] },
        ],
      });
      store.setState({ config, selectedScreenId: 's2' });

      store.getState().removeScreen('s2');
      expect(store.getState().config!.screens).toHaveLength(1);

      store.getState().undo();
      expect(store.getState().config!.screens).toHaveLength(2);
      expect(store.getState().selectedScreenId).toBe('s2');
    });

    it('multiple undo/redo cycles work correctly', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().addModule('screen-1', 'clock');
      store.getState().addModule('screen-1', 'text');

      expect(store.getState().config!.screens[0].modules).toHaveLength(2);

      store.getState().undo();
      expect(store.getState().config!.screens[0].modules).toHaveLength(1);

      store.getState().undo();
      expect(store.getState().config!.screens[0].modules).toHaveLength(0);

      store.getState().redo();
      expect(store.getState().config!.screens[0].modules).toHaveLength(1);

      store.getState().redo();
      expect(store.getState().config!.screens[0].modules).toHaveLength(2);
    });
  });

  /* ─── Multi-display regression guards ─────────────── */

  describe('multi-display: removeScreen strips profile refs in multi-display mode', () => {
    it('removes a deleted owned-screen ID from all profile.screenIds', async () => {
      // Regression guard: profiles are GLOBAL (not per-display), and a
      // profile created while editing a display can reference owned-screen
      // IDs from that display. If removeScreen skips profile cleanup in
      // multi-display mode, deleting the screen leaves a dangling ID that
      // silently shrinks the profile when the rotator resolves it.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [
            { id: 'k1', name: 'K1', backgroundImage: '', modules: [] },
            { id: 'k2', name: 'K2', backgroundImage: '', modules: [] },
          ],
          displayWidth: 1080,
          displayHeight: 1920,
        }],
        profiles: [
          { id: 'day', name: 'Day', screenIds: ['k1', 'k2'] },
          { id: 'night', name: 'Night', screenIds: ['k2'] },
        ],
      });
      store.setState({
        config,
        selectedDisplayId: 'kitchen',
        selectedScreenId: 'k1',
      });

      store.getState().removeScreen('k2');

      const profiles = store.getState().config!.profiles!;
      expect(profiles[0].screenIds).toEqual(['k1']);
      expect(profiles[1].screenIds).toEqual([]);
      // The display's owned screens should also have been updated.
      const kitchen = store.getState().config!.displays!.find((d) => d.id === 'kitchen')!;
      expect(kitchen.screens?.map((s) => s.id)).toEqual(['k1']);
    });
  });

  describe('multi-display: removeDisplay re-resolves selectedScreenId', () => {
    it('points selectedScreenId at the new active display when the selected display is removed', () => {
      // Regression guard: the previously-selected screen was owned by the
      // removed display and is unreachable — leaving selectedScreenId
      // pointing at it would leave the canvas blank until the user
      // manually clicks a tab.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [],
        displays: [
          {
            id: 'main',
            name: 'Main',
            screens: [{ id: 'main-1', name: 'Main 1', backgroundImage: '', modules: [] }],
          },
          {
            id: 'kitchen',
            name: 'Kitchen',
            screens: [{ id: 'k1', name: 'K1', backgroundImage: '', modules: [] }],
          },
        ],
      });
      store.setState({
        config,
        selectedDisplayId: 'kitchen',
        selectedScreenId: 'k1',
        selectedModuleId: 'irrelevant-mod-id',
      });

      store.getState().removeDisplay('kitchen');

      const state = store.getState();
      expect(state.selectedDisplayId).toBe('main');
      expect(state.selectedScreenId).toBe('main-1');
      expect(state.selectedModuleId).toBeNull();
    });

    it('collapses to legacy mode and picks the global pool first screen when the last display is removed', () => {
      const store = useEditorStore;
      const config = makeConfig({
        // Legacy pool has a surviving screen that should be picked after
        // the display collapses.
        screens: [{ id: 'legacy-1', name: 'L1', backgroundImage: '', modules: [] }],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [{ id: 'k1', name: 'K1', backgroundImage: '', modules: [] }],
        }],
      });
      store.setState({
        config,
        selectedDisplayId: 'kitchen',
        selectedScreenId: 'k1',
      });

      store.getState().removeDisplay('kitchen');

      const state = store.getState();
      expect(state.config!.displays).toBeUndefined();
      expect(state.selectedDisplayId).toBeNull();
      expect(state.selectedScreenId).toBe('legacy-1');
    });
  });

  describe('multi-display: addDisplay({id: "main"}) as first display inherits existing screens', () => {
    it('seeds the explicit main display with the existing global screens + profiles so the hub kiosk survives', () => {
      // Regression guard: a user who names their first display "main"
      // should get the same hub-survival behavior as the auto-create-main
      // branch. Without this, the hub Pi silently loses its existing
      // screens (and its existing profile list) and shows an empty kiosk
      // after multi-display is enabled.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'A', backgroundImage: '', modules: [] },
          { id: 's2', name: 'B', backgroundImage: '', modules: [] },
        ],
        profiles: [
          { id: 'day', name: 'Day', screenIds: ['s1', 's2'] },
        ],
      });
      config.settings.activeProfile = 'day';
      store.setState({ config });

      store.getState().addDisplay({
        id: 'main',
        name: 'Main',
        displayWidth: 1920,
        displayHeight: 1080,
      });

      const displays = store.getState().config!.displays!;
      expect(displays).toHaveLength(1);
      expect(displays[0].id).toBe('main');
      expect(displays[0].screens?.map((s) => s.id)).toEqual(['s1', 's2']);
      // Profile inheritance mirrors screen inheritance — Main owns a
      // deep-cloned copy of the legacy pool.
      expect(displays[0].profiles?.map((p) => p.id)).toEqual(['day']);
      expect(displays[0].activeProfile).toBe('day');
      // User-provided dims are still respected (not overwritten by global).
      expect(displays[0].displayWidth).toBe(1920);
      expect(displays[0].displayHeight).toBe(1080);
    });
  });

  describe('multi-display: importLayoutAction preserves global dims in multi-display mode', () => {
    it('does not leak per-display dimensions into config.settings when importing', async () => {
      // Regression guard: importLayoutAction builds a temp-config shim
      // with the active display's dims so importLayoutCore can scale
      // modules correctly. Those per-display dims must NOT be written
      // back onto config.settings — doing so would silently corrupt the
      // global fallback for any display that still relies on it.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [],
        displays: [
          {
            id: 'main',
            name: 'Main',
            screens: [{ id: 'main-1', name: 'Main 1', backgroundImage: '', modules: [] }],
            displayWidth: 1920,
            displayHeight: 1080,
          },
          {
            id: 'kitchen',
            name: 'Kitchen',
            screens: [{ id: 'k1', name: 'K1', backgroundImage: '', modules: [] }],
            displayWidth: 1080,
            displayHeight: 1920,
          },
        ],
      });
      // Hub-level global dims — must survive the import below.
      config.settings.displayWidth = 1920;
      config.settings.displayHeight = 1080;
      store.setState({
        config,
        selectedDisplayId: 'kitchen',
        selectedScreenId: 'k1',
      });

      const layoutJson = {
        _type: 'home-screens-layout' as const,
        _version: 1 as const,
        metadata: {
          name: 'test',
          description: '',
          exportedAt: new Date().toISOString(),
          configVersion: 1,
          sourceDisplay: { width: 1080, height: 1920 },
          screenCount: 1,
          moduleCount: 0,
        },
        visual: {
          rotationIntervalMs: 30000,
        },
        screens: [{
          id: 'imported-1',
          name: 'Imported',
          backgroundImage: '',
          modules: [],
        }],
      };

      store.getState().importLayoutAction(layoutJson, { mode: 'add' });

      const state = store.getState();
      // Global settings dims remain at the hub's resolution, NOT the
      // kitchen's per-display dims.
      expect(state.config!.settings.displayWidth).toBe(1920);
      expect(state.config!.settings.displayHeight).toBe(1080);
      // The imported screen landed in the kitchen display (screens are
      // assigned fresh UUIDs by importLayoutCore, so check by length and
      // that the original is still there).
      const kitchen = state.config!.displays!.find((d) => d.id === 'kitchen')!;
      expect(kitchen.screens).toHaveLength(2);
      expect(kitchen.screens?.some((s) => s.id === 'k1')).toBe(true);
      // The legacy global pool stays empty — nothing leaked into it.
      expect(state.config!.screens).toEqual([]);
      // Main's screens are untouched.
      const main = state.config!.displays!.find((d) => d.id === 'main')!;
      expect(main.screens).toHaveLength(1);
      expect(main.screens?.[0].id).toBe('main-1');
    });
  });

  describe('multi-display: getActiveScreens helper branches', () => {
    it('returns config.screens when selectedDisplayId is null (legacy mode)', async () => {
      const mod = await import('@/stores/editor-store');
      const config = makeConfig({
        screens: [{ id: 'g1', name: 'G1', backgroundImage: '', modules: [] }],
      });
      expect(mod.getActiveScreens(config, null)).toEqual([
        { id: 'g1', name: 'G1', backgroundImage: '', modules: [] },
      ]);
    });

    it('returns display.screens for a multi-display with owned screens', async () => {
      const mod = await import('@/stores/editor-store');
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'K',
          screens: [{ id: 'k1', name: 'K1', backgroundImage: '', modules: [] }],
        }],
      });
      expect(mod.getActiveScreens(config, 'kitchen').map((s) => s.id)).toEqual(['k1']);
    });

    it('resolves legacy screenIds against config.screens when the display uses the shared-pool model', async () => {
      const mod = await import('@/stores/editor-store');
      const config = makeConfig({
        screens: [
          { id: 's1', name: 'A', backgroundImage: '', modules: [] },
          { id: 's2', name: 'B', backgroundImage: '', modules: [] },
        ],
        displays: [{
          id: 'kitchen',
          name: 'K',
          screenIds: ['s2'],
        }],
      });
      expect(mod.getActiveScreens(config, 'kitchen').map((s) => s.id)).toEqual(['s2']);
    });

    it('falls back to config.screens when the selected display ID is unknown', async () => {
      const mod = await import('@/stores/editor-store');
      const config = makeConfig({
        screens: [{ id: 'g1', name: 'G1', backgroundImage: '', modules: [] }],
      });
      expect(mod.getActiveScreens(config, 'does-not-exist')).toEqual([
        { id: 'g1', name: 'G1', backgroundImage: '', modules: [] },
      ]);
    });
  });

  /* ─── Per-display profile routing (Phase 4) ────── */

  describe('per-display profile routing', () => {
    it('addProfile targets display.profiles when the selected display owns profiles', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [{ id: 'pool-day', name: 'Pool Day', screenIds: [] }],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [{ id: 'k-s1', name: 'K1', backgroundImage: '', modules: [] }],
          profiles: [],
        }],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().addProfile('Owned One');

      // Global pool untouched
      expect(store.getState().config!.profiles).toHaveLength(1);
      expect(store.getState().config!.profiles![0].id).toBe('pool-day');
      // New profile landed on the display
      const display = store.getState().config!.displays![0];
      expect(display.profiles).toHaveLength(1);
      expect(display.profiles![0].name).toBe('Owned One');
      // Screens seeded from the active display's own screens
      expect(display.profiles![0].screenIds).toEqual(['k-s1']);
    });

    it('addProfile still targets the global pool when the selected display uses shared profiles', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [{ id: 'k-s1', name: 'K1', backgroundImage: '', modules: [] }],
          // Shared-pool mode: no owned profiles
        }],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().addProfile('Shared One');

      expect(store.getState().config!.profiles).toHaveLength(1);
      expect(store.getState().config!.displays![0].profiles).toBeUndefined();
    });

    it('updateProfile targets display.profiles when the selected display owns profiles', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [{ id: 'pool-day', name: 'Pool Day', screenIds: [] }],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [{ id: 'k-s1', name: 'K1', backgroundImage: '', modules: [] }],
          profiles: [{ id: 'owned-day', name: 'Owned Day', screenIds: ['k-s1'] }],
        }],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().updateProfile('owned-day', { name: 'Owned Morning' });

      expect(store.getState().config!.displays![0].profiles![0].name).toBe('Owned Morning');
      // Global pool untouched
      expect(store.getState().config!.profiles![0].name).toBe('Pool Day');
    });

    it('removeProfile targets display.profiles when the selected display owns profiles', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [{ id: 'pool-day', name: 'Pool Day', screenIds: [] }],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [{ id: 'k-s1', name: 'K1', backgroundImage: '', modules: [] }],
          profiles: [
            { id: 'owned-day', name: 'Owned Day', screenIds: ['k-s1'] },
            { id: 'owned-night', name: 'Owned Night', screenIds: ['k-s1'] },
          ],
          activeProfile: 'owned-day',
        }],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().removeProfile('owned-day');

      const display = store.getState().config!.displays![0];
      expect(display.profiles).toHaveLength(1);
      expect(display.profiles![0].id).toBe('owned-night');
      // activeProfile cleared because it was the removed one
      expect(display.activeProfile).toBeUndefined();
      // Global pool untouched
      expect(store.getState().config!.profiles![0].id).toBe('pool-day');
    });

    it('reorderProfiles targets display.profiles when the selected display owns profiles', () => {
      const store = useEditorStore;
      const config = makeConfig({
        // Global pool reversed — if the wrong branch is taken, the
        // global pool would be reordered instead and this test would
        // observe that the owned profiles are unchanged.
        profiles: [
          { id: 'pool-day', name: 'Pool Day', screenIds: [] },
          { id: 'pool-night', name: 'Pool Night', screenIds: [] },
        ],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [{ id: 'k-s1', name: 'K1', backgroundImage: '', modules: [] }],
          profiles: [
            { id: 'owned-a', name: 'Owned A', screenIds: ['k-s1'] },
            { id: 'owned-b', name: 'Owned B', screenIds: ['k-s1'] },
            { id: 'owned-c', name: 'Owned C', screenIds: ['k-s1'] },
          ],
        }],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().reorderProfiles(0, 2);

      // Owned order becomes [B, C, A]
      const display = store.getState().config!.displays![0];
      expect(display.profiles!.map((p) => p.id)).toEqual(['owned-b', 'owned-c', 'owned-a']);
      // Global pool order untouched
      expect(store.getState().config!.profiles!.map((p) => p.id)).toEqual(['pool-day', 'pool-night']);
    });

    it('setActiveProfile targets display.activeProfile in multi-display mode', () => {
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [{ id: 'pool-day', name: 'Pool Day', screenIds: [] }],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [{ id: 'k-s1', name: 'K1', backgroundImage: '', modules: [] }],
          profiles: [{ id: 'owned-day', name: 'Owned Day', screenIds: ['k-s1'] }],
        }],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().setActiveProfile('owned-day');

      expect(store.getState().config!.displays![0].activeProfile).toBe('owned-day');
      // Global activeProfile untouched
      expect(store.getState().config!.settings.activeProfile).toBeUndefined();
    });

    it('setActiveProfile targets global settings when the selected display uses the shared pool', () => {
      // Regression guard for the read/write split-brain: without the
      // owned-profiles guard, shared-pool displays used to write to
      // display.activeProfile while ProfilesSection read from
      // config.settings.activeProfile, leaving the dropdown out of sync
      // with the actual rendered profile.
      const store = useEditorStore;
      const config = makeConfig({
        profiles: [{ id: 'pool-day', name: 'Pool Day', screenIds: [] }],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [{ id: 'k-s1', name: 'K1', backgroundImage: '', modules: [] }],
          // No owned profiles — shared pool.
        }],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().setActiveProfile('pool-day');

      // Write lands on the global settings, matching what ProfilesSection
      // reads for shared-pool displays.
      expect(store.getState().config!.settings.activeProfile).toBe('pool-day');
      expect(store.getState().config!.displays![0].activeProfile).toBeUndefined();
    });

    it('removeScreen prunes the deleted screen ID from the active display\'s owned profiles', () => {
      // The screen gets removed from display.screens. The display also
      // owns profiles that reference that screen id. Without cascade-prune
      // validateDisplays rejects the save because the profile's screenId
      // is now dangling.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [],
        displays: [{
          id: 'kitchen',
          name: 'Kitchen',
          screens: [
            { id: 'k-s1', name: 'K1', backgroundImage: '', modules: [] },
            { id: 'k-s2', name: 'K2', backgroundImage: '', modules: [] },
          ],
          profiles: [{
            id: 'owned-day',
            name: 'Owned Day',
            screenIds: ['k-s1', 'k-s2'],
          }],
        }],
      });
      store.setState({ config, selectedDisplayId: 'kitchen', selectedScreenId: 'k-s1' });

      store.getState().removeScreen('k-s1');

      const display = store.getState().config!.displays![0];
      expect(display.screens).toHaveLength(1);
      expect(display.screens![0].id).toBe('k-s2');
      // The owned profile's screenIds were pruned to just k-s2
      expect(display.profiles![0].screenIds).toEqual(['k-s2']);
    });
  });
});
