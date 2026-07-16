// Editor-side aggregation over plugin `searchStateKeys` exports: fan the
// user's query out to every loaded plugin that implements search, sanitize
// whatever comes back (third-party code — never trust shapes), and merge into
// one deduped list for the condition builder's combobox. Plugins that throw,
// hang, or return garbage contribute nothing; the builder then degrades to
// the static `collectProvidedStateKeys` suggestions, same posture as that
// function's own try/catch.

import { usePluginStore } from '@/stores/plugin-store';
import { SHARED_STATE_KEY_RE } from '@/lib/shared-state-types';
import type { LoadedPlugin, StateKeyDescriptor, StateKeyValueOption } from '@/types/plugins';
import { logger } from '@/lib/logger';

const log = logger('state-key-search');

/** A plugin that hasn't answered in this long is treated as having no
 *  results — the panel must never wait on a dead upstream. */
const SEARCH_TIMEOUT_MS = 3_000;

/** Per-plugin result cap passed as `opts.limit` and re-enforced after. */
const SEARCH_LIMIT = 30;

/** A sanitized descriptor tagged with the plugin it came from, for the
 *  combobox's plugin-then-group section headers. */
export interface SearchedStateKey extends StateKeyDescriptor {
  pluginName: string;
}

const VALUE_TYPES = new Set(['enum', 'numeric', 'string']);
const MAX_VALUE_OPTIONS = 50;
const MAX_LABEL_LENGTH = 200;

function asShortString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_LABEL_LENGTH
    ? value
    : undefined;
}

/**
 * Validate one plugin's raw search results down to well-formed descriptors.
 * Entries with a malformed key are dropped entirely (the builder must never
 * offer a key the bus would reject); malformed optional fields are stripped
 * rather than dropping the entry. Exported for tests.
 */
export function sanitizeDescriptors(raw: unknown, limit: number = SEARCH_LIMIT): StateKeyDescriptor[] {
  if (!Array.isArray(raw)) return [];
  const out: StateKeyDescriptor[] = [];
  for (const entry of raw) {
    if (out.length >= limit) break;
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    const key = candidate.key;
    if (typeof key !== 'string' || !SHARED_STATE_KEY_RE.test(key)) continue;

    const valueType = typeof candidate.valueType === 'string' && VALUE_TYPES.has(candidate.valueType)
      ? (candidate.valueType as StateKeyDescriptor['valueType'])
      : 'string';

    let valueOptions: StateKeyValueOption[] | undefined;
    if (valueType === 'enum' && Array.isArray(candidate.valueOptions)) {
      const sanitized: StateKeyValueOption[] = [];
      for (const o of candidate.valueOptions) {
        if (sanitized.length >= MAX_VALUE_OPTIONS) break;
        if (!o || typeof o !== 'object') continue;
        const option = o as Record<string, unknown>;
        if (typeof option.value !== 'string') continue;
        sanitized.push({ value: option.value, label: asShortString(option.label) });
      }
      valueOptions = sanitized.length > 0 ? sanitized : undefined;
    }

    out.push({
      key,
      label: asShortString(candidate.label) ?? key,
      group: asShortString(candidate.group),
      // An enum with no usable options degrades to free text.
      valueType: valueType === 'enum' && !valueOptions ? 'string' : valueType,
      valueOptions,
      unit: asShortString(candidate.unit),
      currentValue: typeof candidate.currentValue === 'string' ? candidate.currentValue : undefined,
    });
  }
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/** The one "does this plugin implement key search?" predicate. Callers that
 *  need reactivity apply it over their own `usePluginStore((s) => s.plugins)`
 *  subscription; this module applies it over a snapshot. */
export function pluginHasStateKeySearch(plugin: Pick<LoadedPlugin, 'searchStateKeys'>): boolean {
  return typeof plugin.searchStateKeys === 'function';
}

/**
 * Query every search-capable plugin, in parallel, each behind its own
 * timeout + try/catch. Results are sanitized, tagged with the plugin's
 * display name, and deduped by key (first plugin wins). Never rejects.
 */
export async function searchStateKeysAcrossPlugins(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<SearchedStateKey[]> {
  const limit = opts.limit ?? SEARCH_LIMIT;
  const timeoutMs = opts.timeoutMs ?? SEARCH_TIMEOUT_MS;
  const { plugins, pluginSettings } = usePluginStore.getState();

  const searchable = Array.from(plugins.values()).filter(pluginHasStateKeySearch);
  if (searchable.length === 0) return [];

  const perPlugin = await Promise.all(
    searchable.map(async (plugin) => {
      const settings = pluginSettings.get(plugin.manifest.id.toLowerCase()) ?? {};
      try {
        const raw = await withTimeout(
          // Descriptor validation below is the real guard; the call itself
          // just needs to not detonate synchronously.
          Promise.resolve(plugin.searchStateKeys!(query, { limit, settings })),
          timeoutMs,
        );
        return sanitizeDescriptors(raw, limit).map((d) => ({
          ...d,
          pluginName: plugin.manifest.name,
        }));
      } catch (err) {
        // Third-party code — degrade to static suggestions, never break the panel.
        log.warn(`searchStateKeys failed for ${plugin.manifest.id}:`, err);
        return [];
      }
    }),
  );

  const seen = new Set<string>();
  const merged: SearchedStateKey[] = [];
  for (const results of perPlugin) {
    for (const d of results) {
      if (seen.has(d.key)) continue;
      seen.add(d.key);
      merged.push(d);
    }
  }
  return merged;
}
