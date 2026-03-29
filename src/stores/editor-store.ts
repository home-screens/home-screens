import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  ScreenConfiguration,
  ModuleType,
  ModuleInstance,
  ModuleStyle,
  ModulePosition,
  ModuleSize,
  GlobalSettings,
  Screen,
  Profile,
} from '@/types/config';
import { DEFAULT_MODULE_STYLE as defaultStyle } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import { editorFetch } from '@/lib/editor-fetch';
import type { LayoutExport } from '@/types/layout-export';
import {
  createLayoutExport,
  importLayout as importLayoutCore,
} from '@/lib/layout-export';
import { scaleModulesToFit } from '@/lib/module-utils';

interface HistoryEntry {
  config: ScreenConfiguration;
  selectedScreenId: string | null;
  selectedModuleId: string | null;
}

const MAX_HISTORY = 50;
const COALESCE_WINDOW_MS = 500;

interface EditorState {
  config: ScreenConfiguration | null;
  selectedScreenId: string | null;
  selectedModuleId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  snapEnabled: boolean;
  _past: HistoryEntry[];
  _future: HistoryEntry[];
  _lastHistoryTime: number;
  _lastHistoryActionKey: string;

  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  selectScreen: (id: string) => void;
  selectModule: (id: string | null) => void;
  addModule: (screenId: string, type: ModuleType, position?: ModulePosition) => void;
  removeModule: (screenId: string, moduleId: string) => void;
  updateModule: (screenId: string, moduleId: string, updates: Partial<ModuleInstance>) => void;
  updateModuleStyle: (screenId: string, moduleId: string, style: Partial<ModuleStyle>) => void;
  moveModule: (screenId: string, moduleId: string, position: ModulePosition) => void;
  resizeModule: (screenId: string, moduleId: string, size: ModuleSize) => void;
  addScreen: () => void;
  removeScreen: (id: string) => void;
  reorderScreens: (fromIndex: number, toIndex: number) => void;
  updateScreen: (id: string, updates: Partial<Screen>) => void;
  updateSettings: (settings: Partial<GlobalSettings>) => void;
  addProfile: (name: string) => void;
  removeProfile: (id: string) => void;
  updateProfile: (id: string, updates: Partial<Profile>) => void;
  reorderProfiles: (fromIndex: number, toIndex: number) => void;
  setActiveProfile: (id: string | undefined) => void;
  exportConfig: () => void;
  importConfig: (json: string) => void;
  exportLayout: (options?: { screenIds?: string[]; name?: string; description?: string }) => void;
  importLayoutAction: (layout: LayoutExport, options: { mode: 'add' | 'replace'; applyVisual?: boolean }) => void;
  scaleAllModules: (oldWidth: number, oldHeight: number, newWidth: number, newHeight: number) => void;
  toggleSnap: () => void;
  undo: () => void;
  redo: () => void;
}

function updateModuleInConfig(
  config: ScreenConfiguration,
  screenId: string,
  moduleId: string,
  updater: (mod: ModuleInstance) => ModuleInstance,
): ScreenConfiguration {
  return {
    ...config,
    screens: config.screens.map((s) =>
      s.id === screenId
        ? { ...s, modules: s.modules.map((m) => (m.id === moduleId ? updater(m) : m)) }
        : s,
    ),
  };
}

