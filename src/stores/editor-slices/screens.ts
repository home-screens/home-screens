import { uuid } from '@/lib/uuid';
import { arrayMove } from '@dnd-kit/sortable';
import type { ModuleInstance, Screen } from '@/types/config';
import { addedModuleSize, getModuleDefinition } from '@/lib/module-registry';
import { defaultPresetForLocale } from '@/lib/news-presets';
import { DEFAULT_MODULE_STYLE } from '@/types/config';
import { pruneDanglingScreenRefs, screensWithOpenButtonsMoved } from '@/lib/display-filter';
import { getActiveDimensions, getActiveScreens, withActiveScreens } from '@/lib/editor-multi-display';
import { fitModuleToDisplay } from '@/lib/module-utils';
import { pickedBackground, withRotationUpdate } from '@/lib/screen-background';
import { withBackgroundEffects } from '@/lib/background-effects';
import { COALESCE_KEYS } from '@/stores/editor-save';
import { syncEditorUrl } from '@/stores/editor-url';
import type { EditorGet, MutateConfig, ScreenActions } from './types';

/** Screen CRUD and ordering on the active display. */

export function createScreenSlice(
  get: EditorGet,
  mutateConfig: MutateConfig,
): ScreenActions {
  return {
    addScreen: (name) => {
      const { config, selectedDisplayId } = get();
      if (!config) return;
      const currentScreens = getActiveScreens(config, selectedDisplayId);
      const newScreen: Screen = {
        id: uuid(),
        name: name ?? `Screen ${currentScreens.length + 1}`,
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

    addScreenOpenedFrom: (fromScreenId, moduleId, twin, name) => {
      const { config, selectedDisplayId } = get();
      const def = getModuleDefinition(twin.type);
      if (!config || !def) return null;
      const dims = getActiveDimensions(config, selectedDisplayId);
      const moduleConfig: Record<string, unknown> = { ...def.defaultConfig, ...(twin.config ?? {}) };
      if (twin.type === 'fullscreen-news') {
        const preset = defaultPresetForLocale(config.settings?.locale);
        moduleConfig.feeds = [{ id: `default-${preset.id}`, url: preset.url, label: preset.publisher }];
      }
      const twinModule: ModuleInstance = {
        id: uuid(),
        type: twin.type,
        position: { x: 0, y: 0 },
        size: addedModuleSize(def, dims),
        zIndex: 1,
        config: moduleConfig,
        style: { ...DEFAULT_MODULE_STYLE, ...def.defaultStyle },
      };
      const newScreen: Screen = { id: uuid(), name, backgroundImage: '', modules: [twinModule], rotation: 'opened' };
      mutateConfig((cfg) => ({
        config: withActiveScreens(
          cfg,
          selectedDisplayId,
          [
            ...getActiveScreens(cfg, selectedDisplayId).map((screen) => screen.id !== fromScreenId ? screen : {
              ...screen,
              modules: screen.modules.map((m) => (m.id === moduleId ? { ...m, openButtonScreen: newScreen.id } : m)),
            }),
            newScreen,
          ],
        ),
      }));
      return newScreen.id;
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

    duplicateScreen: (id, copyName) => {
      const { config, selectedDisplayId } = get();
      if (!config) return;
      const src = getActiveScreens(config, selectedDisplayId).find((s) => s.id === id);
      if (!src) return;
      // Fresh ids throughout: the screen id so profiles/rules never see two
      // screens sharing one id, and module ids so per-module state keyed by
      // id (todo taps, selection) can't bleed between the two copies. A
      // module shown on every screen is drawn once for the whole display, so
      // the copy's flag comes off: two would stack on every screen.
      const cloned = structuredClone(src);
      const copy: Screen = {
        ...cloned,
        id: uuid(),
        name: copyName ?? `${src.name} copy`,
        modules: cloned.modules.map((m) => ({ ...m, id: uuid(), showOnEveryScreen: undefined })),
      };
      mutateConfig((cfg) => {
        const screens = getActiveScreens(cfg, selectedDisplayId);
        const idx = screens.findIndex((s) => s.id === id);
        const next = [...screens];
        next.splice(idx === -1 ? screens.length : idx + 1, 0, copy);
        return {
          config: withActiveScreens(cfg, selectedDisplayId, next),
          selectedScreenId: copy.id,
          selectedModuleId: null,
        };
      });
      syncEditorUrl({ screen: copy.id });
    },

    copyScreensFromDisplay: (sourceDisplayId) => {
      const { config, selectedDisplayId } = get();
      if (!config || !selectedDisplayId || sourceDisplayId === selectedDisplayId) return;
      const source = config.displays?.find((d) => d.id === sourceDisplayId);
      if (!source || source.screens.length === 0) return;
      // Fresh ids throughout, exactly as duplicateScreen does: two displays
      // sharing a screen id would make profiles, rules and per-module state
      // (todo taps, selection) collide across displays. Modules are fitted to
      // this display's shape, as an imported layout's are.
      const from = getActiveDimensions(config, sourceDisplayId);
      const to = getActiveDimensions(config, selectedDisplayId);
      // Open buttons move to the copies of their screens: every screen they
      // can open comes along, and the source display's ids are not here.
      const idMap = new Map<string, string>();
      const copies: Screen[] = screensWithOpenButtonsMoved(
        structuredClone(source.screens).map((screen) => {
          const id = uuid();
          idMap.set(screen.id, id);
          return {
            ...screen,
            id,
            modules: screen.modules.map((m) => ({ ...fitModuleToDisplay(m, from, to), id: uuid() })),
          };
        }),
        idMap,
      );
      mutateConfig((cfg) => ({
        config: withActiveScreens(
          cfg,
          selectedDisplayId,
          [...getActiveScreens(cfg, selectedDisplayId), ...copies],
        ),
        selectedScreenId: copies[0].id,
        selectedModuleId: null,
      }));
      syncEditorUrl({ screen: copies[0].id });
    },

    reorderScreens: (fromIndex: number, toIndex: number) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          selectedDisplayId,
          arrayMove(getActiveScreens(config, selectedDisplayId), fromIndex, toIndex),
        ),
      }));
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
      }), { coalesce: COALESCE_KEYS.updateScreen(id) });
    },

    pickScreenBackground: (id, backgroundImage) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          selectedDisplayId,
          getActiveScreens(config, selectedDisplayId).map((s) =>
            s.id === id ? { ...s, ...pickedBackground(s, backgroundImage) } : s,
          ),
        ),
      }), { coalesce: COALESCE_KEYS.updateScreen(id) });
    },

    updateScreenRotation: (id, update) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          selectedDisplayId,
          getActiveScreens(config, selectedDisplayId).map((s) =>
            s.id === id ? { ...s, backgroundRotation: withRotationUpdate(s.backgroundRotation, update) } : s,
          ),
        ),
      }), { coalesce: COALESCE_KEYS.screenRotation(id) });
    },

    updateScreenShade: (id, updates) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          selectedDisplayId,
          getActiveScreens(config, selectedDisplayId).map((s) =>
            s.id === id ? { ...s, shade: { ...s.shade, ...updates } as Screen['shade'] } : s,
          ),
        ),
      }), { coalesce: COALESCE_KEYS.screenShade(id) });
    },

    updateScreenEffects: (id, updates) => {
      const { selectedDisplayId } = get();
      mutateConfig((config) => ({
        config: withActiveScreens(
          config,
          selectedDisplayId,
          getActiveScreens(config, selectedDisplayId).map((s) => {
            if (s.id !== id) return s;
            const { effects: _effects, ...rest } = s;
            const effects = withBackgroundEffects(s.effects, updates);
            return effects ? { ...rest, effects } : rest;
          }),
        ),
      }), { coalesce: COALESCE_KEYS.screenEffects(id) });
    },
  };
}
