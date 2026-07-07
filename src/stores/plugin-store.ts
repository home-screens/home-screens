import { create } from 'zustand';
import type { ComponentType } from 'react';
import type { PluginManifest, LoadedPlugin, PluginError, PluginConfigSectionProps } from '@/types/plugins';
import { unregisterModule } from '@/lib/module-registry';
import { deregisterFetchKey } from '@/lib/fetch-keys';
import { sharedStateStore } from '@/lib/shared-state-store';
import { pluginStatePrefix } from '@/lib/plugin-state-keys';
import type { ModuleType } from '@/types/config';
import { logger } from '@/lib/logger';

const log = logger('plugin-store');

interface PluginState {
  /** True until initial plugin loading completes */
  loading: boolean;
  /** Loaded plugins keyed by moduleType (e.g. "plugin:weather-radar") */
  plugins: Map<string, LoadedPlugin>;
  /** Load failures keyed by pluginId */
  errors: Map<string, PluginError>;

  /** Fetch installed plugins → load bundles → register in module registry */
  loadPlugins: () => Promise<void>;
  /** Register a single loaded plugin into reactive state */
  registerPlugin: (
    moduleType: string,
    component: ComponentType<Record<string, unknown>>,
    manifest: PluginManifest,
    configSection?: ComponentType<PluginConfigSectionProps>,
  ) => void;
  /** Remove a plugin from reactive state and module registry */
  unregisterPlugin: (moduleType: string) => void;
  /**
   * Clear all plugins from reactive state and module registry.
   * `preserveSharedState` keeps published shared-state keys alive — used by
   * the reload path so modules conditioned on a re-registered plugin's keys
   * don't blink out while its producer remounts. The reload path is then
   * responsible for clearing keys of plugins that are actually gone.
   */
  clearPlugins: (opts?: { preserveSharedState?: boolean }) => void;
  /** Record a load error for a plugin */
  setError: (pluginId: string, error: PluginError) => void;
}

/** Re-entrancy guard: deduplicate concurrent loadPlugins calls */
let loadPromise: Promise<void> | null = null;
let reloadPending = false;

export const usePluginStore = create<PluginState>((set, get) => ({
  loading: true,
  plugins: new Map(),
  errors: new Map(),

  loadPlugins: async () => {
    // If already loading, mark a reload pending and return the existing promise
    if (loadPromise) {
      reloadPending = true;
      return loadPromise;
    }
    set({ loading: true });
    loadPromise = (async () => {
      try {
        const { loadAllPlugins } = await import('@/lib/plugin-loader');
        await loadAllPlugins();
        // If a reload was requested during the load, run again to pick up changes
        if (reloadPending) {
          reloadPending = false;
          await loadAllPlugins();
        }
      } catch (err) {
        log.error('Failed to load plugins:', err);
      } finally {
        set({ loading: false });
        loadPromise = null;
      }
    })();
    return loadPromise;
  },

  registerPlugin: (moduleType, component, manifest, configSection) => {
    set((state) => {
      const plugins = new Map(state.plugins);
      plugins.set(moduleType, { component, manifest, configSection });
      // Clear any prior error for this plugin
      const errors = new Map(state.errors);
      errors.delete(manifest.id);
      return { plugins, errors };
    });
  },

  unregisterPlugin: (moduleType) => {
    // Purge the plugin's shared-state keys so conditions on them go back to
    // "unknown" instead of holding a dead producer's last value.
    const manifest = get().plugins.get(moduleType)?.manifest;
    if (manifest) sharedStateStore.clearKeysByPrefix(pluginStatePrefix(manifest.id));
    unregisterModule(moduleType as ModuleType);
    set((state) => {
      const plugins = new Map(state.plugins);
      plugins.delete(moduleType);
      return { plugins };
    });
  },

  clearPlugins: (opts) => {
    const { plugins } = get();
    for (const [moduleType, entry] of plugins) {
      if (!opts?.preserveSharedState) {
        sharedStateStore.clearKeysByPrefix(pluginStatePrefix(entry.manifest.id));
      }
      unregisterModule(moduleType as ModuleType);
      deregisterFetchKey(moduleType);
    }
    set({ plugins: new Map(), errors: new Map() });
  },

  setError: (pluginId, error) => {
    set((state) => {
      const errors = new Map(state.errors);
      errors.set(pluginId, error);
      return { errors };
    });
  },
}));
