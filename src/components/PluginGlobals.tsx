'use client';

import { useLayoutEffect, useRef } from 'react';
import React from 'react';
import ReactDOM from 'react-dom';
import type { HsSdk } from '@/types/plugins';

// UI Components — display-safe (already in both bundles)
import Slider from '@/components/ui/Slider';
import ColorPicker from '@/components/ui/ColorPicker';
import Toggle from '@/components/ui/Toggle';
import SectionHeading from '@/components/ui/SectionHeading';

// Input class constants
import { INPUT_CLASS, NESTED_INPUT_CLASS } from '@/components/ui/input-classes';

// Hooks & Utilities
import { useFetchData } from '@/hooks/useFetchData';
import { TEXT_OPACITY } from '@/lib/constants';
import { displayCache } from '@/lib/display-cache';
import { getHostSettings } from '@/lib/plugin-host-settings';
import { pluginEventBus } from '@/lib/plugin-events';
import { displayFetch } from '@/lib/display-fetch';
import { eventBus } from '@/lib/event-bus';
import type { EventMap } from '@/lib/event-bus';
import { sharedStateStore } from '@/lib/shared-state-store';
import { providerHealthStore, type ProviderHealthStatus } from '@/lib/provider-health-store';
import { pluginStateKey } from '@/lib/plugin-state-keys';
import { usePluginStore } from '@/stores/plugin-store';
import { DISPLAY_SDK_STUBS } from '@/lib/plugin-sdk-display-stubs';

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
    // Muted, not red: the wall is read by people who cannot act on it.
    return (
      <div className="flex items-center justify-center h-full px-4">
        <p className="text-center text-sm" style={{ opacity: TEXT_OPACITY.dim }}>{error}</p>
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
 * SDK wrapper around the host `useFetchData`: plugins were written against a
 * string error (and render it straight into JSX), so the classified host
 * error is flattened back to its message here.
 */
function usePluginFetchData<T>(url: string, refreshMs: number): [T | null, string | null, number | null] {
  const [data, error, updatedAt] = useFetchData<T>(url, refreshMs);
  return [data, error?.message ?? null, updatedAt];
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
  // Pull the active locale from the provider. PluginGlobals mounts inside
  // the display and editor layouts' <I18nProvider> — mounting it outside
  // (as the root layout once did) makes `useLocale()` return the default,
  // so SDK.translate would resolve en-US regardless of `settings.locale`.
  const locale = useLocale();
  const formattingLocale = useFormattingLocale();

  // Locale is read through refs rather than closed over, so the SDK object can
  // be built exactly once (see the install effect's empty dep array).
  //
  // It used to rebuild on every locale change, which silently wiped the
  // editor-only members PluginGlobalsEditor bolts on with `[]` deps: changing
  // the language calls `router.refresh()` (deliberately, so the editor doesn't
  // remount), the base effect re-ran and replaced the object, and the next
  // plugin ConfigSection to render got `undefined` for AccordionSection. With
  // no error boundary in the tree, that took the whole editor down.
  const localeRef = useRef(locale);
  const formattingLocaleRef = useRef(formattingLocale);

  // Declared BEFORE the install effect so it runs first on mount; effects fire
  // in declaration order. On later renders this is the only one that runs.
  useLayoutEffect(() => {
    localeRef.current = locale;
    formattingLocaleRef.current = formattingLocale;
    // `locale` is a plain data property, so it needs an explicit push. Every
    // other locale-dependent member reads the ref at call time.
    if (window.__HS_SDK__) window.__HS_SDK__.locale = locale ?? DEFAULT_LOCALE;
  }, [locale, formattingLocale]);

  useLayoutEffect(() => {
    window.React = React;
    window.ReactDOM = ReactDOM;

    const base: HsSdk = {
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
      useFetchData: usePluginFetchData,

      // Utilities
      displayCache: {
        get: displayCache.get.bind(displayCache),
        set: displayCache.set.bind(displayCache),
        prefetch: displayCache.prefetch.bind(displayCache),
      },

      // Host settings — read-only snapshot of display configuration
      getHostSettings,

      // Plugin-level settings — read-only snapshot of the values saved in
      // the plugin manager against the manifest's `settingsSchema`. Module
      // instances use this to fall back to plugin-wide values (e.g. a
      // connection URL) so new instances need zero per-module setup.
      getPluginSettings: (pluginId: string): Record<string, unknown> => {
        if (typeof pluginId !== 'string') return {};
        const settings = usePluginStore.getState().pluginSettings.get(pluginId.toLowerCase());
        // Deep copy: settings may hold arrays/objects, and a plugin mutating
        // a shallow copy's nested value would corrupt the store-held object
        // every other reader (including the stateProvider prop) sees.
        return structuredClone(settings ?? {});
      },

      // Event emitter — plugin → host communication
      emit: pluginEventBus.emit,

      // Shared-state bus — publish named state for conditional module
      // visibility. The key is force-prefixed with the plugin's namespace
      // (`plugin:<id>:<rest>`, id lowercased) to prevent ACCIDENTAL key
      // collisions between producers. This is not an anti-spoofing boundary:
      // pluginId is caller-supplied inside the shared JS realm (same trust
      // model as pluginFetch). The store additionally enforces key format
      // plus key-count / value-length caps on this open write path.
      publishState: (pluginId: string, key: string, value: string): void => {
        if (typeof pluginId !== 'string' || typeof key !== 'string') return;
        sharedStateStore.publish(pluginStateKey(pluginId, key), value);
      },
      // Clear a previously published key so conditions on it evaluate as
      // unknown again. Same namespace enforcement as publishState. Keys are
      // also cleared automatically when the plugin is unregistered/reloaded.
      clearState: (pluginId: string, key: string): void => {
        if (typeof pluginId !== 'string' || typeof key !== 'string') return;
        sharedStateStore.clearKey(pluginStateKey(pluginId, key));
      },

      // Provider health — a plugin whose upstream service is down reports it
      // here so the editor can explain "the service is unreachable" next to
      // conditions/keys that depend on the plugin (instead of a silent hide).
      // Same open-write posture as publishState: pluginId is caller-supplied
      // inside the shared JS realm, and the store sanitizes id/message/since
      // and caps entries. `{ok:true}` clears; installed on the base SDK (like
      // publishState/clearState) so display and editor plugins both reach it.
      reportProviderHealth: (pluginId: string, status: ProviderHealthStatus): void => {
        if (typeof pluginId !== 'string') return;
        providerHealthStore.report(pluginId, status);
      },

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
          skipAuth?: boolean;
        },
      ): Promise<Response> => {
        return displayFetch(`/api/plugins/proxy/${encodeURIComponent(pluginId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(options),
        });
      },

      // Auth adapter status — lets a plugin component show connection-dependent
      // UI (e.g. "Connect your account to see playback"). Read-only; the connect
      // flow itself is editor-only (see __HS_SDK__.startAuth).
      getAuthStatus: async (
        pluginId: string,
      ): Promise<{ connected: boolean; expiresAt?: number }> => {
        try {
          const res = await displayFetch(
            `/api/plugins/auth/${encodeURIComponent(pluginId)}/status`,
          );
          if (!res.ok) return { connected: false };
          return await res.json();
        } catch {
          return { connected: false };
        }
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
      locale: localeRef.current ?? DEFAULT_LOCALE,
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
        const tag = localeRef.current ?? DEFAULT_LOCALE;
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
        return formatDateSync(date, pattern, {
          locale: formattingLocaleRef.current ?? DEFAULT_LOCALE,
        });
      },
      formatNumber: (n: number, opts?: Intl.NumberFormatOptions): string => {
        return i18nFormatNumber(n, {
          locale: formattingLocaleRef.current ?? DEFAULT_LOCALE,
          ...(opts ?? {}),
        });
      },

      // Editor-only behavior, but present on both surfaces so a plugin can call
      // them unconditionally. PluginGlobalsEditor overwrites both with the real
      // implementations in the editor layout and restores these on unmount.
      ...DISPLAY_SDK_STUBS,
    };

    // Merge, never replace. Belt-and-braces alongside the `[]` deps: if this
    // effect ever runs again (StrictMode remount, a future dep), the editor's
    // members must survive.
    //
    // A plain `{...existing, ...base}` is not enough. It preserves the keys
    // `base` does not own — AccordionSection, useModuleConfig — but `base` DOES
    // own startAuth and setPluginSettings via DISPLAY_SDK_STUBS, so a re-run
    // while the editor is mounted would quietly swap the editor's real
    // implementations back to display no-ops, with no path back (the editor's
    // installer is `[]`-dep'd and never re-runs). startAuth would stop opening
    // the Connection panel and nothing would say why. So the stub keys yield to
    // an existing implementation instead of overwriting it.
    const existing = window.__HS_SDK__;
    const merged: HsSdk = { ...existing, ...base };
    if (existing) {
      for (const k of Object.keys(DISPLAY_SDK_STUBS) as (keyof typeof DISPLAY_SDK_STUBS)[]) {
        // Only a value the editor installed differs from the stub identity.
        if (existing[k] && existing[k] !== DISPLAY_SDK_STUBS[k]) {
          (merged[k] as unknown) = existing[k];
        }
      }
    }
    window.__HS_SDK__ = merged;
  }, []);

  return null;
}
