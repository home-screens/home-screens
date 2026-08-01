/**
 * Pure URL parser + redirect helper for the settings page.
 *
 * The sidebar URL shape:
 *   - `?section=defaults&page=screen`                — a Defaults source-of-truth page
 *   - `?section=display&id=kitchen&subtab=overrides` — a per-display drill-down page
 *   - `?section=displays`                            — the all-displays card grid
 *
 * Extracted from `app/(editor)/editor/settings/page.tsx` so the parsing
 * and canonicalization can be unit-tested without a `window`. The existing
 * test environment is `node`, not `jsdom`, and the original parser was
 * buried inside a client component that touched
 * `window.history.replaceState` — both blockers to a simple test.
 * Everything in this file is intentionally `string`-in / data-out so the
 * tests don't need any DOM.
 */

/**
 * Canonical list of every Defaults page id, in sidebar render order.
 * Mirrors `PAGE_META` in `SettingsSidebar.tsx` but lives here so the route
 * parser can validate against it without importing client components. New
 * defaults pages must be added in BOTH places — sidebar for rendering,
 * here for routing.
 *
 * The 2026-07 settings reorganization merged pages:
 *   - display + sleep + alerts            → `screen`
 *   - profiles + rules + shared-state     → `automation`
 *   - docs left the sidebar (footer link)
 */
export const DEFAULT_PAGE_IDS = [
  'screen',
  'location',
  'weather',
  'calendar',
  'meals',
  'integrations',
  'automation',
  'security',
  'network',
  'system',
  'data',
  'stats',
] as const;

export type DefaultPageId = (typeof DEFAULT_PAGE_IDS)[number];

/**
 * Sub-tabs on a per-display drill-down page. Mirrors `PER_DISPLAY_SUBTABS`
 * in `display/PerDisplayPage.tsx` — kept here so the route parser can
 * validate the `subtab` param without dragging a client component into
 * the lib graph.
 *
 * The reorganization collapsed six subtabs into two: `overview` absorbed
 * the old `profile` and `identity` subtabs, and `overrides` merged the
 * old `display`, `sleep`, and `alerts` subtabs (mirroring the merged
 * Defaults → Screen page).
 */
export const PER_DISPLAY_SUBTABS = ['overview', 'overrides'] as const;

export type PerDisplaySubtab = (typeof PER_DISPLAY_SUBTABS)[number];

/**
 * Resolved settings route. Three discriminated kinds:
 *   - `defaults` — render a Defaults source-of-truth page
 *   - `display`  — render a per-display drill-down page
 *   - `displays` — render the all-displays index
 */
/**
 * Panel ids for the Defaults pages that have an intra-page tab bar. Mirrors
 * `SCREEN_PANELS` in `ScreenSection.tsx` and `AUTOMATION_PANELS` in
 * `AutomationSection.tsx`; kept here so the route type can carry a panel
 * without pulling client components into the lib graph.
 *
 * Pages with no tab bar simply never set `panel`.
 */
export const SCREEN_PANEL_IDS = ['appearance', 'sleep', 'alerts'] as const;
export const AUTOMATION_PANEL_IDS = ['profiles', 'rules', 'live'] as const;

export type SettingsPanelId =
  | (typeof SCREEN_PANEL_IDS)[number]
  | (typeof AUTOMATION_PANEL_IDS)[number];

export type SettingsRoute =
  | {
      kind: 'defaults';
      page: DefaultPageId;
      /**
       * Active intra-page tab, when the page has one. Carried on the route
       * (rather than each section privately re-reading `?panel=`) so the
       * section renders the right tab on the first paint and the
       * canonicalizer can keep the URL bar's `?panel=` honest.
       */
      panel?: SettingsPanelId;
    }
  | { kind: 'display'; displayId: string; subtab: PerDisplaySubtab }
  | { kind: 'displays' };

const DEFAULT_PAGE_ID_SET: Set<string> = new Set(DEFAULT_PAGE_IDS);
const PER_DISPLAY_SUBTAB_SET: Set<string> = new Set(PER_DISPLAY_SUBTABS);

/**
 * Which panel ids are legal on which page. A page absent from this map has no
 * intra-page tab bar, so any `?panel=` on it is ignored.
 */
const PANELS_BY_PAGE: Partial<Record<DefaultPageId, readonly SettingsPanelId[]>> = {
  screen: SCREEN_PANEL_IDS,
  automation: AUTOMATION_PANEL_IDS,
};

/** The panel if it is valid for that page, otherwise undefined. */
export function validPanelFor(
  page: DefaultPageId,
  panel: string | null | undefined,
): SettingsPanelId | undefined {
  if (!panel) return undefined;
  const allowed = PANELS_BY_PAGE[page];
  if (!allowed) return undefined;
  return (allowed as readonly string[]).includes(panel)
    ? (panel as SettingsPanelId)
    : undefined;
}