export const useEditorStore = create<EditorState>((set, get) => {
  const mutateConfig = (
    fn: (config: ScreenConfiguration) => Partial<EditorState>,
    options?: { coalesce?: string },
  ) => {
    const state = get();
    const { config } = state;
    if (!config) return;

    const now = Date.now();
    const actionKey = options?.coalesce ?? '';

    let newPast: HistoryEntry[];
    if (actionKey && actionKey === state._lastHistoryActionKey && state._past.length > 0 && (now - state._lastHistoryTime) < COALESCE_WINDOW_MS) {
      newPast = state._past;
    } else {
      newPast = [...state._past, {
        config: structuredClone(config),
        selectedScreenId: state.selectedScreenId,
        selectedModuleId: state.selectedModuleId,
      }];
      if (newPast.length > MAX_HISTORY) newPast = newPast.slice(newPast.length - MAX_HISTORY);
    }

    set({
      isDirty: true, saveError: null,
      _past: newPast, _future: [], _lastHistoryTime: now, _lastHistoryActionKey: actionKey,
      ...fn(config),
    });
  };

  return {
  config: null,
  selectedScreenId: null,
  selectedModuleId: null,
  isDirty: false,
  isSaving: false,
  saveError: null,
  snapEnabled: true,
  _past: [],
  _future: [],
  _lastHistoryTime: 0,
  _lastHistoryActionKey: '',

  loadConfig: async () => {
    try {
      const res = await editorFetch('/api/config');
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      const config: ScreenConfiguration = await res.json();
      if (!config.screens) throw new Error('Invalid config');
      // Restore selected screen from URL if present, otherwise default to first
      const params = new URLSearchParams(window.location.search);
      const screenParam = params.get('screen');
      const restoredScreen = screenParam && config.screens.find((s) => s.id === screenParam);
      set({
        config,
        selectedScreenId: restoredScreen ? restoredScreen.id : config.screens[0]?.id ?? null,
        selectedModuleId: null,
        isDirty: false,
        _past: [],
        _future: [],
        _lastHistoryTime: 0,
        _lastHistoryActionKey: '',
      });
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  },

  saveConfig: async () => {
    const { config, isSaving } = get();
    if (!config || isSaving) return;
    const configSnapshot = config;
    set({ isSaving: true, saveError: null });
    try {
      const res = await editorFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configSnapshot),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      // Only clear dirty if no new changes occurred during save
      const { config: current } = get();
      set({ isSaving: false, isDirty: current !== configSnapshot, saveError: null });
    } catch (err) {
      set({ isSaving: false, saveError: 'Failed to save' });
      console.error('Failed to save config:', err);
      throw err;
    }
  },

  selectScreen: (id) => {
    set({ selectedScreenId: id, selectedModuleId: null });
    const url = new URL(window.location.href);
    url.searchParams.set('screen', id);
    window.history.replaceState(null, '', url.toString());
  },

  selectModule: (id) => set({ selectedModuleId: id }),

  addModule: (screenId, type, position) => {
    const def = getModuleDefinition(type);
    if (!def) return;
    const cfg = get().config;
    const fillsCanvas = def.fillsCanvas && cfg;
    const newModule: ModuleInstance = {
      id: uuidv4(),
      type,
      position: fillsCanvas ? { x: 0, y: 0 } : (position ?? { x: 100, y: 100 }),
      size: fillsCanvas
        ? { w: cfg.settings.displayWidth || DEFAULT_DISPLAY_WIDTH, h: cfg.settings.displayHeight || DEFAULT_DISPLAY_HEIGHT }
        : { ...def.defaultSize },
      zIndex: 1,
      config: { ...def.defaultConfig },
      style: { ...defaultStyle, ...def.defaultStyle },
    };
    mutateConfig((config) => ({
      config: {
        ...config,
        screens: config.screens.map((s) =>
          s.id === screenId ? { ...s, modules: [...s.modules, newModule] } : s,
        ),
      },
      selectedModuleId: newModule.id,
    }));
  },

  removeModule: (screenId, moduleId) => {
    const { selectedModuleId } = get();
    mutateConfig((config) => ({
      config: {
        ...config,
        screens: config.screens.map((s) =>
          s.id === screenId ? { ...s, modules: s.modules.filter((m) => m.id !== moduleId) } : s,
        ),
      },
      selectedModuleId: selectedModuleId === moduleId ? null : selectedModuleId,
    }));
  },

  updateModule: (screenId, moduleId, updates) => {
    mutateConfig((config) => ({
      config: updateModuleInConfig(config, screenId, moduleId, (m) => ({ ...m, ...updates })),
    }), { coalesce: `updateModule:${moduleId}` });
  },

  updateModuleStyle: (screenId, moduleId, style) => {
    mutateConfig((config) => ({
      config: updateModuleInConfig(config, screenId, moduleId, (m) => ({
        ...m,
        style: { ...m.style, ...style },
      })),
    }), { coalesce: `style:${moduleId}` });
  },

  moveModule: (screenId, moduleId, position) => {
    mutateConfig((config) => ({
      config: updateModuleInConfig(config, screenId, moduleId, (m) => ({ ...m, position })),
    }), { coalesce: `move:${moduleId}` });
  },

  resizeModule: (screenId, moduleId, size) => {
    mutateConfig((config) => ({
      config: updateModuleInConfig(config, screenId, moduleId, (m) => ({ ...m, size })),
    }), { coalesce: `resize:${moduleId}` });
  },

  addScreen: () => {
    const newScreen: Screen = {
      id: uuidv4(),
      name: `Screen ${(get().config?.screens.length ?? 0) + 1}`,
      backgroundImage: '',
      modules: [],
    };
    mutateConfig((config) => ({
      config: { ...config, screens: [...config.screens, newScreen] },
      selectedScreenId: newScreen.id,
      selectedModuleId: null,
    }));
    const url = new URL(window.location.href);
    url.searchParams.set('screen', newScreen.id);
    window.history.replaceState(null, '', url.toString());
  },

  removeScreen: (id) => {
    const { config, selectedScreenId } = get();
    if (!config || config.screens.length <= 1) return;
    const screens = config.screens.filter((s) => s.id !== id);
    const profiles = config.profiles?.map((p) => ({
      ...p,
      screenIds: p.screenIds.filter((sid) => sid !== id),
    }));
    const newSelectedId = selectedScreenId === id ? screens[0]?.id ?? null : selectedScreenId;
    mutateConfig(() => ({
      config: { ...config, screens, profiles },
      selectedScreenId: newSelectedId,
      selectedModuleId: null,
    }));
    if (newSelectedId) {
      const url = new URL(window.location.href);
      url.searchParams.set('screen', newSelectedId);
      window.history.replaceState(null, '', url.toString());
    }
  },

  reorderScreens: (fromIndex: number, toIndex: number) => {
    mutateConfig((config) => {
      const screens = [...config.screens];
      const [moved] = screens.splice(fromIndex, 1);
      screens.splice(toIndex, 0, moved);
      return { config: { ...config, screens } };
    });
  },

  updateScreen: (id, updates) => {
    mutateConfig((config) => ({
      config: {
        ...config,
        screens: config.screens.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      },
    }), { coalesce: `screen:${id}` });
  },

  updateSettings: (settings) => {
    mutateConfig((config) => ({
      config: { ...config, settings: { ...config.settings, ...settings } },
    }), { coalesce: 'settings' });
  },

  addProfile: (name: string) => {
    mutateConfig((config) => {
      const newProfile: Profile = {
        id: uuidv4(),
        name,
        screenIds: config.screens.map((s) => s.id),
      };
      return {
        config: { ...config, profiles: [...(config.profiles ?? []), newProfile] },
      };
    });
  },

  removeProfile: (id: string) => {
    mutateConfig((config) => {
      const profiles = (config.profiles ?? []).filter((p) => p.id !== id);
      const settings = config.settings.activeProfile === id
        ? { ...config.settings, activeProfile: undefined }
        : config.settings;
      return { config: { ...config, profiles, settings } };
    });
  },

  updateProfile: (id: string, updates: Partial<Profile>) => {
    mutateConfig((config) => ({
      config: {
        ...config,
        profiles: (config.profiles ?? []).map((p) =>
          p.id === id ? { ...p, ...updates } : p,
        ),
      },
    }), { coalesce: `profile:${id}` });
  },

  reorderProfiles: (fromIndex: number, toIndex: number) => {
    const { config } = get();
    if (!config?.profiles) return;
    const profiles = [...config.profiles];
    const [moved] = profiles.splice(fromIndex, 1);
    profiles.splice(toIndex, 0, moved);
    mutateConfig(() => ({ config: { ...config, profiles } }), { coalesce: 'reorderProfiles' });
  },

  setActiveProfile: (id: string | undefined) => {
    mutateConfig((config) => ({
      config: { ...config, settings: { ...config.settings, activeProfile: id } },
    }), { coalesce: 'activeProfile' });
  },

  exportConfig: () => {
    const { config } = get();
    if (!config) return;
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'home-screen-config.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  importConfig: (json: string) => {
    const parsed = JSON.parse(json) as ScreenConfiguration;
    if (!parsed.screens || !Array.isArray(parsed.screens) || !parsed.settings) {
      throw new Error('Invalid config file: missing screens or settings');
    }
    const state = get();
    let newPast = state._past;
    if (state.config) {
      const snapshot: HistoryEntry = {
        config: structuredClone(state.config),
        selectedScreenId: state.selectedScreenId,
        selectedModuleId: state.selectedModuleId,
      };
      newPast = [...state._past, snapshot];
      if (newPast.length > MAX_HISTORY) newPast = newPast.slice(newPast.length - MAX_HISTORY);
    }
    const firstId = parsed.screens[0]?.id ?? null;
    set({
      config: parsed,
      selectedScreenId: firstId,
      selectedModuleId: null,
      isDirty: true, saveError: null,
      _past: newPast, _future: [], _lastHistoryTime: 0, _lastHistoryActionKey: '',
    });
    if (firstId) {
      const url = new URL(window.location.href);
      url.searchParams.set('screen', firstId);
      window.history.replaceState(null, '', url.toString());
    }
  },

  exportLayout: (options = {}) => {
    const { config } = get();
    if (!config) return;
    const layout = createLayoutExport(config, options);
    const slug = (options.name ?? 'my-layout')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `home-screens-${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importLayoutAction: (layout, options) => {
    let firstNewId: string | null = null;
    mutateConfig((config) => {
      const updated = importLayoutCore(layout, config, options);
      const existingIds = new Set(config.screens.map((s) => s.id));
      firstNewId = updated.screens.find((s) => !existingIds.has(s.id))?.id
        ?? updated.screens[0]?.id ?? null;
      return {
        config: updated,
        selectedScreenId: firstNewId,
        selectedModuleId: null,
      };
    });
    if (firstNewId) {
      const url = new URL(window.location.href);
      url.searchParams.set('screen', firstNewId);
      window.history.replaceState(null, '', url.toString());
    }
  },

  scaleAllModules: (oldWidth, oldHeight, newWidth, newHeight) => {
    mutateConfig((config) => ({
      config: {
        ...config,
        screens: scaleModulesToFit(config.screens, oldWidth, oldHeight, newWidth, newHeight),
      },
    }));
  },

  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  undo: () => {
    const state = get();
    if (state._past.length === 0 || !state.config) return;

    const newPast = state._past.slice(0, -1);
    const entry = state._past[state._past.length - 1];

    const currentSnapshot: HistoryEntry = {
      config: structuredClone(state.config),
      selectedScreenId: state.selectedScreenId,
      selectedModuleId: state.selectedModuleId,
    };

    const newFuture = [...state._future, currentSnapshot];
    set({
      config: entry.config,
      selectedScreenId: entry.selectedScreenId,
      selectedModuleId: entry.selectedModuleId,
      isDirty: true,
      saveError: null,
      _past: newPast,
      _future: newFuture.length > MAX_HISTORY ? newFuture.slice(newFuture.length - MAX_HISTORY) : newFuture,
      _lastHistoryTime: 0,
      _lastHistoryActionKey: '',
    });

    if (entry.selectedScreenId !== state.selectedScreenId) {
      const url = new URL(window.location.href);
      if (entry.selectedScreenId) {
        url.searchParams.set('screen', entry.selectedScreenId);
      } else {
        url.searchParams.delete('screen');
      }
      window.history.replaceState(null, '', url.toString());
    }
  },

  redo: () => {
    const state = get();
    if (state._future.length === 0 || !state.config) return;

    const newFuture = state._future.slice(0, -1);
    const entry = state._future[state._future.length - 1];

    const currentSnapshot: HistoryEntry = {
      config: structuredClone(state.config),
      selectedScreenId: state.selectedScreenId,
      selectedModuleId: state.selectedModuleId,
    };

    const newPast = [...state._past, currentSnapshot];
    set({
      config: entry.config,
      selectedScreenId: entry.selectedScreenId,
      selectedModuleId: entry.selectedModuleId,
      isDirty: true,
      saveError: null,
      _past: newPast.length > MAX_HISTORY ? newPast.slice(newPast.length - MAX_HISTORY) : newPast,
      _future: newFuture,
      _lastHistoryTime: 0,
      _lastHistoryActionKey: '',
    });

    if (entry.selectedScreenId !== state.selectedScreenId) {
      const url = new URL(window.location.href);
      if (entry.selectedScreenId) {
        url.searchParams.set('screen', entry.selectedScreenId);
      } else {
        url.searchParams.delete('screen');
      }
      window.history.replaceState(null, '', url.toString());
    }
  },
}});
