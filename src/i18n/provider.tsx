'use client';

/**
 * `<I18nProvider>` + `useTranslate` hook.
 *
 * The provider stores the active locale and a Map of loaded namespace
 * dictionaries. It accepts an optional `blob` (the server-inlined seed) and
 * an optional `namespaces` list to eagerly load on mount.
 *
 * `useTranslate(namespace)` returns a memoized `t(key, vars?)` function that
 * walks the locale fallback chain across the loaded namespace. Calling it
 * before the namespace is loaded triggers a background `loadNamespace` and
 * returns the raw key in the meantime — never throws, never suspends.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Dictionary, TranslateFn } from './types';
import { resolveLocaleChain, lookupKey } from './fallback';
import { DEFAULT_LOCALE, FALLBACK_LOCALE } from './manifest';
import { getCachedNamespace, hydrateFromBlob, loadNamespace } from './loader';
import { preloadDateLocale } from './formatters';

interface I18nContextValue {
  locale: string;
  /**
   * Active formatting locale — distinct from `locale` so a household can
   * read English UI but format dates/numbers in (e.g.) German. Always set
   * to `formattingLocale ?? locale` so consumers never need to re-derive
   * the cascade. See `useFormattingLocale`.
   */
  formattingLocale: string;
  /**
   * Fast lookup: namespace → (locale → dictionary). Replaced (not
   * mutated) whenever a new dictionary lands — the loader effect always
   * builds a fresh outer Map + inner Map clone before calling setState,
   * so the reference identity is the source of truth for re-renders.
   */
  namespaces: Map<string, Map<string, Dictionary>>;
  /**
   * Bumped on date-fns locale preload so consumers that depend on the
   * formatting locale re-derive even when the namespace map is unchanged.
   */
  version: number;
  /** Internal helper for the hook to request a missing namespace. */
  requestNamespace: (namespace: string) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  /** Active BCP-47 locale (e.g. `"de-DE"`). Defaults to en-US. */
  locale?: string;
  /**
   * Optional override for date/number/relative-time formatting. When
   * unset, `useFormattingLocale()` and downstream formatters fall through
   * to `locale`. Set this when the household reads (e.g.) English UI but
   * wants German date formatting — `locale="en-US"` +
   * `formattingLocale="de-DE"`.
   */
  formattingLocale?: string;
  /** Namespaces to preload after mount (when the blob doesn't already cover them). */
  namespaces?: string[];
  /**
   * Server-inlined dictionaries keyed by namespace, e.g.
   * `{ core: {...}, modules: {...} }`. Hydrates the loader cache so the
   * first render has translations without a network roundtrip.
   */
  blob?: Record<string, Dictionary>;
  children: ReactNode;
}

/**
 * Build the `(namespace × locale) → Dictionary` map from a server blob and
 * seed the loader cache so subsequent `loadNamespace` calls hit the warm
 * cache instead of re-fetching. Used as a `useState` lazy initializer so
 * the work happens exactly once per mount, before first paint.
 */
function buildInitialMap(
  blob: Record<string, Dictionary> | undefined,
  locale: string,
): Map<string, Map<string, Dictionary>> {
  const map = new Map<string, Map<string, Dictionary>>();
  if (!blob) return map;
  hydrateFromBlob(locale, blob);
  for (const [ns, dict] of Object.entries(blob)) {
    const inner = new Map<string, Dictionary>();
    inner.set(locale, dict);
    map.set(ns, inner);
  }
  return map;
}

