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
import { eventBus } from '@/lib/event-bus';
import type { EventMap } from '@/lib/event-bus';

// i18n — exposed read-only to plugins via window.__HS_SDK__.
import {
  BUILT_IN_NAMESPACES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  formatDateSync,
  formatNumber as i18nFormatNumber,
  getCachedNamespace,
  lookupKey,
  resolveLocaleChain,
  useLocale,
  useFormattingLocale,
} from '@/i18n';
import type { Dictionary, Namespace } from '@/i18n';

// Membership lookup is a hot path inside `translate` — pre-stringify into a
// Set once so the dispatcher does an O(1) check instead of an O(n) array
// scan every translation lookup. Cast through string to avoid `Set<Namespace>`
// rejecting the runtime `head` value (which can be any string at runtime).
const BUILT_IN_NAMESPACE_SET: ReadonlySet<string> = new Set<string>(
  BUILT_IN_NAMESPACES as readonly Namespace[],
);

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
  // Pull the active locale from the provider when one is mounted; falls
  // back to the default if PluginGlobals renders outside an I18nProvider
  // (still true today on /editor and /remote until later tasks wire it up).
  const locale = useLocale();
  const formattingLocale = useFormattingLocale();

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

      // Event bus — subscribe to host-published data events (weather, time)
      on: (channel: string, handler: (data: unknown) => void): (() => void) => {
        return eventBus.subscribe(
          channel as keyof EventMap,
          handler as (data: EventMap[keyof EventMap]) => void,
          { replay: true },
        );
      },

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

      // ── i18n surface ────────────────────────────────────────────────
      // Plugins call these to render locale-aware text. The translate
      // function looks the namespace up from the dotted key prefix:
      //
      //   translate('plugin:my-plugin.foo')   → namespace `plugin:my-plugin`
      //   translate('modules.weather.sunny')  → namespace `modules`
      //   translate('core.today')             → namespace `core`
      //   translate('today')                  → namespace `core` (default)
      //
      // The fallback chain (resolveLocaleChain) is walked per lookup. On a
      // miss the raw key is returned so missing translations are visible
      // rather than silently empty.
      locale: locale ?? DEFAULT_LOCALE,
      /**
       * Look up a translation by dotted key.
       *
       * The first dotted segment selects the namespace. `plugin:<id>`
       * resolves against the plugin's own dictionary registered by the
       * plugin loader; built-in namespaces (`core`, `modules`, `editor`,
       * `remote`, `weather`) resolve against host-shipped strings. Keys
       * without a leading namespace segment default to `core`.
       *
       * `vars` interpolates `{name}` placeholders and, when `vars.count`
       * is a number, selects the matching CLDR plural form. Returns the
       * raw key on any miss along the locale fallback chain.
       */
      translate: (key: string, vars?: Record<string, string | number>): string => {
        const tag = locale ?? DEFAULT_LOCALE;
        const chain = resolveLocaleChain(tag, FALLBACK_LOCALE);

        // Identify the namespace from the first dotted segment. Plugin
        // namespaces are prefixed with `plugin:` and may legitimately
        // contain a colon — so we split on the first `.` and treat
        // everything before it as the namespace name.
        const dotIndex = key.indexOf('.');
        let namespace: string;
        let lookupPath: string;
        if (dotIndex < 0) {
          namespace = 'core';
          lookupPath = key;
        } else {
          const head = key.slice(0, dotIndex);
          const tail = key.slice(dotIndex + 1);
          if (BUILT_IN_NAMESPACE_SET.has(head) || head.startsWith('plugin:')) {
            namespace = head;
            lookupPath = tail;
          } else {
            // Un-prefixed keys with embedded dots (e.g. `weather.sunny`
            // when the caller meant a `core` key shaped like that) keep
            // the back-compat behaviour: assume `core` and try the full
            // dotted path.
            namespace = 'core';
            lookupPath = key;
          }
        }

        for (const t of chain) {
          const dict: Dictionary | undefined = getCachedNamespace(t, namespace);
          if (!dict) continue;
          const value = lookupKey(dict, lookupPath, vars, t);
          if (value !== undefined) return value;
        }
        return key;
      },
      formatDate: (date: Date | number, pattern: string): string => {
        return formatDateSync(date, pattern, { locale: formattingLocale ?? DEFAULT_LOCALE });
      },
      formatNumber: (n: number, opts?: Intl.NumberFormatOptions): string => {
        return i18nFormatNumber(n, {
          locale: formattingLocale ?? DEFAULT_LOCALE,
          ...(opts ?? {}),
        });
      },
    };
  }, [locale, formattingLocale]);

  return null;
}