/**
 * Pure URL parser. Takes a `URLSearchParams` and returns the resolved
 * `SettingsRoute`. Used from a `useMemo` in the page component so the
 * route derives directly from the current URL without a popstate listener.
 *
 * Order matters:
 *   1. `?section=display` requires a non-empty `id` to dispatch to
 *      a per-display page; an unrecognized `subtab` falls back
 *      to `overview`.
 *   2. `?section=displays` is the all-displays index.
 *   3. `?section=defaults&page=X` validates against `DEFAULT_PAGE_IDS`.
 *      A URL with no `section` at all but a `page` or `panel` param is
 *      parsed the same way — a hand-trimmed `?page=screen&panel=sleep`
 *      renders the intended tab instead of silently losing it.
 *   4. Unknown / missing params land on `defaults/screen`, the
 *      first-visit landing page.
 */
export function parseSettingsRoute(params: URLSearchParams): SettingsRoute {
  const section = params.get('section');
  if (section === 'display') {
    const id = params.get('id');
    if (id) {
      const rawSubtab = params.get('subtab') ?? 'overview';
      const subtab: PerDisplaySubtab = PER_DISPLAY_SUBTAB_SET.has(rawSubtab)
        ? (rawSubtab as PerDisplaySubtab)
        : 'overview';
      return { kind: 'display', displayId: id, subtab };
    }
  }
  if (section === 'displays') {
    return { kind: 'displays' };
  }
  const sectionlessDefaults =
    section === null && (params.get('page') !== null || params.get('panel') !== null);
  if (section === 'defaults' || sectionlessDefaults) {
    const rawPage = params.get('page') ?? 'screen';
    if (DEFAULT_PAGE_ID_SET.has(rawPage)) {
      const page = rawPage as DefaultPageId;
      // An explicit `?panel=` passes through, validated against that page's
      // own panel set so a stray value can't stick.
      const panel = validPanelFor(page, params.get('panel'));
      return panel ? { kind: 'defaults', page, panel } : { kind: 'defaults', page };
    }
  }
  return { kind: 'defaults', page: 'screen' };
}

/**
 * Resolve a query string to its parsed route AND, when any settings param
 * the URL carries (`section` / `page` / `panel` / `subtab`) disagrees with
 * what the parser resolved, the canonical query string the page should
 * rewrite the URL bar to — an unknown page id that fell back to `screen`,
 * a `?panel=` the page does not own, an unknown subtab coerced to
 * `overview`, a `section` that dispatched nowhere. The rewrite normalizes
 * those params to the resolved route, which can mean adding the canonical
 * `section`/`page` alongside a stale param; a URL carrying no settings
 * params at all (including bare `/editor/settings`) is never rewritten.
 * Returns `redirectedQuery: undefined` when no rewrite is needed.
 *
 * The page component uses this from a `useEffect` that calls
 * `router.replace(redirectedQuery)` when defined — but the resolution
 * itself is pure, so the test suite can verify both pieces (the
 * resolved route AND the rewrite target) without a window.
 */
export interface SettingsRouteResolution {
  route: SettingsRoute;
  /** When defined, the page should `router.replace(?{redirectedQuery})`. */
  redirectedQuery?: string;
}

export function resolveSettingsRoute(queryString: string): SettingsRouteResolution {
  // Tolerate leading "?" so callers can pass `window.location.search` raw.
  const trimmed = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const params = new URLSearchParams(trimmed);
  const route = parseSettingsRoute(params);

  // Any rewrite keeps unrelated params (e.g. analytics tags) so navigation
  // context isn't silently dropped on the redirect.
  if (route.kind === 'defaults') {
    const sectionParam = params.get('section');
    const pageParam = params.get('page');
    const panelParam = params.get('panel');
    const stale =
      // A `section` that dispatched nowhere (e.g. `section=display` with no
      // id) leaves the URL advertising a route that isn't rendering.
      (sectionParam !== null && sectionParam !== 'defaults') ||
      (pageParam !== null && pageParam !== route.page) ||
      (panelParam !== null && panelParam !== (route.panel ?? null));
    if (!stale) return { route };
    const next = new URLSearchParams(params);
    next.set('section', 'defaults');
    next.set('page', route.page);
    // `route.panel`, when set, is always the URL's own `?panel=` value
    // (`validPanelFor` passes it through or drops it), so a rewrite only
    // ever strips the param.
    next.delete('panel');
    // Per-display params riding on a URL that resolved to a defaults page
    // (e.g. `section=display&subtab=X` with no id) are equally stale.
    next.delete('id');
    next.delete('subtab');
    return { route, redirectedQuery: next.toString() };
  }
  if (route.kind === 'display') {
    const subtabParam = params.get('subtab');
    if (subtabParam === null || subtabParam === route.subtab) return { route };
    const next = new URLSearchParams(params);
    next.set('subtab', route.subtab);
    return { route, redirectedQuery: next.toString() };
  }
  return { route };
}
