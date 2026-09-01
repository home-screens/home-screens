import type { ModuleType, Screen, ScreenConfiguration } from '@/types/config';

/** One module type that matched the query on a screen, with how often it appears there. */
export interface ScreenSearchModuleHit {
  type: ModuleType;
  label: string;
  count: number;
}

export interface ScreenSearchResult {
  /** `null` in legacy single-display mode (config.screens is the pool). */
  displayId: string | null;
  displayName: string | null;
  screen: Screen;
  /** True when the screen name contains the query. */
  nameMatch: boolean;
  /**
   * Character range of the query inside the original screen name, for
   * highlighting. Null when the name did not match, or when the match cannot
   * be located in the original string (lowercasing changed its length and
   * the case-insensitive scan over the original disagrees).
   */
  nameRange: { start: number; end: number } | null;
  /** Module types on this screen whose label matched, in first-seen order. */
  moduleHits: ScreenSearchModuleHit[];
}

/** Resolves the user-facing palette label for a module type (translated for built-ins). */
export type ModuleLabelResolver = (type: ModuleType) => string;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Locates `needle` inside `name` for highlighting. Offsets from the
 * lowercased copy are only valid when lowercasing preserved the length
 * (it does not for e.g. U+0130 "İ"); otherwise scan the original
 * case-insensitively.
 */
function locateRange(name: string, lower: string, needle: string): { start: number; end: number } | null {
  if (lower.length === name.length) {
    const index = lower.indexOf(needle);
    return index === -1 ? null : { start: index, end: index + needle.length };
  }
  const match = new RegExp(escapeRegExp(needle), 'i').exec(name);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

/**
 * Searches every screen on every display for a case-insensitive substring of
 * `query` in the screen name or in any of its modules' labels. Screens on the
 * selected display come first, then the remaining displays in registry
 * order; within a display, screens keep tab order. An empty query returns
 * nothing.
 */
export function searchScreens(
  config: ScreenConfiguration,
  query: string,
  resolveLabel: ModuleLabelResolver,
  selectedDisplayId: string | null,
): ScreenSearchResult[] {
  const needle = normalize(query);
  if (!needle) return [];

  const pools: { displayId: string | null; displayName: string | null; screens: Screen[] }[] =
    config.displays && config.displays.length > 0
      ? config.displays.map((d) => ({ displayId: d.id, displayName: d.name, screens: d.screens }))
      : [{ displayId: null, displayName: null, screens: config.screens }];

  // Selected display first so the closest result is always at the top.
  pools.sort((a, b) => {
    const aSel = a.displayId === selectedDisplayId ? 0 : 1;
    const bSel = b.displayId === selectedDisplayId ? 0 : 1;
    return aSel - bSel;
  });

  const labelCache = new Map<ModuleType, string>();
  const labelFor = (type: ModuleType): string => {
    let label = labelCache.get(type);
    if (label === undefined) {
      label = resolveLabel(type);
      labelCache.set(type, label);
    }
    return label;
  };

  const results: ScreenSearchResult[] = [];
  for (const pool of pools) {
    for (const screen of pool.screens) {
      const lowerName = screen.name.toLowerCase();
      const nameMatch = lowerName.includes(needle);
      const nameRange = nameMatch ? locateRange(screen.name, lowerName, needle) : null;

      const hits = new Map<ModuleType, ScreenSearchModuleHit>();
      for (const mod of screen.modules) {
        const existing = hits.get(mod.type);
        if (existing) {
          existing.count += 1;
          continue;
        }
        const label = labelFor(mod.type);
        if (label.toLowerCase().includes(needle)) {
          hits.set(mod.type, { type: mod.type, label, count: 1 });
        }
      }

      if (nameMatch || hits.size > 0) {
        results.push({
          displayId: pool.displayId,
          displayName: pool.displayName,
          screen,
          nameMatch,
          nameRange,
          moduleHits: [...hits.values()],
        });
      }
    }
  }
  return results;
}
