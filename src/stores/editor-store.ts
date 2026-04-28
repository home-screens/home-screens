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
  DisplayNode,
  DisplayNodeSettings,
} from '@/types/config';
import { DEFAULT_MODULE_STYLE as defaultStyle } from '@/types/config';
import { getModuleDefinition } from '@/lib/module-registry';
import { DEFAULT_DISPLAY_WIDTH, DEFAULT_DISPLAY_HEIGHT } from '@/lib/constants';
import { editorFetch } from '@/lib/editor-fetch';
import {
  findMainDisplay,
  isMainDisplay,
  pruneDanglingScreenRefs,
} from '@/lib/display-filter';
import type { LayoutExport } from '@/types/layout-export';
import {
  createLayoutExport,
  importLayout as importLayoutCore,
} from '@/lib/layout-export';
import { scaleModulesToFit } from '@/lib/module-utils';
import {
  getActiveScreens,
  withActiveScreens,
  getActiveDimensions,
  resolveProfileTarget,
  updateModuleInConfig,
  buildBootstrapMain,
  buildNewDisplay,
} from '@/lib/editor-multi-display';
import {
  MAX_HISTORY,
  COALESCE_WINDOW_MS,
  createPendingResave,
  snapshotState,
  applyHistoryStep,
  type HistoryEntry,
  type PendingResave,
} from '@/stores/editor-save';

/**
 * Update the editor URL search params in place. Pass a string to set, null
 * to delete, undefined to leave a key unchanged. No-op on the server. Used
 * by every selection/CRUD/history action that the user expects to be able
 * to refresh without losing context.
 */
function syncEditorUrl({ screen, display }: { screen?: string | null; display?: string | null }): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (screen !== undefined) {
    if (screen !== null) url.searchParams.set('screen', screen);
    else url.searchParams.delete('screen');
  }
  if (display !== undefined) {
    if (display !== null) url.searchParams.set('display', display);
    else url.searchParams.delete('display');
  }
  window.history.replaceState(null, '', url.toString());
}

// Re-export pure multi-display helpers so existing consumers that import
// them from `@/stores/editor-store` keep working after the split.
export { getActiveScreens, getActiveDimensions } from '@/lib/editor-multi-display';

// `orientDimensions` now lives in `@/lib/display-filter` so the server-side
// per-display filter can share it. Re-exported here for existing callers.
export { orientDimensions } from '@/lib/display-filter';

