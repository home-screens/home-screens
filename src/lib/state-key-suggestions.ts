// Pure state-key suggestion and browse logic shared by the condition
// combobox (ConditionTreeEditor) and the Settings → Shared state "Available"
// tab (SharedStateSection): the search+static merge that produces the
// KeySuggestion rows both surfaces render, plus the producer-grouping and
// per-category preview math the browse tab layers on top. Lives here rather
// than in either component so the two surfaces share one exported contract —
// a structural re-declaration of the suggestion shape would drift silently.

import type { TranslateFn } from '@/i18n';
import type { ProvidedStateKey } from '@/lib/shared-state-types';
import type { LoadedPlugin, StateKeyDescriptor } from '@/types/plugins';

/** One row in the merged suggestion list. `section` renders as a group
 *  header ("Home Assistant · Kitchen") above the first row that carries it. */
export interface KeySuggestion {
  key: string;
  /** Friendly first line: label, with the live value appended when known. */
  primary: string;
  /** Mono second line: the exact bus key. */
  secondary: string;
  section?: string;
}

/**
 * Merge async plugin search results with the static provider catalogue.
 * Search results lead (the plugin already filtered them by the query and
 * ordered them by relevance; they carry friendly names and grouping), static
 * suggestions follow with local query filtering, and duplicates collapse
 * toward the search result. A draft that exactly matches a known key keeps
 * the full static list visible so the user can still switch keys.
 */
export function buildSuggestions(
  searched: readonly (StateKeyDescriptor & { pluginName: string })[],
  options: readonly ProvidedStateKey[],
  draft: string,
  known: boolean,
): KeySuggestion[] {
  const query = draft.trim().toLowerCase();
  const out: KeySuggestion[] = [];
  const seen = new Set<string>();
  for (const d of searched) {
    if (seen.has(d.key)) continue;
    seen.add(d.key);
    const live = d.currentValue !== undefined
      ? ` — ${d.currentValue}${d.unit ? ` ${d.unit}` : ''}`
      : '';
    out.push({
      key: d.key,
      primary: `${d.label}${live}`,
      secondary: d.key,
      section: d.group ? `${d.pluginName} · ${d.group}` : d.pluginName,
    });
  }
  // Static suggestions (manifest providesState / deriveProvidedKeys).
  for (const o of options) {
    if (seen.has(o.key)) continue;
    const matches = query === '' || known
      || o.key.toLowerCase().includes(query) || o.label.toLowerCase().includes(query);
    if (!matches) continue;
    seen.add(o.key);
    out.push({
      key: o.key,
      primary: o.sampleValues?.length ? `${o.label} (${o.sampleValues.join(', ')})` : o.label,
      secondary: o.key,
    });
  }
  return out;
}

const PLUGIN_KEY_RE = /^plugin:([^:]+):/;

/** Friendly producer label from a key's namespace prefix. */
export function producerLabel(key: string, plugins: Map<string, LoadedPlugin>, t: TranslateFn): string {
  const match = PLUGIN_KEY_RE.exec(key);
  if (!match) return t('settings.sharedStatePage.builtInProducer');
  const pluginId = match[1];
  for (const plugin of plugins.values()) {
    if (plugin.manifest.id.toLowerCase() === pluginId) return plugin.manifest.name;
  }
  return pluginId;
}

/** One browse row inside a producer group. `subhead` (when present) is the
 *  device/room sub-header this row falls under, rendered once above the first
 *  row that carries it. */
export interface AvailableRow {
  key: string;
  primary: string;
  secondary: string;
  subhead?: string;
}

/** A producer's slice of the Available browse list. `truncated` means this
 *  producer's cross-plugin search hit the per-plugin cap, so more values exist
 *  behind a narrower query. */
export interface AvailableGroup {
  producer: string;
  rows: AvailableRow[];
  truncated: boolean;
}

/**
 * Turn the flat `buildSuggestions` output into producer-grouped browse rows.
 * Producers are ordered by first appearance (search results lead, then the
 * static catalogue, mirroring `buildSuggestions`); within a producer the
 * `section` string ("{producer} · {room}") is split so its room/device
 * remainder becomes a sub-header. Cap detection reads the raw `searched`
 * array (pre-merge): any producer whose search hit `requestLimit` results is
 * flagged `truncated`.
 *
 * Rows are bucketed by sub-header (not just left in input order) before
 * flattening: a plugin's own result order commonly interleaves domains (e.g.
 * Home Assistant returning a paired binary_sensor + switch per capability,
 * sorted by feature name) — without bucketing, the render's "print a header
 * when the sub-head changes from the previous row" check would fire on
 * nearly every row instead of once per group.
 *
 * `requestLimit` is the per-plugin cap the caller actually asked the search
 * layer for (the combobox's default cap, BROWSE_SEARCH_LIMIT for the browse
 * tab). It is passed in rather than read from a constant so cap detection
 * stays honest about which limit produced `searched` — a producer at exactly
 * this many raw hits is flagged `truncated`.
 */
