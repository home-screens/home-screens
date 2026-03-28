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
});