interface EditorState {
  config: ScreenConfiguration | null;
  /**
   * The display the editor is currently operating on. When null, the editor
   * is in legacy single-display mode and all screen mutations go to
   * `config.screens`. When set to a display ID, mutations go to
   * `displays[i].screens` and the canvas uses that display's dimensions.
   */
  selectedDisplayId: string | null;
  selectedScreenId: string | null;
  selectedModuleId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  saveError: string | null;
  /** Internal: deferred promise representing a queued re-save. When
   * `saveConfig()` is called while a previous save is still in flight,
   * the caller awaits this so its `await saveConfig()` resolves only
   * after the run that includes its mutation has actually landed on
   * disk — preserving the contract that 15+ call sites already rely on
   * (closing modals, painting "Saved", etc.). The in-flight save flushes
   * this in its `finally` block by recursively calling `saveConfig`
   * and tying the recursive call's outcome back to `resolve`/`reject`. */
  _pendingResave: PendingResave | null;
  snapEnabled: boolean;
  _past: HistoryEntry[];
  _future: HistoryEntry[];
  _lastHistoryTime: number;
  _lastHistoryActionKey: string;

  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<void>;
  setSelectedDisplay: (id: string | null) => void;
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
  updateDisplaySettings: (displayId: string, partial: Partial<DisplayNodeSettings>) => void;
  addProfile: (name: string) => void;
  removeProfile: (id: string) => void;
  updateProfile: (id: string, updates: Partial<Profile>) => void;
  reorderProfiles: (fromIndex: number, toIndex: number) => void;
  setActiveProfile: (id: string | undefined) => void;
  addDisplay: (display: Omit<DisplayNode, 'screens'> & { screens?: Screen[] }) => void;
  updateDisplay: (id: string, updates: Partial<DisplayNode>) => void;
  removeDisplay: (id: string) => void;
  importConfig: (json: string) => void;
  exportLayout: (options?: { screenIds?: string[]; name?: string; description?: string }) => void;
  importLayoutAction: (layout: LayoutExport, options: { mode: 'add' | 'replace'; applyVisual?: boolean }) => void;
  scaleAllModules: (oldWidth: number, oldHeight: number, newWidth: number, newHeight: number) => void;
  toggleSnap: () => void;
  undo: () => void;
  redo: () => void;
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
      newPast = [...state._past, snapshotState({ ...state, config })];
      if (newPast.length > MAX_HISTORY) newPast = newPast.slice(newPast.length - MAX_HISTORY);
    }

    set({
      isDirty: true, saveError: null,
      _past: newPast, _future: [], _lastHistoryTime: now, _lastHistoryActionKey: actionKey,
      ...fn(config),
    });
  };

  const stepHistory = (direction: 'undo' | 'redo') => {
    const state = get();
    if (!state.config) return;
    const result = applyHistoryStep(state as Parameters<typeof applyHistoryStep>[0], direction);
    if (!result) return;
    set(result.next);
    if (
      result.next.selectedScreenId !== result.previousSelectedScreenId
      || result.next.selectedDisplayId !== result.previousSelectedDisplayId
    ) {
      syncEditorUrl({
        screen: result.next.selectedScreenId ?? null,
        display: result.next.selectedDisplayId ?? null,
      });
    }
  };

  return {
  config: null,
  selectedDisplayId: null,
  selectedScreenId: null,
  selectedModuleId: null,
  isDirty: false,
  isSaving: false,
  saveError: null,
  _pendingResave: null,
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

      // Restore which display the editor was operating on from the URL.
      // Multi-display: default to 'main' when it exists, otherwise the first
      // display in the list. Single-display: null (legacy behavior).
      const params = new URLSearchParams(window.location.search);
      const displayParam = params.get('display');
      let selectedDisplayId: string | null = null;
      if (config.displays && config.displays.length > 0) {
        const fromUrl = displayParam && config.displays.find((d) => d.id === displayParam);
        selectedDisplayId = fromUrl
          ? fromUrl.id
          : findMainDisplay(config.displays)?.id
            ?? config.displays[0]!.id;
      }

      // Pick the selected screen from the active display's list.
      const activeScreens = getActiveScreens(config, selectedDisplayId);
      const screenParam = params.get('screen');
      const restoredScreen = screenParam && activeScreens.find((s) => s.id === screenParam);
      set({
        config,
        selectedDisplayId,
        selectedScreenId: restoredScreen ? restoredScreen.id : activeScreens[0]?.id ?? null,
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

  setSelectedDisplay: (id) => {
    const { config } = get();
    if (!config) return;
    // Pick a sensible first screen for the newly-selected display.
    const activeScreens = getActiveScreens(config, id);
    const firstId = activeScreens[0]?.id ?? null;
    set({
      selectedDisplayId: id,
      selectedScreenId: firstId,
      selectedModuleId: null,
    });
    // Sync the URL so refreshes land back on the same display.
    syncEditorUrl({ display: id ?? null, screen: firstId ?? null });
  },

  saveConfig: async () => {
    const state = get();
    const { config, isSaving } = state;
    if (!config) return;
    // Coalesce concurrent saves: if one is already in flight, return a
    // deferred promise that resolves when the *next* save run completes.
    // Multiple coalesced callers share a single deferred so they all
    // settle together on the same re-save. The in-flight save's `finally`
    // recursively invokes `saveConfig()` and chains its outcome onto the
    // deferred — preserving the contract that `await saveConfig()` blocks
    // until the caller's mutation has actually landed on disk (relied on
    // by every modal that closes after save and the settings auto-save
    // toast that paints "Saved" only after persistence completes).
    if (isSaving) {
      if (state._pendingResave) return state._pendingResave.promise;
      const pending = createPendingResave();
      set({ _pendingResave: pending });
      return pending.promise;
    }
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
    } finally {
      // Hand off to the queued re-save (if any). Tying the recursive
      // `saveConfig()` to `pending.resolve`/`pending.reject` settles the
      // deferred when the run that includes the coalesced caller's
      // mutation actually completes — propagating both success and
      // failure correctly. Using a microtask means observers of the
      // just-completed save see `isSaving === false` first, then the
      // next save kicks off — avoids spurious "saving → saving" flicker
      // without the observer ever seeing "saved".
      const pending = get()._pendingResave;
      if (pending) {
        set({ _pendingResave: null });
        queueMicrotask(() => {
          get().saveConfig().then(pending.resolve, pending.reject);
        });
      }
    }
  },

  selectScreen: (id) => {
    set({ selectedScreenId: id, selectedModuleId: null });
    syncEditorUrl({ screen: id });
  },

  selectModule: (id) => set({ selectedModuleId: id }),

  addModule: (screenId, type, position) => {
    const def = getModuleDefinition(type);
    if (!def) return;
    const state = get();
    const cfg = state.config;
    const fillsCanvas = def.fillsCanvas && cfg;
    const dims = cfg
      ? getActiveDimensions(cfg, state.selectedDisplayId)
      : { width: DEFAULT_DISPLAY_WIDTH, height: DEFAULT_DISPLAY_HEIGHT };
    const newModule: ModuleInstance = {
      id: uuidv4(),
      type,
      position: fillsCanvas ? { x: 0, y: 0 } : (position ?? { x: 100, y: 100 }),
      size: fillsCanvas
        ? { w: dims.width, h: dims.height }
        : { ...def.defaultSize },
      zIndex: 1,
      config: { ...def.defaultConfig },
      style: { ...defaultStyle, ...def.defaultStyle },
    };
    mutateConfig((config) => ({
      config: withActiveScreens(
        config,
        get().selectedDisplayId,
        getActiveScreens(config, get().selectedDisplayId).map((s) =>
          s.id === screenId ? { ...s, modules: [...s.modules, newModule] } : s,
        ),
      ),
      selectedModuleId: newModule.id,
    }));
  },

  removeModule: (screenId, moduleId) => {
    const { selectedModuleId, selectedDisplayId } = get();
    mutateConfig((config) => ({
      config: withActiveScreens(
        config,
        selectedDisplayId,
        getActiveScreens(config, selectedDisplayId).map((s) =>
          s.id === screenId ? { ...s, modules: s.modules.filter((m) => m.id !== moduleId) } : s,
        ),
      ),
      selectedModuleId: selectedModuleId === moduleId ? null : selectedModuleId,
    }));
  },

  updateModule: (screenId, moduleId, updates) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => ({
      config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({ ...m, ...updates })),
    }), { coalesce: `updateModule:${moduleId}` });
  },

  updateModuleStyle: (screenId, moduleId, style) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => ({
      config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({
        ...m,
        style: { ...m.style, ...style },
      })),
    }), { coalesce: `style:${moduleId}` });
  },

  moveModule: (screenId, moduleId, position) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => ({
      config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({ ...m, position })),
    }), { coalesce: `move:${moduleId}` });
  },

  resizeModule: (screenId, moduleId, size) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => ({
      config: updateModuleInConfig(config, selectedDisplayId, screenId, moduleId, (m) => ({ ...m, size })),
    }), { coalesce: `resize:${moduleId}` });
  },

  addScreen: () => {
    const { config, selectedDisplayId } = get();
    if (!config) return;
    const currentScreens = getActiveScreens(config, selectedDisplayId);
    const newScreen: Screen = {
      id: uuidv4(),
      name: `Screen ${currentScreens.length + 1}`,
      backgroundImage: '',
      modules: [],
    };
    mutateConfig((cfg) => ({
      config: withActiveScreens(
        cfg,
        selectedDisplayId,
        [...getActiveScreens(cfg, selectedDisplayId), newScreen],
      ),
      selectedScreenId: newScreen.id,
      selectedModuleId: null,
    }));
    syncEditorUrl({ screen: newScreen.id });
  },

  removeScreen: (id) => {
    const { config, selectedScreenId, selectedDisplayId } = get();
    if (!config) return;
    const activeScreens = getActiveScreens(config, selectedDisplayId);
    if (activeScreens.length <= 1) return;
    const screens = activeScreens.filter((s) => s.id !== id);

    // Apply the screen removal first, then cascade-prune any dangling
    // references. Ordering matters — the pruner scans whatever config it's
    // handed, so swapping these would overwrite the removal with the
    // stale pre-removal display list. Centralising the cascade in
    // `pruneDanglingScreenRefs` keeps the "where can a screen id live?"
    // knowledge in one place next to `validateDisplays`.
    const withRemovedScreen = withActiveScreens(config, selectedDisplayId, screens);
    const nextConfig = pruneDanglingScreenRefs(withRemovedScreen, id, selectedDisplayId);

    const newSelectedId = selectedScreenId === id ? screens[0]?.id ?? null : selectedScreenId;
    mutateConfig(() => ({
      config: nextConfig,
      selectedScreenId: newSelectedId,
      selectedModuleId: null,
    }));
    if (newSelectedId) {
      syncEditorUrl({ screen: newSelectedId });
    }
  },

  reorderScreens: (fromIndex: number, toIndex: number) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => {
      const screens = [...getActiveScreens(config, selectedDisplayId)];
      const [moved] = screens.splice(fromIndex, 1);
      screens.splice(toIndex, 0, moved);
      return { config: withActiveScreens(config, selectedDisplayId, screens) };
    });
  },

  updateScreen: (id, updates) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => ({
      config: withActiveScreens(
        config,
        selectedDisplayId,
        getActiveScreens(config, selectedDisplayId).map((s) =>
          s.id === id ? { ...s, ...updates } : s,
        ),
      ),
    }), { coalesce: `screen:${id}` });
  },

  updateSettings: (settings) => {
    mutateConfig((config) => ({
      config: { ...config, settings: { ...config.settings, ...settings } },
    }), { coalesce: 'settings' });
  },

  updateDisplaySettings: (displayId, partial) => {
    mutateConfig((config) => {
      const displays = config.displays;
      if (!displays) return {};
      const idx = displays.findIndex((d) => d.id === displayId);
      if (idx === -1) return {};

      // Clone the current override object and merge the partial in. A field
      // set to `undefined` in `partial` is treated as a "reset to inherited"
      // — delete the key so the shallow merge in filterConfigForDisplay
      // falls back to the global value instead of writing `undefined` over it.
      const nextSettings: DisplayNodeSettings = { ...(displays[idx].settings ?? {}) };
      for (const key of Object.keys(partial) as Array<keyof DisplayNodeSettings>) {
        const value = partial[key];
        if (value === undefined) {
          delete nextSettings[key];
        } else {
          (nextSettings as Record<string, unknown>)[key] = value;
        }
      }

      const nextDisplays = [...displays];
      // If the resulting overrides object is empty, strip the `settings`
      // field from the display entirely so the on-disk JSON stays clean
      // and a grep for `"settings":` doesn't surface a noise hit.
      if (Object.keys(nextSettings).length === 0) {
        const { settings: _drop, ...rest } = nextDisplays[idx];
        void _drop;
        nextDisplays[idx] = rest;
      } else {
        nextDisplays[idx] = { ...nextDisplays[idx], settings: nextSettings };
      }

      return { config: { ...config, displays: nextDisplays } };
      // Share the 'settings' coalesce key with `updateSettings` so a Save
      // that writes both global and per-display overrides lands as a
      // single undo entry rather than two.
    }, { coalesce: 'settings' });
  },

  addProfile: (name: string) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => {
      const newProfile: Profile = {
        id: uuidv4(),
        name,
        screenIds: getActiveScreens(config, selectedDisplayId).map((s) => s.id),
      };
      const target = resolveProfileTarget(config, selectedDisplayId);
      if (target.kind === 'display') {
        const nextDisplays = [...config.displays!];
        nextDisplays[target.idx] = {
          ...target.display,
          profiles: [...(target.display.profiles ?? []), newProfile],
        };
        return { config: { ...config, displays: nextDisplays } };
      }
      return {
        config: { ...config, profiles: [...(config.profiles ?? []), newProfile] },
      };
    });
  },

  removeProfile: (id: string) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => {
      const target = resolveProfileTarget(config, selectedDisplayId);
      if (target.kind === 'display') {
        const nextDisplays = [...config.displays!];
        nextDisplays[target.idx] = {
          ...target.display,
          profiles: (target.display.profiles ?? []).filter((p) => p.id !== id),
          ...(target.display.activeProfile === id ? { activeProfile: undefined } : {}),
        };
        return { config: { ...config, displays: nextDisplays } };
      }

      const profiles = (config.profiles ?? []).filter((p) => p.id !== id);
      const settings = config.settings.activeProfile === id
        ? { ...config.settings, activeProfile: undefined }
        : config.settings;
      // Clear the removed profile from per-display activeProfile so the
      // writeConfig validator stays happy.
      const displays = config.displays?.map((d) => ({
        ...d,
        ...(d.activeProfile === id ? { activeProfile: undefined } : {}),
      }));
      return { config: { ...config, profiles, settings, displays } };
    });
  },

  updateProfile: (id: string, updates: Partial<Profile>) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => {
      const target = resolveProfileTarget(config, selectedDisplayId);
      if (target.kind === 'display') {
        const nextDisplays = [...config.displays!];
        nextDisplays[target.idx] = {
          ...target.display,
          profiles: (target.display.profiles ?? []).map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        };
        return { config: { ...config, displays: nextDisplays } };
      }
      return {
        config: {
          ...config,
          profiles: (config.profiles ?? []).map((p) =>
            p.id === id ? { ...p, ...updates } : p,
          ),
        },
      };
    }, { coalesce: `profile:${id}` });
  },

  reorderProfiles: (fromIndex: number, toIndex: number) => {
    const { config, selectedDisplayId } = get();
    if (!config) return;
    const target = resolveProfileTarget(config, selectedDisplayId);
    if (target.kind === 'display') {
      const profiles = [...(target.display.profiles ?? [])];
      const [moved] = profiles.splice(fromIndex, 1);
      profiles.splice(toIndex, 0, moved);
      const nextDisplays = [...config.displays!];
      nextDisplays[target.idx] = { ...target.display, profiles };
      mutateConfig(() => ({ config: { ...config, displays: nextDisplays } }), { coalesce: 'reorderProfiles' });
      return;
    }
    if (!config.profiles) return;
    const profiles = [...config.profiles];
    const [moved] = profiles.splice(fromIndex, 1);
    profiles.splice(toIndex, 0, moved);
    mutateConfig(() => ({ config: { ...config, profiles } }), { coalesce: 'reorderProfiles' });
  },

  setActiveProfile: (id: string | undefined) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => {
      // Match the sibling profile actions: only route to display.activeProfile
      // when the display OWNS its profile list. Shared-pool displays and
      // legacy single-display installs write to config.settings.activeProfile,
      // which is what ProfilesSection's read path checks for those cases.
      const target = resolveProfileTarget(config, selectedDisplayId);
      if (target.kind === 'display') {
        const nextDisplays = [...config.displays!];
        nextDisplays[target.idx] = { ...target.display, activeProfile: id };
        return { config: { ...config, displays: nextDisplays } };
      }
      return {
        config: { ...config, settings: { ...config.settings, activeProfile: id } },
      };
    }, { coalesce: 'activeProfile' });
  },

  addDisplay: (display) => {
    // Multi-display bootstrap has two paths, both handled below via
    // `buildBootstrapMain` / `buildNewDisplay`:
    //   1. First display added is non-main → auto-seed a sibling `main` from
    //      the existing global screens + profiles so the hub's kiosk keeps
    //      showing what it was showing before multi-display turned on.
    //   2. First display added IS `main` without its own screens → that new
    //      display itself inherits global screens/profiles (can't sibling-seed
    //      because there can only be one `main`).
    //
    // Profiles are per-display in multi-display mode; we deep-clone the legacy
    // shared pool only onto the bootstrapped main, and every subsequent display
    // starts with an empty profile list alongside its empty screens list.
    mutateConfig((config) => {
      const existingDisplays = config.displays ?? [];
      const isFirstDisplay = existingDisplays.length === 0;
      const hasMain = existingDisplays.some((d) => isMainDisplay(d.id));
      const userAddingMainAsFirst = isFirstDisplay && isMainDisplay(display.id);
      const userDidNotSpecifyScreens = !display.screens;
      const inheritFromGlobal = userAddingMainAsFirst && userDidNotSpecifyScreens;

      const nextDisplays = [...existingDisplays];

      if (isFirstDisplay && !hasMain && !isMainDisplay(display.id)) {
        nextDisplays.push(buildBootstrapMain(config));
      }

      nextDisplays.push(buildNewDisplay(display, config, inheritFromGlobal));

      // Keep the editor focused on "main" so the user's existing screens stay
      // visible until they explicitly switch to the newly-added display.
      let newSelectedId = get().selectedDisplayId;
      if (newSelectedId === null && nextDisplays.length > 0) {
        newSelectedId = findMainDisplay(nextDisplays)!.id;
      }

      return {
        config: { ...config, displays: nextDisplays },
        selectedDisplayId: newSelectedId,
      };
    });
  },

  updateDisplay: (id, updates) => {
    mutateConfig((config) => ({
      config: {
        ...config,
        displays: (config.displays ?? []).map((d) =>
          d.id === id ? { ...d, ...updates } : d,
        ),
      },
    }), { coalesce: `display:${id}` });
  },

  removeDisplay: (id) => {
    // The hub Pi's `main` display is the source of the original
    // single-display layout (auto-created from `config.screens` on first
    // multi-display bootstrap). Removing it would orphan those screens
    // and reset the hub kiosk to an unadopted state, so we hard-block it
    // at the store layer rather than relying on every UI surface to hide
    // its delete affordance. UIs are still free to hide the trash button
    // for clarity, but this guard means a stray call (tests, scripts,
    // future surfaces) can't accidentally delete main.
    if (isMainDisplay(id)) return;
    const { selectedDisplayId, selectedScreenId } = get();
    mutateConfig((config) => {
      // Collapse an empty result back to undefined so a legacy single-display
      // config (where `displays` never existed) does not get promoted to an
      // empty-array "multi-display mode with no displays" state.
      const filtered = (config.displays ?? []).filter((d) => d.id !== id);
      const nextDisplays = filtered.length > 0 ? filtered : undefined;

      // If the currently-selected display is being removed, point the editor
      // back at "main" (or the first remaining display, or null for legacy).
      let nextSelected = selectedDisplayId;
      if (selectedDisplayId === id) {
        nextSelected = findMainDisplay(nextDisplays)?.id ?? null;
      }

      // Re-resolve selectedScreenId against the new active display: the
      // previously-selected screen was owned by the removed display and is
      // not reachable anywhere else, so we'd otherwise leave the editor
      // pointing at a ghost ID until the user manually clicks a tab.
      let nextSelectedScreenId = selectedScreenId;
      if (nextSelected !== selectedDisplayId) {
        const nextConfig = { ...config, displays: nextDisplays };
        const nextActiveScreens = getActiveScreens(nextConfig, nextSelected);
        nextSelectedScreenId = nextActiveScreens[0]?.id ?? null;
      }

      return {
        config: { ...config, displays: nextDisplays },
        selectedDisplayId: nextSelected,
        selectedScreenId: nextSelectedScreenId,
        selectedModuleId: nextSelected !== selectedDisplayId ? null : get().selectedModuleId,
      };
    });
  },

  importConfig: (json: string) => {
    const parsed = JSON.parse(json) as ScreenConfiguration;
    if (!parsed.screens || !Array.isArray(parsed.screens) || !parsed.settings) {
      throw new Error('Invalid config file: missing screens or settings');
    }
    const state = get();
    let newPast = state._past;
    if (state.config) {
      newPast = [...state._past, snapshotState(state as Parameters<typeof snapshotState>[0])];
      if (newPast.length > MAX_HISTORY) newPast = newPast.slice(newPast.length - MAX_HISTORY);
    }
    const nextDisplayId = findMainDisplay(parsed.displays)?.id ?? null;
    const activeScreens = getActiveScreens(parsed, nextDisplayId);
    const firstId = activeScreens[0]?.id ?? null;
    set({
      config: parsed,
      selectedDisplayId: nextDisplayId,
      selectedScreenId: firstId,
      selectedModuleId: null,
      isDirty: true, saveError: null,
      _past: newPast, _future: [], _lastHistoryTime: 0, _lastHistoryActionKey: '',
    });
    if (firstId) {
      syncEditorUrl({ screen: firstId });
    }
  },

  exportLayout: (options = {}) => {
    const { config, selectedDisplayId } = get();
    if (!config) return;
    // Export operates on the screens the editor is currently working on —
    // a per-display export in multi-display mode, the global pool in legacy.
    const activeScreens = getActiveScreens(config, selectedDisplayId);
    const dims = getActiveDimensions(config, selectedDisplayId);
    const tempConfig: ScreenConfiguration = {
      ...config,
      screens: activeScreens,
      settings: {
        ...config.settings,
        displayWidth: dims.width,
        displayHeight: dims.height,
      },
    };
    const layout = createLayoutExport(tempConfig, options);
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
    const { selectedDisplayId } = get();
    let firstNewId: string | null = null;
    mutateConfig((config) => {
      // Work against a temp single-display view of the active screens so
      // importLayoutCore's existing logic can scale/clamp modules to the
      // target canvas without knowing about displays.
      const activeScreens = getActiveScreens(config, selectedDisplayId);
      const dims = getActiveDimensions(config, selectedDisplayId);
      const tempConfig: ScreenConfiguration = {
        ...config,
        screens: activeScreens,
        settings: {
          ...config.settings,
          displayWidth: dims.width,
          displayHeight: dims.height,
        },
      };
      const updated = importLayoutCore(layout, tempConfig, options);

      // Apply the screen changes back to the active container, and carry
      // any applyVisual settings/profile changes forward on the root config.
      //
      // In multi-display mode, preserve the ORIGINAL global displayWidth/Height
      // when writing updated.settings back — the temp-config shim set those
      // fields to the active display's dims so importLayoutCore could scale
      // modules against the right canvas, but writing those per-display dims
      // onto the root config would silently corrupt the global fallback for
      // any display that relies on it.
      const nextConfig = withActiveScreens(config, selectedDisplayId, updated.screens);
      const settingsOut: GlobalSettings = selectedDisplayId
        ? {
            ...updated.settings,
            displayWidth: config.settings.displayWidth,
            displayHeight: config.settings.displayHeight,
            ...(config.settings.displayTransform != null
              ? { displayTransform: config.settings.displayTransform }
              : {}),
          }
        : updated.settings;
      const merged: ScreenConfiguration = {
        ...nextConfig,
        settings: settingsOut,
        ...(updated.profiles ? { profiles: updated.profiles } : {}),
      };

      const existingIds = new Set(activeScreens.map((s) => s.id));
      firstNewId = updated.screens.find((s) => !existingIds.has(s.id))?.id
        ?? updated.screens[0]?.id ?? null;
      return {
        config: merged,
        selectedScreenId: firstNewId,
        selectedModuleId: null,
      };
    });
    if (firstNewId) {
      syncEditorUrl({ screen: firstNewId });
    }
  },

  scaleAllModules: (oldWidth, oldHeight, newWidth, newHeight) => {
    const { selectedDisplayId } = get();
    mutateConfig((config) => ({
      config: withActiveScreens(
        config,
        selectedDisplayId,
        scaleModulesToFit(
          getActiveScreens(config, selectedDisplayId),
          oldWidth,
          oldHeight,
          newWidth,
          newHeight,
        ),
      ),
    }));
  },

  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  undo: () => stepHistory('undo'),
  redo: () => stepHistory('redo'),
}});