export function buildAvailableGroups(
  suggestions: readonly KeySuggestion[],
  searched: readonly { key: string }[],
  plugins: Map<string, LoadedPlugin>,
  t: TranslateFn,
  requestLimit: number,
): AvailableGroup[] {
  // producerLabel scans the plugin map per call; caching by namespace makes
  // the two passes below cost one scan per producer instead of one per row
  // (this recomputes per keystroke over up to requestLimit rows per plugin).
  const labelCache = new Map<string, string>();
  const labelFor = (key: string): string => {
    const ns = PLUGIN_KEY_RE.exec(key)?.[1] ?? '';
    let label = labelCache.get(ns);
    if (label === undefined) {
      label = producerLabel(key, plugins, t);
      labelCache.set(ns, label);
    }
    return label;
  };

  // Cap detection: count raw search hits per producer (keyed by the same
  // producer label the groups use, so the flag lands on the exact group).
  const searchCounts = new Map<string, number>();
  for (const d of searched) {
    const producer = labelFor(d.key);
    searchCounts.set(producer, (searchCounts.get(producer) ?? 0) + 1);
  }

  const producerOrder: string[] = [];
  const byProducer = new Map<
    string,
    { subheadOrder: (string | undefined)[]; buckets: Map<string | undefined, AvailableRow[]> }
  >();

  for (const s of suggestions) {
    const producer = labelFor(s.key);
    let entry = byProducer.get(producer);
    if (!entry) {
      entry = { subheadOrder: [], buckets: new Map() };
      byProducer.set(producer, entry);
      producerOrder.push(producer);
    }
    let subhead: string | undefined;
    if (s.section) {
      const prefix = `${producer} · `;
      const remainder = s.section.startsWith(prefix)
        ? s.section.slice(prefix.length)
        : s.section === producer
          ? ''
          : s.section;
      subhead = remainder.trim() ? remainder : undefined;
    }
    let bucket = entry.buckets.get(subhead);
    if (!bucket) {
      bucket = [];
      entry.buckets.set(subhead, bucket);
      entry.subheadOrder.push(subhead);
    }
    bucket.push({ key: s.key, primary: s.primary, secondary: s.secondary, subhead });
  }

  return producerOrder.map((producer) => {
    const entry = byProducer.get(producer)!;
    return {
      producer,
      rows: entry.subheadOrder.flatMap((subhead) => entry.buckets.get(subhead)!),
      truncated: (searchCounts.get(producer) ?? 0) >= requestLimit,
    };
  });
}

/** How many rows of a single sub-head run render before the rest collapse
 *  behind a "show more" control. Keeps a long category (a room with dozens of
 *  entities) from dominating the page while still surfacing every category. */
const CATEGORY_PREVIEW_LIMIT = 10;

/** A contiguous run of rows sharing one sub-head (the "no sub-head" flat run
 *  included), with the preview cap applied. `collapsible` means the run is
 *  longer than the preview limit so the toggle renders; `hiddenCount` is how
 *  many rows are hidden right now (0 once expanded). */
export interface PreviewRun {
  runKey: string;
  subhead?: string;
  visible: AvailableRow[];
  hiddenCount: number;
  collapsible: boolean;
}

/** Split one producer's already-contiguous rows into sub-head runs. */
function groupRowsIntoRuns(
  rows: readonly AvailableRow[],
): { subhead?: string; rows: AvailableRow[] }[] {
  const runs: { subhead?: string; rows: AvailableRow[] }[] = [];
  for (const row of rows) {
    const last = runs[runs.length - 1];
    if (last && last.subhead === row.subhead) last.rows.push(row);
    else runs.push({ subhead: row.subhead, rows: [row] });
  }
  return runs;
}

/**
 * Turn a producer's rows into preview runs: group by sub-head, then cap each
 * run at `previewLimit` unless its key is in `expanded`. The run key
 * (`${producer}::${subhead ?? '__flat__'}`) is what the component tracks in
 * its expand/collapse set.
 */
export function buildPreviewRuns(
  producer: string,
  rows: readonly AvailableRow[],
  expanded: ReadonlySet<string>,
  previewLimit: number = CATEGORY_PREVIEW_LIMIT,
): PreviewRun[] {
  return groupRowsIntoRuns(rows).map((run) => {
    const runKey = `${producer}::${run.subhead ?? '__flat__'}`;
    const collapsible = run.rows.length > previewLimit;
    const showAll = !collapsible || expanded.has(runKey);
    return {
      runKey,
      subhead: run.subhead,
      visible: showAll ? [...run.rows] : run.rows.slice(0, previewLimit),
      hiddenCount: showAll ? 0 : run.rows.length - previewLimit,
      collapsible,
    };
  });
}