export function I18nProvider({
  locale = DEFAULT_LOCALE,
  formattingLocale,
  namespaces: requestedNamespaces,
  blob,
  children,
}: I18nProviderProps) {
  // Resolved formatting locale — `formattingLocale ?? locale`. Computed
  // here (not at consumer sites) so the cascade lives in exactly one
  // place; downstream code can read `useFormattingLocale()` without
  // knowing the rule.
  const resolvedFormattingLocale = formattingLocale ?? locale;
  // Hydration runs once in the lazy initializer — safe under React 19 Strict
  // Mode because the initializer is invoked once per mount even if the
  // function component double-renders. No render-side mutation; the loader
  // cache and the in-context map are populated before first paint.
  const [namespaceMaps, setNamespaceMaps] = useState<Map<string, Map<string, Dictionary>>>(() =>
    buildInitialMap(blob, locale),
  );
  const [version, setVersion] = useState(0);

  // Tracks `(locale, namespace)` pairs that already have an in-flight or
  // settled load. Keying on the locale-qualified string is essential: when
  // the active locale changes at runtime, we *want* a fresh load for every
  // namespace under the new tag rather than short-circuiting on the bare
  // namespace name. The set is mutated only inside effects.
  const requestedRef = useRef<Set<string>>(new Set());

  // Pending namespaces to load on the next effect tick. `requestNamespace`
  // (called from the render path of `useTranslate`) populates this; the
  // `useEffect` below drains it. Decoupling render from the actual load
  // keeps the hook side-effect-free under Strict Mode.
  const pendingRef = useRef<Set<string>>(new Set());
  // Bumped whenever the render path adds a name to pendingRef so the
  // loader effect re-runs even when locale/requestedNamespaces are stable.
  const [pendingTick, setPendingTick] = useState(0);

  const requestNamespace = useCallback(
    (namespace: string) => {
      const requestKey = `${locale}:${namespace}`;
      if (requestedRef.current.has(requestKey)) return;
      if (pendingRef.current.has(namespace)) return;
      pendingRef.current.add(namespace);
      // Trigger the loader effect on the next tick.
      setPendingTick((n) => n + 1);
    },
    [locale],
  );

  // Date-fns locale preload effect. The server-side layouts already call
  // `preloadDateLocale(locale)` (and the formatting locale when it
  // differs) so the first paint is correct; this effect handles the
  // runtime change case (e.g. user switches language or formatting
  // locale in the editor — the next clock tick should render in the
  // newly-loaded date-fns locale, not the previous one). The
  // `setVersion` bump invalidates `useTranslate` callbacks and triggers
  // a re-render of every consumer once the new locale lands. No-op when
  // the locale was already preloaded server-side (the formatter caches
  // by tag).
  //
  // We preload BOTH `locale` and `resolvedFormattingLocale` because they
  // can differ — translation lookups need the UI tag, while
  // `formatDateSync` (clock/date views) needs the formatting tag.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      preloadDateLocale(locale),
      resolvedFormattingLocale === locale
        ? Promise.resolve()
        : preloadDateLocale(resolvedFormattingLocale),
    ]).then(() => {
      if (cancelled) return;
      setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, resolvedFormattingLocale]);

  // Loader effect — drains `pendingRef` and the `requestedNamespaces` prop
  // into actual `loadNamespace` calls. Keyed on locale + tick so locale
  // changes always re-evaluate which loads are needed.
  useEffect(() => {
    const namespacesToLoad = new Set<string>(pendingRef.current);
    pendingRef.current.clear();
    if (requestedNamespaces) {
      for (const ns of requestedNamespaces) namespacesToLoad.add(ns);
    }
    if (namespacesToLoad.size === 0) return;

    // Immutable update helper — clones the outer Map and the affected
    // inner Map before patching the new (tag → dict) entry, then hands
    // the clone to setState. Consumers re-render because the outer Map
    // identity changes, not because of a side-channel `version` bump.
    const writeDict = (namespace: string, tag: string, dict: Dictionary) => {
      setNamespaceMaps((prev) => {
        const prevInner = prev.get(namespace) ?? new Map<string, Dictionary>();
        if (prevInner.get(tag) === dict) return prev;
        const nextInner = new Map(prevInner);
        nextInner.set(tag, dict);
        const next = new Map(prev);
        next.set(namespace, nextInner);
        return next;
      });
    };

    const chain = resolveLocaleChain(locale, FALLBACK_LOCALE);
    for (const namespace of namespacesToLoad) {
      const requestKey = `${locale}:${namespace}`;
      if (requestedRef.current.has(requestKey)) continue;
      requestedRef.current.add(requestKey);

      for (const tag of chain) {
        const cached = getCachedNamespace(tag, namespace);
        if (cached) {
          writeDict(namespace, tag, cached);
          continue;
        }
        void loadNamespace(tag, namespace).then((dict) => {
          writeDict(namespace, tag, dict);
        });
      }
    }
  }, [locale, requestedNamespaces, pendingTick]);

  const ctxValue = useMemo<I18nContextValue>(
    () => ({
      locale,
      formattingLocale: resolvedFormattingLocale,
      namespaces: namespaceMaps,
      version,
      requestNamespace,
    }),
    [locale, resolvedFormattingLocale, namespaceMaps, version, requestNamespace],
  );

  return <I18nContext.Provider value={ctxValue}>{children}</I18nContext.Provider>;
}

// In dev mode, warn-once per missing key so the console doesn't drown in
// repeats during a hot loop. The set is module-scoped so a hot reload
// resets it.
const MISSING_KEY_WARNINGS = new Set<string>();

