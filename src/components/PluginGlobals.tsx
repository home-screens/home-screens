'use client';

import { useLayoutEffect } from 'react';
import React from 'react';
import ReactDOM from 'react-dom';

// UI Components — display-safe (already in both bundles)
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import Toggle from '@/components/ui/Toggle';
import SectionHeading from '@/components/ui/SectionHeading';

// Input class constants
import { INPUT_CLASS, NESTED_INPUT_CLASS } from '@/components/ui/input-classes';

// Hooks & Utilities
import { useFetchData } from '@/hooks/useFetchData';
import { displayCache } from '@/lib/display-cache';
import { getHostSettings } from '@/lib/plugin-host-settings';
import { pluginEventBus } from '@/lib/plugin-events';
import { displayFetch } from '@/lib/display-fetch';

/**
 * Simple loading/error state component for plugins.
 *
 * Unlike the built-in ModuleLoadingState (which wraps with ModuleWrapper and
 * requires ModuleStyle), this variant is self-contained so plugins can use
 * it without importing internal module infrastructure.
 */
function PluginLoadingState({ loading, error, children }: { loading?: boolean; error?: string; children: React.ReactNode }) {
  if (error) {
    return (
      <div className="flex items-center justify-center h-full px-4">
        <p className="text-center text-sm text-hs-danger/80">{error}</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-center opacity-50">Loading…</p>
      </div>
    );
  }
  return <>{children}</>;
}

/**
 * Expose React, ReactDOM, and a shared SDK object on `window` so IIFE plugin
 * bundles can use them as externals without bundling their own copies.
 *
 * This must run before any plugin bundles execute.
 *
 * Editor-only SDK members (AccordionSection, useModuleConfig) are added by
 * PluginGlobalsEditor in the editor layout to keep the editor store out of
 * the display bundle.
 */
export default function PluginGlobals() {
  useLayoutEffect(() => {
    window.React = React;
    window.ReactDOM = ReactDOM;
    window.__HS_SDK__ = {
      // CSS class strings for consistent editor form styling
      INPUT_CLASS,
      NESTED_INPUT_CLASS,

      // UI Components — same ones used by built-in modules
      Slider,
      ColorPicker,
      Toggle,
      SectionHeading,
      ModuleLoadingState: PluginLoadingState,

      // Hooks
      useFetchData,

      // Utilities
      displayCache: {
        get: displayCache.get.bind(displayCache),
        set: displayCache.set.bind(displayCache),
        prefetch: displayCache.prefetch.bind(displayCache),
      },

      // Host settings — read-only snapshot of display configuration
      getHostSettings,

      // Event emitter — plugin → host communication
      emit: pluginEventBus.emit,

      // Server-side proxy — fetch external APIs with injected secrets
      pluginFetch: async (
        pluginId: string,
        options: {
          url: string;
          method?: string;
          headers?: Record<string, string>;
          payload?: string;
          secretInjections?: {
            header?: Record<string, string>;
            query?: Record<string, string>;
          };
          cacheTtlMs?: number;
        },
      ): Promise<Response> => {
        return displayFetch(`/api/plugins/proxy/${encodeURIComponent(pluginId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options),
        });
      },
    };
  }, []);

  return null;
}
