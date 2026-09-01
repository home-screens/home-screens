import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ScreenConfiguration } from '@/types/config';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { defaultPresetForLocale } from '@/lib/news-presets';

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
      calendar: { googleCalendarId: '', googleCalendarIds: [], icalSources: [], daysAhead: 7 },
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
      // No drop point: the first free grid spot, one inset in from the corner.
      expect(screen.modules[0].position).toEqual({ x: 40, y: 40 });
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

    it('stacks new modules above existing ones, even after reorders', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [
        { id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
        { id: 'mod-2', type: 'text', position: { x: 100, y: 100 }, size: { w: 400, h: 150 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
      ];
      store.setState({ config, isDirty: false });

      // Spread the zIndex values out (mod-1 → z2, mod-2 → z1)…
      store.getState().reorderModule('screen-1', 'mod-1', 'front');
      // …then a newly added module must still land on top.
      store.getState().addModule('screen-1', 'text');

      const modules = store.getState().config!.screens[0].modules;
      const maxExisting = Math.max(...modules.slice(0, 2).map((m) => m.zIndex));
      expect(modules[2].zIndex).toBe(maxExisting + 1);
    });

    it('seeds a news module with a feed in the household language', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.settings.locale = 'de-DE';
      store.setState({ config, isDirty: false });

      store.getState().addModule('screen-1', 'news');
      store.getState().addModule('screen-1', 'fullscreen-news');

      const feeds = store.getState().config!.screens[0].modules.map(
        (m) => (m.config as { feeds: { url: string }[] }).feeds,
      );
      expect(feeds[0]).toHaveLength(1);
      expect(feeds[0]).toEqual(feeds[1]);
      expect(feeds[0][0].url).toBe(defaultPresetForLocale('de-DE').url);
      expect(feeds[0][0].url).not.toBe(defaultPresetForLocale('en-US').url);
    });

    it('falls back to the registry default feed when the locale has no presets', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.settings.locale = 'ja-JP';
      store.setState({ config, isDirty: false });

      store.getState().addModule('screen-1', 'news');

      const feeds = (store.getState().config!.screens[0].modules[0].config as { feeds: { url: string }[] }).feeds;
      expect(feeds[0].url).toBe(defaultPresetForLocale('en-US').url);
    });

    it('renormalizes a legacy tied screen so zIndex stays dense on add', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [
        { id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
        { id: 'mod-2', type: 'text', position: { x: 100, y: 100 }, size: { w: 400, h: 150 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
      ];
      store.setState({ config, isDirty: false });

      store.getState().addModule('screen-1', 'text');

      const modules = store.getState().config!.screens[0].modules;
      // Existing ties compact to 1..n in array order; the new module gets n+1.
      expect(modules.map((m) => m.zIndex)).toEqual([1, 2, 3]);
    });
  });

  describe('reorderModule', () => {
    it('brings a module to the front and renormalizes zIndex', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [
        { id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
        { id: 'mod-2', type: 'text', position: { x: 100, y: 100 }, size: { w: 400, h: 150 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
      ];
      store.setState({ config, isDirty: false });

      store.getState().reorderModule('screen-1', 'mod-1', 'front');

      const modules = store.getState().config!.screens[0].modules;
      // Array order untouched; only zIndex values changed.
      expect(modules.map((m) => m.id)).toEqual(['mod-1', 'mod-2']);
      expect(modules.map((m) => m.zIndex)).toEqual([2, 1]);
      expect(store.getState().isDirty).toBe(true);
    });

    it('is undoable as a single history step', () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules = [
        { id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
        { id: 'mod-2', type: 'text', position: { x: 100, y: 100 }, size: { w: 400, h: 150 }, zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE } },
      ];
      store.setState({ config, isDirty: false });

      store.getState().reorderModule('screen-1', 'mod-1', 'front');
      store.getState().undo();

      const modules = store.getState().config!.screens[0].modules;
      expect(modules.map((m) => m.zIndex)).toEqual([1, 1]);
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

    it('keeps the module inside the canvas', () => {
      const store = useEditorStore;
      const config = makeConfig();
      // A 1080x1920 portrait canvas; without the transform the editor
      // orients these dimensions landscape.
      config.settings.displayTransform = '90';
      config.screens[0].modules = [{
        id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 },
        zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
      }];
      store.setState({ config });

      store.getState().moveModule('screen-1', 'mod-1', { x: 5000, y: -50 });
      expect(store.getState().config!.screens[0].modules[0].position).toEqual({ x: 680, y: 0 });
    });

    it('pins a module larger than the canvas to the origin', () => {
      const store = useEditorStore;
      const config = makeConfig();
      // A 1080x1920 portrait canvas; without the transform the editor
      // orients these dimensions landscape.
      config.settings.displayTransform = '90';
      config.screens[0].modules = [{
        id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 1400, h: 2200 },
        zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
      }];
      store.setState({ config });

      store.getState().moveModule('screen-1', 'mod-1', { x: 100, y: 100 });
      expect(store.getState().config!.screens[0].modules[0].position).toEqual({ x: 0, y: 0 });
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

    /**
     * The resize handle sits at the module's bottom-right corner and the
     * canvas clips at its border, so a size that reaches past the edge puts
     * the handle where nothing can grab it. The size stops at the edge, from
     * wherever the module sits.
     */
    it('stops at the canvas edge from the module position', () => {
      const store = useEditorStore;
      const config = makeConfig();
      // A 1080x1920 portrait canvas; without the transform the editor
      // orients these dimensions landscape.
      config.settings.displayTransform = '90';
      config.screens[0].modules = [{
        id: 'mod-1', type: 'clock', position: { x: 600, y: 1600 }, size: { w: 400, h: 200 },
        zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
      }];
      store.setState({ config });

      store.getState().resizeModule('screen-1', 'mod-1', { w: 5000, h: 5000 });
      expect(store.getState().config!.screens[0].modules[0].size).toEqual({ w: 480, h: 320 });
    });

    it('clamps against the selected display dimensions, not the global ones', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [{
          id: 'wall', name: 'Wall', displayWidth: 1920, displayHeight: 1080, displayTransform: 'normal',
          screens: [{ id: 'screen-1', name: 'Screen 1', backgroundImage: '', modules: [{
            id: 'mod-1', type: 'clock', position: { x: 0, y: 0 }, size: { w: 400, h: 200 },
            zIndex: 1, config: {}, style: { ...DEFAULT_MODULE_STYLE },
          }] }],
        }],
      });
      store.setState({ config, selectedDisplayId: 'wall' });

      store.getState().resizeModule('screen-1', 'mod-1', { w: 5000, h: 5000 });
      expect(store.getState().config!.displays![0].screens[0].modules[0].size).toEqual({ w: 1920, h: 1080 });
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

  describe('addRule', () => {
    it('adds a rule with a valid default action targeting the first screen', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig(), isDirty: false });

      store.getState().addRule('Doorbell');

      const state = store.getState();
      expect(state.config!.rules).toHaveLength(1);
      expect(state.config!.rules![0].name).toBe('Doorbell');
      expect(state.config!.rules![0].when).toEqual([]);
      expect(state.config!.rules![0].action).toEqual({
        kind: 'showScreen', screenId: 'screen-1', mode: 'for', seconds: 60,
      });
      expect(state.isDirty).toBe(true);
    });

    it('targets the selected display in multi-display mode', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [
          { id: 'main', name: 'Main', screens: [{ id: 'm1', name: 'M1', backgroundImage: '', modules: [] }] },
          { id: 'kitchen', name: 'Kitchen', screens: [{ id: 'k1', name: 'K1', backgroundImage: '', modules: [] }] },
        ],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().addRule('Kitchen rule');

      const displays = store.getState().config!.displays!;
      const kitchen = displays.find((d) => d.id === 'kitchen')!;
      expect(kitchen.rules).toHaveLength(1);
      // The default action targets the OWNING display's first screen.
      expect((kitchen.rules![0].action as { screenId: string }).screenId).toBe('k1');
      expect(displays.find((d) => d.id === 'main')!.rules ?? []).toHaveLength(0);
      expect(store.getState().config!.rules ?? []).toHaveLength(0);
    });
  });

  describe('removeRule', () => {
    it('removes a rule by ID, leaving others untouched', () => {
      const store = useEditorStore;
      const config = makeConfig({
        rules: [
          { id: 'r1', name: 'A', when: [], action: { kind: 'wake' } },
          { id: 'r2', name: 'B', when: [], action: { kind: 'wake' } },
        ],
      });
      store.setState({ config });

      store.getState().removeRule('r1');

      const rules = store.getState().config!.rules!;
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('r2');
    });

    it('removes from the selected display only in multi-display mode', () => {
      const store = useEditorStore;
      const makeRule = () => ({ id: 'r1', name: 'A', when: [], action: { kind: 'wake' as const } });
      const config = makeConfig({
        displays: [
          { id: 'main', name: 'Main', screens: [], rules: [makeRule()] },
          { id: 'kitchen', name: 'Kitchen', screens: [], rules: [makeRule()] },
        ],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().removeRule('r1');

      const displays = store.getState().config!.displays!;
      expect(displays.find((d) => d.id === 'kitchen')!.rules).toHaveLength(0);
      expect(displays.find((d) => d.id === 'main')!.rules).toHaveLength(1);
    });
  });

  describe('updateRule', () => {
    it('merges partial updates into the matching rule only', () => {
      const store = useEditorStore;
      const config = makeConfig({
        rules: [
          { id: 'r1', name: 'A', when: [], action: { kind: 'wake' } },
          { id: 'r2', name: 'B', when: [], action: { kind: 'wake' } },
        ],
      });
      store.setState({ config });

      store.getState().updateRule('r1', { name: 'Updated', cooldownSeconds: 120 });

      const rules = store.getState().config!.rules!;
      expect(rules[0]).toMatchObject({ id: 'r1', name: 'Updated', cooldownSeconds: 120 });
      expect(rules[1].name).toBe('B'); // untouched
    });
  });

  describe('reorderRules', () => {
    const threeRules = () => [
      { id: 'r1', name: 'A', when: [], action: { kind: 'wake' } as const },
      { id: 'r2', name: 'B', when: [], action: { kind: 'wake' } as const },
      { id: 'r3', name: 'C', when: [], action: { kind: 'wake' } as const },
    ];

    it('moves a rule from one index to another (priority is list order)', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig({ rules: threeRules() }), isDirty: false });

      store.getState().reorderRules(0, 2);

      const ids = store.getState().config!.rules!.map((r) => r.id);
      expect(ids).toEqual(['r2', 'r3', 'r1']);
      expect(store.getState().isDirty).toBe(true);
    });

    it('moves the last rule to the top', () => {
      const store = useEditorStore;
      store.setState({ config: makeConfig({ rules: threeRules() }) });

      store.getState().reorderRules(2, 0);

      expect(store.getState().config!.rules!.map((r) => r.id)).toEqual(['r3', 'r1', 'r2']);
    });

    it('is a no-op with fewer than two rules', () => {
      const store = useEditorStore;
      const rules = [{ id: 'only', name: 'Only', when: [], action: { kind: 'wake' } as const }];
      store.setState({ config: makeConfig({ rules }) });

      store.getState().reorderRules(0, 5);

      expect(store.getState().config!.rules!.map((r) => r.id)).toEqual(['only']);
    });

    it('reorders the selected display\'s rules in multi-display mode', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [
          { id: 'main', name: 'Main', screens: [], rules: threeRules() },
          { id: 'kitchen', name: 'Kitchen', screens: [], rules: threeRules() },
        ],
      });
      store.setState({ config, selectedDisplayId: 'kitchen' });

      store.getState().reorderRules(1, 0);

      const displays = store.getState().config!.displays!;
      expect(displays.find((d) => d.id === 'kitchen')!.rules!.map((r) => r.id)).toEqual(['r2', 'r1', 'r3']);
      expect(displays.find((d) => d.id === 'main')!.rules!.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    });
  });

  describe('copyRuleToDisplay', () => {
    const multiConfig = () => makeConfig({
      displays: [
        {
          id: 'main', name: 'Main',
          screens: [{ id: 'm1', name: 'M1', backgroundImage: '', modules: [] }],
          rules: [{
            id: 'src', name: 'Doorbell', enabled: false,
            when: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'on' }],
            action: { kind: 'showScreen', screenId: 'm1', mode: 'for', seconds: 30 },
          }],
        },
        {
          id: 'kitchen', name: 'Kitchen',
          screens: [{ id: 'k1', name: 'K1', backgroundImage: '', modules: [] }],
          rules: [],
        },
      ],
    });

    it('clones the rule onto the target with a fresh id, blanked screen, and enabled', () => {
      const store = useEditorStore;
      store.setState({ config: multiConfig(), selectedDisplayId: 'main', isDirty: false });

      store.getState().copyRuleToDisplay('src', 'kitchen');

      const displays = store.getState().config!.displays!;
      const kitchenRules = displays.find((d) => d.id === 'kitchen')!.rules!;
      expect(kitchenRules).toHaveLength(1);
      const copy = kitchenRules[0];
      expect(copy.id).not.toBe('src');
      expect(copy.name).toBe('Doorbell');
      expect(copy.enabled).toBeUndefined(); // lands enabled even though source was off
      expect(copy.when).toEqual([{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'on' }]);
      expect(copy.action).toEqual({ kind: 'showScreen', screenId: '', mode: 'for', seconds: 30 });
      // Source is untouched.
      expect(displays.find((d) => d.id === 'main')!.rules!.map((r) => r.id)).toEqual(['src']);
      expect(store.getState().isDirty).toBe(true);
    });

    it('deep-clones conditions so editing the copy does not mutate the source', () => {
      const store = useEditorStore;
      store.setState({ config: multiConfig(), selectedDisplayId: 'main' });
      store.getState().copyRuleToDisplay('src', 'kitchen');

      const displays = store.getState().config!.displays!;
      const copy = displays.find((d) => d.id === 'kitchen')!.rules![0];
      const source = displays.find((d) => d.id === 'main')!.rules![0];
      expect(copy.when).not.toBe(source.when);
      expect(copy.when[0]).not.toBe(source.when[0]);
    });

    it('keeps a non-showScreen action intact (only screenId is blanked)', () => {
      const store = useEditorStore;
      const config = multiConfig();
      config.displays![0].rules = [{ id: 'src', name: 'Sleep at night', when: [{ kind: 'time', startTime: '22:00', endTime: '06:00' }], action: { kind: 'sleep' } }];
      store.setState({ config, selectedDisplayId: 'main' });

      store.getState().copyRuleToDisplay('src', 'kitchen');

      const copy = store.getState().config!.displays!.find((d) => d.id === 'kitchen')!.rules![0];
      expect(copy.action).toEqual({ kind: 'sleep' });
      expect(copy.when).toEqual([{ kind: 'time', startTime: '22:00', endTime: '06:00' }]);
    });

    it('is a no-op for an unknown source rule or target display', () => {
      const store = useEditorStore;
      store.setState({ config: multiConfig(), selectedDisplayId: 'main', isDirty: false });

      store.getState().copyRuleToDisplay('nope', 'kitchen');
      store.getState().copyRuleToDisplay('src', 'nowhere');

      const displays = store.getState().config!.displays!;
      expect(displays.find((d) => d.id === 'kitchen')!.rules).toHaveLength(0);
      expect(store.getState().isDirty).toBe(false);
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

    it('auto-migrates legacy config.rules onto the seeded Main on first addDisplay', () => {
      // Rules follow the same seed path as screens/profiles: without this the
      // legacy config.rules would be stranded (getActiveRules reads
      // display.rules once displays exist) and stop firing on the hub kiosk.
      const store = useEditorStore;
      const config = makeConfig({
        screens: [{ id: 's1', name: 'A', backgroundImage: '', modules: [] }],
        rules: [
          { id: 'r1', name: 'Doorbell', when: [], action: { kind: 'showScreen', screenId: 's1', mode: 'for', seconds: 60 } },
        ],
      });
      store.setState({ config });

      store.getState().addDisplay({ id: 'kitchen', name: 'Kitchen' });

      const main = store.getState().config!.displays!.find((d) => d.id === 'main')!;
      expect(main.rules?.map((r) => r.id)).toEqual(['r1']);
      // The copied rule keeps targeting a valid (deep-cloned) screen id.
      expect((main.rules![0].action as { screenId: string }).screenId).toBe('s1');
      // New non-main displays never inherit rules.
      const kitchen = store.getState().config!.displays!.find((d) => d.id === 'kitchen')!;
      expect(kitchen.rules ?? []).toHaveLength(0);
    });

    it('rule migration is a deep clone (no back-leak from later edits)', () => {
      const store = useEditorStore;
      const config = makeConfig({
        screens: [{ id: 's1', name: 'A', backgroundImage: '', modules: [] }],
        rules: [{ id: 'r1', name: 'Doorbell', when: [], action: { kind: 'wake' } }],
      });
      store.setState({ config });

      store.getState().addDisplay({ id: 'kitchen', name: 'Kitchen' });

      store.setState({ selectedDisplayId: 'main' });
      store.getState().updateRule('r1', { name: 'Renamed' });

      // The stranded legacy pool keeps its original name; main owns its clone.
      expect(store.getState().config!.rules?.[0].name).toBe('Doorbell');
      const main = store.getState().config!.displays!.find((d) => d.id === 'main')!;
      expect(main.rules?.[0].name).toBe('Renamed');
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
      const existingScreen = { id: 's1', name: 'S1', backgroundImage: '', modules: [] };
      const config = makeConfig({
        displays: [{ id: 'kitchen', name: 'Old name', screens: [existingScreen] }],
      });
      store.setState({ config });

      store.getState().updateDisplay('kitchen', { name: 'Kitchen' });

      const display = store.getState().config!.displays![0];
      expect(display.name).toBe('Kitchen');
      expect(display.screens).toEqual([existingScreen]);
    });

    it('does not affect other displays', () => {
      const store = useEditorStore;
      const config = makeConfig({
        displays: [
          { id: 'kitchen', name: 'Kitchen', screens: [] },
          { id: 'bedroom', name: 'Bedroom', screens: [] },
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
        displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
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
          screens: [],
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
          screens: [],
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
          screens: [],
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
        displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
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
          { id: 'kitchen', name: 'Kitchen', screens: [] },
          { id: 'bedroom', name: 'Bedroom', screens: [] },
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
          { id: 'kitchen', name: 'Kitchen', screens: [] },
          { id: 'bedroom', name: 'Bedroom', screens: [] },
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
        displays: [{ id: 'kitchen', name: 'Kitchen', screens: [] }],
      });
      store.setState({ config });

      store.getState().removeDisplay('kitchen');

      expect(store.getState().config!.displays).toBeUndefined();
    });

    it('refuses to remove the "main" display', () => {
      // The hub Pi's main display is the source of the original
      // single-display layout (auto-created from `config.screens` on first
      // multi-display bootstrap). Removing it would orphan those screens
      // and reset the hub kiosk to an unadopted state — the store layer
      // hard-blocks the call so a stray UI button or test can't trigger it.
      const store = useEditorStore;
      const config = makeConfig({
        displays: [
          { id: 'main', name: 'Main', screens: [], displayWidth: 1080, displayHeight: 1920 },
          { id: 'kitchen', name: 'Kitchen', screens: [] },
        ],
      });
      store.setState({ config });

      store.getState().removeDisplay('main');

      const displays = store.getState().config!.displays!;
      expect(displays).toHaveLength(2);
      expect(displays.find((d) => d.id === 'main')).toBeDefined();
    });
  });

  describe('multi-display: getActiveDimensions reads from DisplayNode after main normalization', () => {
    // Main is no longer "special" — its dimensions live on the DisplayNode
    // just like every other display. The `getActiveDimensions` helper
    // already preferred the per-display field over globals, so this test
    // pins the post-normalization expectation: editing main's display node
    // directly changes the active canvas size, even when global settings
    // disagree.
    it('returns main display node dimensions, not global settings', async () => {
      const { getActiveDimensions } = await import('@/stores/editor-store');
      const config = makeConfig({
        settings: {
          ...makeConfig().settings,
          displayWidth: 1080,
          displayHeight: 1920,
          displayTransform: '90' as const,
        },
        displays: [
          {
            id: 'main',
            name: 'Main',
            screens: [],
            displayWidth: 2560,
            displayHeight: 1440,
            displayTransform: 'normal' as const,
          },
        ],
      });
      const dims = getActiveDimensions(config, 'main');
      expect(dims.width).toBe(2560);
      expect(dims.height).toBe(1440);
    });

    it('does not let an inherited global transform flip a display\'s own dimensions', async () => {
      const { getActiveDimensions } = await import('@/stores/editor-store');
      // Mirrors filterConfigForDisplay: the global '90' rotates the hub's
      // own panel; a display with its own landscape dimensions and no
      // declared rotation keeps them as typed, so the editor canvas agrees
      // with what the display actually renders.
      const config = makeConfig({
        settings: {
          ...makeConfig().settings,
          displayTransform: '90' as const,
        },
        displays: [
          {
            id: 'shelf',
            name: 'Shelf',
            screens: [],
            displayWidth: 1366,
            displayHeight: 768,
          },
        ],
      });
      const dims = getActiveDimensions(config, 'shelf');
      expect(dims.width).toBe(1366);
      expect(dims.height).toBe(768);
    });
  });

  /* ─── cascade prune of display references ─────── */

  describe('removeProfile prunes display references', () => {
    it('clears matching per-display activeProfile when a shared-pool profile is removed', () => {
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
            screens: [],
            activeProfile: 'day',
          },
          {
            id: 'bedroom',
            name: 'Bedroom',
            screens: [],
            activeProfile: 'night',
          },
        ],
      });
      store.setState({ config });

      store.getState().removeProfile('day');

      const displays = store.getState().config!.displays!;
      // activeProfile was 'day' on kitchen — should now be undefined
      expect(displays[0].activeProfile).toBeUndefined();
      // bedroom had 'night' — should be untouched
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

    it('concurrent save call awaits the coalesced re-save (not just early-returns)', async () => {
      const store = setupStoreWithConfig();

      // Queue two resolvers so we can complete both saves independently.
      const fetchResolvers: Array<() => void> = [];
      fetchMock.mockImplementation(
        () =>
          new Promise<{ ok: boolean; status: number }>((resolve) => {
            fetchResolvers.push(() => resolve({ ok: true, status: 200 }));
          }),
      );

      // Start first save
      const firstSave = store.getState().saveConfig();
      expect(store.getState().isSaving).toBe(true);

      // Attempt a second save while the first is in flight. The contract
      // (relied on by every modal that closes after `await saveConfig()`):
      // the returned promise must resolve only AFTER the run that includes
      // this caller's mutation actually completes — not immediately.
      let secondSettled = false;
      const secondSave = store.getState().saveConfig().then(() => { secondSettled = true; });

      // Still only the first fetch is in flight at this point.
      expect(fetchMock).toHaveBeenCalledOnce();

      // Drain microtasks to confirm secondSave has NOT settled yet — its
      // promise is wired to the queued re-save, which can't run until the
      // first save completes.
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(secondSettled).toBe(false);

      // Resolve the first save — this unblocks its `finally`, which queues
      // a microtask that fires the coalesced re-save.
      fetchResolvers[0]();
      await firstSave;

      // Drain microtasks until the recursive saveConfig has scheduled its
      // own fetch. With proper queue draining the second fetch is observable.
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(store.getState().isSaving).toBe(true);

      // secondSave still hasn't resolved — its mutation is in flight now.
      expect(secondSettled).toBe(false);

      // Resolve the re-save and wait for everything to settle.
      fetchResolvers[1]();
      await secondSave;

      expect(secondSettled).toBe(true);
      expect(store.getState().isSaving).toBe(false);
    });

    it('coalesced re-save sends the latest in-memory config, not a stale snapshot', async () => {
      const store = setupStoreWithConfig();

      const fetchResolvers: Array<() => void> = [];
      const sentBodies: string[] = [];
      fetchMock.mockImplementation((_url: string, init: { body: string }) => {
        sentBodies.push(init.body);
        return new Promise<{ ok: boolean; status: number }>((resolve) => {
          fetchResolvers.push(() => resolve({ ok: true, status: 200 }));
        });
      });

      const firstSave = store.getState().saveConfig();

      // Mutate the config WHILE the first save is in flight and the
      // mutation must be visible in the re-save's PUT body — that's the
      // entire point of the coalescing mechanism.
      store.getState().updateSettings({ rotationIntervalMs: 12345 });

      const secondSave = store.getState().saveConfig();

      fetchResolvers[0]();
      await firstSave;
      // Drain queued microtasks to let the re-save dispatch its fetch.
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      fetchResolvers[1]();
      await secondSave;

      expect(sentBodies).toHaveLength(2);
      // First PUT used the snapshot from before the mutation.
      const firstBody = JSON.parse(sentBodies[0]);
      expect(firstBody.settings.rotationIntervalMs).toBe(30000);
      // Second PUT must contain the post-mutation value.
      const secondBody = JSON.parse(sentBodies[1]);
      expect(secondBody.settings.rotationIntervalMs).toBe(12345);
    });

    it('multiple coalesced callers all share a single re-save and resolve together', async () => {
      const store = setupStoreWithConfig();

      const fetchResolvers: Array<() => void> = [];
      fetchMock.mockImplementation(
        () =>
          new Promise<{ ok: boolean; status: number }>((resolve) => {
            fetchResolvers.push(() => resolve({ ok: true, status: 200 }));
          }),
      );

      const firstSave = store.getState().saveConfig();
      // Three concurrent callers all coalesce onto the same deferred.
      const settled = [false, false, false];
      const callers = [
        store.getState().saveConfig().then(() => { settled[0] = true; }),
        store.getState().saveConfig().then(() => { settled[1] = true; }),
        store.getState().saveConfig().then(() => { settled[2] = true; }),
      ];

      // Only the first fetch fires while everything is queued.
      expect(fetchMock).toHaveBeenCalledOnce();

      fetchResolvers[0]();
      await firstSave;
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      await new Promise<void>((resolve) => queueMicrotask(resolve));

      // The three coalesced callers fire exactly ONE re-save, not three.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // None have settled yet — they're all chained to the re-save.
      expect(settled).toEqual([false, false, false]);

      fetchResolvers[1]();
      await Promise.all(callers);

      // All three resolve together once the re-save lands.
      expect(settled).toEqual([true, true, true]);
    });

    it('coalesced re-save still fires when the in-flight save fails', async () => {
      const store = setupStoreWithConfig();

      const fetchResolvers: Array<(ok: boolean) => void> = [];
      fetchMock.mockImplementation(
        () =>
          new Promise<{ ok: boolean; status: number }>((resolve) => {
            fetchResolvers.push((ok) => resolve({ ok, status: ok ? 200 : 500 }));
          }),
      );

      const firstSave = store.getState().saveConfig();
      const secondSave = store.getState().saveConfig();

      // First save fails — it should still trigger the coalesced re-save
      // through the `finally` block, and the second caller's promise must
      // be settled by the re-save's outcome (not the first save's error).
      fetchResolvers[0](false);
      await expect(firstSave).rejects.toThrow('Save failed: 500');

      await new Promise<void>((resolve) => queueMicrotask(resolve));
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Re-save succeeds — second caller resolves cleanly.
      fetchResolvers[1](true);
      await expect(secondSave).resolves.toBeUndefined();
      expect(store.getState().isSaving).toBe(false);
    });

    it('coalesced re-save propagates its own error to the queued caller', async () => {
      const store = setupStoreWithConfig();

      const fetchResolvers: Array<(ok: boolean) => void> = [];
      fetchMock.mockImplementation(
        () =>
          new Promise<{ ok: boolean; status: number }>((resolve) => {
            fetchResolvers.push((ok) => resolve({ ok, status: ok ? 200 : 503 }));
          }),
      );

      const firstSave = store.getState().saveConfig();
      const secondSave = store.getState().saveConfig();

      // First save succeeds, re-save fails — the queued caller gets the
      // re-save's failure (its mutation didn't land).
      fetchResolvers[0](true);
      await firstSave;

      await new Promise<void>((resolve) => queueMicrotask(resolve));
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      fetchResolvers[1](false);

      await expect(secondSave).rejects.toThrow('Save failed: 503');
      expect(store.getState().isSaving).toBe(false);
      expect(store.getState().saveError).toBe('Failed to save');
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

    it('surfaces the server validator message from a 400 body in saveError', async () => {
      const store = setupStoreWithConfig();
      const detail = 'config screen "s1" module "m1": visibility sourceKey must match';
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: detail }),
      });

      await expect(store.getState().saveConfig()).rejects.toThrow(detail);
      expect(store.getState().saveError).toBe(detail);
      expect(store.getState().isDirty).toBe(true);
    });

    it('falls back to the generic message when the error body is not JSON', async () => {
      const store = setupStoreWithConfig();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => { throw new SyntaxError('not json'); },
      });

      await expect(store.getState().saveConfig()).rejects.toThrow('Save failed: 500');
      expect(store.getState().saveError).toBe('Failed to save');
    });

    it('client pre-validation skips the network call for an invalid config', async () => {
      // Auto-save fires 800ms after every edit; a transiently invalid state
      // (empty visibility sourceKey mid-edit) must not PUT a guaranteed 400.
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules.push({
        id: 'mod-1',
        type: 'clock',
        position: { x: 0, y: 0 },
        size: { w: 100, h: 100 },
        zIndex: 0,
        config: {},
        style: {} as ScreenConfiguration['screens'][0]['modules'][0]['style'],
        visibility: { conditions: [{ kind: 'state', sourceKey: 'Bad Key!', equals: '' }] },
      });
      store.setState({ config, isDirty: true, isSaving: false, saveError: null });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetchOk();

      await expect(store.getState().saveConfig()).rejects.toThrow(/sourceKey must match/);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(store.getState().saveError).toMatch(/module "mod-1".*sourceKey/);
      expect(store.getState().isDirty).toBe(true);
      // Expected editing state → warn, not console.error (dev overlay noise)
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('save succeeds again once the invalid condition is fixed', async () => {
      const store = useEditorStore;
      const config = makeConfig();
      config.screens[0].modules.push({
        id: 'mod-1',
        type: 'clock',
        position: { x: 0, y: 0 },
        size: { w: 100, h: 100 },
        zIndex: 0,
        config: {},
        style: {} as ScreenConfiguration['screens'][0]['modules'][0]['style'],
        visibility: { conditions: [{ kind: 'state', sourceKey: 'Bad Key!', equals: '' }] },
      });
      store.setState({ config, isDirty: true, isSaving: false, saveError: null });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetchOk();

      await expect(store.getState().saveConfig()).rejects.toThrow();

      store.getState().updateModule('screen-1', 'mod-1', {
        visibility: { conditions: [{ kind: 'state', sourceKey: 'plugin:ha:door', equals: 'open' }] },
      });
      await store.getState().saveConfig();

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(store.getState().saveError).toBeNull();
      vi.restoreAllMocks();
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

    it('in-flight save uses its own snapshot, then coalesced re-save persists later mutations', async () => {
      const store = setupStoreWithConfig();

      // Two-resolver queue so we can complete both saves independently and
      // capture each PUT body to assert which snapshot landed when.
      const fetchResolvers: Array<() => void> = [];
      const sentBodies: string[] = [];
      fetchMock.mockImplementation((_url: string, init: { body: string }) => {
        sentBodies.push(init.body);
        return new Promise<{ ok: boolean; status: number }>((resolve) => {
          fetchResolvers.push(() => resolve({ ok: true, status: 200 }));
        });
      });

      // Start first save — captures snapshot of config
      const firstSave = store.getState().saveConfig();

      // Mutate config multiple times while save is in flight
      store.getState().updateSettings({ rotationIntervalMs: 11111 });
      store.getState().updateSettings({ rotationIntervalMs: 22222 });

      // Attempt another save — coalesced into a re-save that will pick up
      // the LATEST state (22222), not the snapshot (30000) the first save is
      // writing. Awaiting this should block until the re-save lands.
      const coalescedSave = store.getState().saveConfig();

      // Complete first save → its `finally` queues the re-save microtask.
      fetchResolvers[0]();
      await firstSave;
      // Drain the microtask + the recursive saveConfig's first await.
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      // Re-save's fetch is now in flight — resolve it.
      fetchResolvers[1]();
      await coalescedSave;

      // First PUT used the stale snapshot (couldn't be clobbered by later
      // mutations), the re-save persisted the latest state.
      expect(sentBodies).toHaveLength(2);
      const firstBody = JSON.parse(sentBodies[0]);
      const secondBody = JSON.parse(sentBodies[1]);
      expect(firstBody.settings.rotationIntervalMs).toBe(30000);
      expect(secondBody.settings.rotationIntervalMs).toBe(22222);

      // Config still holds the latest in-memory state, and isDirty is now
      // false because the re-save actually persisted it — under the old
      // boolean-flag implementation this would have stayed dirty until an
      // unrelated trigger re-fired a save.
      expect(store.getState().config!.settings.rotationIntervalMs).toBe(22222);
      expect(store.getState().isDirty).toBe(false);
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
        rules: [
          { id: 'r1', name: 'Doorbell', when: [], action: { kind: 'showScreen', screenId: 's1', mode: 'for', seconds: 60 } },
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
      // Rules inherit on the explicit-main path too (buildNewDisplay).
      expect(displays[0].rules?.map((r) => r.id)).toEqual(['r1']);
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

  describe('importLayoutAction replace mode blanks dangling rule targets', () => {
    it('blanks a showScreen rule pointing at a replaced screen so the config stays saveable', async () => {
      const { validateAllSchedules } = await import('@/lib/display-filter');
      const store = useEditorStore;
      const config = makeConfig({
        screens: [{ id: 'screen-1', name: 'Screen 1', backgroundImage: '', modules: [] }],
        rules: [
          {
            id: 'r1',
            name: 'Doorbell',
            when: [{ kind: 'state', sourceKey: 'plugin:ha:binary_sensor.doorbell', equals: 'on' }],
            action: { kind: 'showScreen', screenId: 'screen-1', mode: 'for', seconds: 60 },
          },
        ],
      });
      store.setState({ config, selectedDisplayId: null, selectedScreenId: 'screen-1' });

      const layoutJson = {
        _type: 'home-screens-layout' as const,
        _version: 1 as const,
        metadata: {
          name: 'test', description: '', exportedAt: new Date().toISOString(),
          configVersion: 1, sourceDisplay: { width: 1080, height: 1920 },
          screenCount: 1, moduleCount: 0,
        },
        visual: { rotationIntervalMs: 30000 },
        screens: [{ id: 'imported-1', name: 'Imported', backgroundImage: '', modules: [] }],
      };

      store.getState().importLayoutAction(layoutJson, { mode: 'replace' });

      const next = store.getState().config!;
      // The old screen is gone (replace swapped the whole list)...
      expect(next.screens.some((s) => s.id === 'screen-1')).toBe(false);
      // ...so the rule target that pointed at it is blanked, not left dangling.
      expect(next.rules?.[0].action).toMatchObject({ kind: 'showScreen', screenId: '' });
      // And the resulting config passes the write-gate validator.
      expect(validateAllSchedules(next)).toBeNull();
    });
  });

  describe('multi-display: layout export/import routes profiles through the display-owned list', () => {
    function makeMultiDisplayConfig(): ScreenConfiguration {
      const config = makeConfig({
        screens: [],
        // Root pool profile references a screen that does NOT belong to the
        // kitchen display — it must never leak into a kitchen export.
        profiles: [{ id: 'root-p', name: 'Root Pool', screenIds: ['legacy-1'] }],
        displays: [
          {
            id: 'kitchen',
            name: 'Kitchen',
            screens: [{ id: 'k1', name: 'K1', backgroundImage: '', modules: [] }],
            profiles: [{ id: 'kp', name: 'Kitchen Day', screenIds: ['k1'] }],
          },
        ],
      });
      config.settings.activeProfile = 'root-p';
      return config;
    }

    function makeLayoutWithProfile() {
      return {
        _type: 'home-screens-layout' as const,
        _version: 1 as const,
        metadata: {
          name: 'test',
          exportedAt: new Date().toISOString(),
          configVersion: 1,
          sourceDisplay: { width: 1080, height: 1920 },
          screenCount: 1,
          moduleCount: 0,
        },
        visual: { rotationIntervalMs: 30000 },
        screens: [{ id: 'imported-1', name: 'Imported', backgroundImage: '', modules: [] }],
        profiles: [{ id: 'imp-p', name: 'Evening', screenIds: ['imported-1'] }],
      };
    }

    it('exportLayout ships the display-owned profiles, not the root pool', async () => {
      // Regression: exportLayout fed the root config.profiles pool to
      // createLayoutExport, whose screen-overlap filter dropped every
      // profile (the pool can't reference a display's owned screen IDs),
      // so per-display exports arrived profile-less.
      const store = useEditorStore;
      store.setState({
        config: makeMultiDisplayConfig(),
        selectedDisplayId: 'kitchen',
        selectedScreenId: 'k1',
      });

      let capturedBlob: Blob | null = null;
      const g = globalThis as Record<string, unknown>;
      const origDocument = g.document;
      const origCreate = URL.createObjectURL;
      const origRevoke = URL.revokeObjectURL;
      URL.createObjectURL = ((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:test';
      }) as typeof URL.createObjectURL;
      URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
      // downloadBlob attaches the anchor to document.body before clicking
      // (Safari ignores clicks on detached anchors), so the stub needs one.
      g.document = {
        createElement: () => ({ click: () => {}, remove: () => {} }),
        body: { appendChild: () => {} },
      };
      try {
        store.getState().exportLayout({ name: 'Kitchen' });
      } finally {
        g.document = origDocument;
        URL.createObjectURL = origCreate;
        URL.revokeObjectURL = origRevoke;
      }

      expect(capturedBlob).not.toBeNull();
      const layout = JSON.parse(await capturedBlob!.text());
      expect(layout.profiles?.map((p: { name: string }) => p.name)).toEqual(['Kitchen Day']);
      expect(layout.profiles[0].screenIds).toEqual(['k1']);
    });

    it('importLayoutAction lands imported profiles on the selected display, not the root pool', () => {
      // Regression: imported profiles were written to config.profiles, but
      // getDisplayProfiles prefers the display's owned list — the import
      // saved dead config nothing reads and the profiles "vanished".
      const store = useEditorStore;
      store.setState({
        config: makeMultiDisplayConfig(),
        selectedDisplayId: 'kitchen',
        selectedScreenId: 'k1',
      });

      store.getState().importLayoutAction(makeLayoutWithProfile(), { mode: 'add' });

      const state = store.getState();
      const kitchen = state.config!.displays!.find((d) => d.id === 'kitchen')!;
      // Add-mode merged against the OWNED list, and the imported profile's
      // screenIds were remapped to the freshly-minted screen UUID.
      expect(kitchen.profiles?.map((p) => p.name)).toEqual(['Kitchen Day', 'Evening']);
      const imported = kitchen.profiles!.find((p) => p.name === 'Evening')!;
      const newScreen = kitchen.screens.find((s) => s.id !== 'k1')!;
      expect(imported.screenIds).toEqual([newScreen.id]);
      // Root pool and global activeProfile are untouched.
      expect(state.config!.profiles?.map((p) => p.id)).toEqual(['root-p']);
      expect(state.config!.settings.activeProfile).toBe('root-p');
    });

    it('replace-mode import clears a display activeProfile that no longer exists', () => {
      const store = useEditorStore;
      const config = makeMultiDisplayConfig();
      config.displays![0].activeProfile = 'kp';
      store.setState({ config, selectedDisplayId: 'kitchen', selectedScreenId: 'k1' });

      store.getState().importLayoutAction(makeLayoutWithProfile(), { mode: 'replace' });

      const state = store.getState();
      const kitchen = state.config!.displays!.find((d) => d.id === 'kitchen')!;
      // Old owned profiles are gone (replace assigns fresh IDs), so the
      // stale activeProfile pointer must be cleared for the save validator.
      expect(kitchen.profiles?.map((p) => p.name)).toEqual(['Evening']);
      expect(kitchen.activeProfile).toBeUndefined();
      // importLayoutCore's replace-mode activeProfile clear belongs to the
      // display; the global setting survives.
      expect(state.config!.settings.activeProfile).toBe('root-p');
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

  /* ─── Per-display profile routing ────── */

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