function warnMissingKeyOnce(namespace: string, key: string, locale: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  const warningKey = `${locale}:${namespace}:${key}`;
  if (MISSING_KEY_WARNINGS.has(warningKey)) return;
  MISSING_KEY_WARNINGS.add(warningKey);
  console.warn(`[i18n] missing key "${key}" in namespace "${namespace}" for locale "${locale}"`);
}

// Warn-once when a hook is used outside <I18nProvider>. Same rationale as
// the missing-key warning: don't drown a dev console.
const NO_PROVIDER_WARNINGS = new Set<string>();
function warnNoProviderOnce(hookName: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (NO_PROVIDER_WARNINGS.has(hookName)) return;
  NO_PROVIDER_WARNINGS.add(hookName);
  console.warn(
    `[i18n] ${hookName}() called outside <I18nProvider>; falling back to ${DEFAULT_LOCALE}.`,
  );
}

/**
 * Hook returning a `t(key, vars?)` translator for `namespace`.
 *
 * Safe to call before the namespace has loaded — returns the raw key in that
 * window and triggers a background fetch. Once the dictionary lands the
 * provider re-renders and `t` resolves real strings.
 *
 * The actual loader call happens in a `useEffect` (not during render), so
 * this hook is render-pure under React 19 Strict Mode. The effect is keyed
 * on `(locale, namespace)` so a runtime locale change refetches.
 */
export function useTranslate(namespace: string): TranslateFn {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslate must be used inside an <I18nProvider>');
  }
  const { locale, namespaces, requestNamespace } = ctx;

  // Defer the load request to an effect — calling it here in render would
  // be a side effect that double-fires under Strict Mode. The effect
  // depends on (locale, namespace) so locale switches re-request.
  useEffect(() => {
    requestNamespace(namespace);
  }, [requestNamespace, namespace, locale]);

  // Re-derive a stable `t` whenever the locale, namespace, or version
  // changes. We deliberately depend on `ctx.version` so updates from
  // background loads propagate.
  return useCallback<TranslateFn>(
    (key, vars) => {
      const inner = namespaces.get(namespace);
      const chain = resolveLocaleChain(locale, FALLBACK_LOCALE);

      if (inner) {
        for (const tag of chain) {
          const dict = inner.get(tag);
          if (!dict) continue;
          const value = lookupKey(dict, key, vars, tag);
          if (value !== undefined) return value;
        }
      }

      warnMissingKeyOnce(namespace, key, locale);
      return key;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [namespace, locale, namespaces, ctx.version],
  );
}

/**
 * Read the active locale from the provider. Useful for translation
 * surfaces and any non-formatting code that needs to know the user's
 * UI tag.
 *
 * For date/number/relative-time formatting prefer `useFormattingLocale`,
 * which honors the `formattingLocale` override.
 *
 * In dev mode, warns once per process when called outside an
 * `<I18nProvider>` so accidental host-tree mounts don't silently default
 * to en-US.
 */
export function useLocale(): string {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    warnNoProviderOnce('useLocale');
    return DEFAULT_LOCALE;
  }
  return ctx.locale;
}

/**
 * Read the active formatting locale from the provider. Resolves the
 * `formattingLocale ?? locale` cascade so consumers don't have to.
 *
 * Use this for date / number / relative-time formatters — anything that
 * should follow the household's `globalSettings.formattingLocale`
 * override when set, and otherwise fall through to the UI locale.
 *
 * In dev mode, warns once per process when called outside an
 * `<I18nProvider>` so accidental host-tree mounts don't silently default
 * to en-US.
 */
export function useFormattingLocale(): string {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    warnNoProviderOnce('useFormattingLocale');
    return DEFAULT_LOCALE;
  }
  return ctx.formattingLocale;
}

/**
 * Pure server-side translate. Walks the same fallback chain as `useTranslate`
 * but takes the dictionaries explicitly so server components can call it
 * without a React context.
 *
 * `dictionaries` is keyed by locale tag, with each value being a single
 * namespace dictionary. (A server component typically only loads one
 * namespace at a time, so collapsing the namespace key here keeps the
 * call site readable.)
 */
export function translate(
  key: string,
  vars: Record<string, string | number> | undefined,
  locale: string,
  dictionaries: Record<string, Dictionary>,
): string {
  const chain = resolveLocaleChain(locale, FALLBACK_LOCALE);
  for (const tag of chain) {
    const dict = dictionaries[tag];
    if (!dict) continue;
    const value = lookupKey(dict, key, vars, tag);
    if (value !== undefined) return value;
  }
  return key;
}

/** @internal — clears the dev warning set so tests don't leak. */
export function __resetMissingKeyWarningsForTests(): void {
  MISSING_KEY_WARNINGS.clear();
  NO_PROVIDER_WARNINGS.clear();
}
