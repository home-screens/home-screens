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

/**
 * Which panel ids are legal on which page. A page absent from this map has no
 * intra-page tab bar, so any `?panel=` on it is ignored. This map is also the
 * type-level source of truth: `SettingsRoute` correlates `page` with its own
 * panel union through it, so `{ page: 'screen', panel: 'rules' }` is a compile
 * error at every literal call site, not a URL the canonicalizer strips.
 */
const PANELS_BY_PAGE = {
  screen: SCREEN_PANEL_IDS,
  automation: AUTOMATION_PANEL_IDS,
} as const satisfies Partial<Record<DefaultPageId, readonly SettingsPanelId[]>>;

/** The Defaults pages that have an intra-page tab bar. */
export type TabbedPageId = keyof typeof PANELS_BY_PAGE;

/** The panel union owned by one tabbed page. */
export type PanelIdFor<P extends TabbedPageId> = (typeof PANELS_BY_PAGE)[P][number];

/**
 * The defaults kind, distributed over every page id so `panel` (the active
 * intra-page tab, carried on the route rather than each section privately
 * re-reading `?panel=`) is typed as that page's OWN panel union — untabbed
 * pages cannot carry one at all. The final member is the escape hatch for
 * callers holding a runtime-widened `DefaultPageId` (e.g. the sidebar
 * iterating its page list): a dynamic page is fine as long as no panel
 * rides along, so `{ page: someId }` type-checks while a mismatched
 * literal pair like `{ page: 'screen', panel: 'rules' }` never does.
 */
export type DefaultsRoute =
  | {
      [P in DefaultPageId]: { kind: 'defaults'; page: P } & (P extends TabbedPageId
        ? { panel?: PanelIdFor<P> }
        : { panel?: never });
    }[DefaultPageId]
  | { kind: 'defaults'; page: DefaultPageId; panel?: undefined };

export type SettingsRoute =
  | DefaultsRoute
  | { kind: 'display'; displayId: string; subtab: PerDisplaySubtab }
  | { kind: 'displays' };

const DEFAULT_PAGE_ID_SET: Set<string> = new Set(DEFAULT_PAGE_IDS);
const PER_DISPLAY_SUBTAB_SET: Set<string> = new Set(PER_DISPLAY_SUBTABS);

/**
 * Every query param the settings router owns. `settingsHref` clears these
 * before writing a route; `parseSettingsRoute` reads exactly these names.
 * Adding a routing param means adding it here AND teaching the parser —
 * everything else on the URL is foreign and passes through untouched.
 */
const ROUTE_OWNED_PARAMS = ['section', 'page', 'panel', 'id', 'subtab', 'highlight'] as const;

export interface SettingsHrefOptions {
  /**
   * Field id to arrive on (`?highlight=`) — the page scrolls to the matching
   * `data-field-id` element and pulses it, then strips the param.
   */
  highlight?: string;
  /**
   * Existing query params to carry into the new URL. Used by in-page tab
   * switches, which must preserve params the settings route does not own —
   * `syncEditorUrl` writes `display=` / `screen=` via raw
   * `history.replaceState`, so callers pass `window.location.search` (the
   * `useSearchParams` snapshot never observes those writes). Route-owned
   * params (`section`/`page`/`panel`/`id`/`subtab`) are replaced, and
   * `highlight` is dropped unless re-specified: it is a one-shot arrival
   * param, and carrying it across a tab switch would re-arm the pulse on a
   * tab where the field may not exist.
   */
  from?: URLSearchParams | string;
}

/**
 * Build the canonical query string (leading `?` included) for a settings
 * route — the inverse of `parseSettingsRoute`, so
 * `parseSettingsRoute(new URLSearchParams(settingsHref(route)))` round-trips
 * to the same route. The single place that knows the URL shape; components
 * never hand-write `?section=...` literals.
 */
export function settingsHref(route: SettingsRoute, options?: SettingsHrefOptions): string {
  const params = options?.from ? new URLSearchParams(options.from) : new URLSearchParams();
  for (const owned of ROUTE_OWNED_PARAMS) {
    params.delete(owned);
  }
  if (route.kind === 'defaults') {
    params.set('section', 'defaults');
    params.set('page', route.page);
    if (route.panel) params.set('panel', route.panel);
  } else if (route.kind === 'display') {
    params.set('section', 'display');
    params.set('id', route.displayId);
    params.set('subtab', route.subtab);
  } else {
    params.set('section', 'displays');
  }
  if (options?.highlight) params.set('highlight', options.highlight);
  return `?${params.toString()}`;
}

/**
 * Absolute form of `settingsHref` for links that originate outside the
 * settings page (config sections, toasts) and must navigate to it first.
 */
export function settingsPath(route: SettingsRoute, options?: SettingsHrefOptions): string {
  return `/editor/settings${settingsHref(route, options)}`;
}

/** The panel if it is valid for that page, otherwise undefined. */
export function validPanelFor(
  page: DefaultPageId,
  panel: string | null | undefined,
): SettingsPanelId | undefined {
  if (!panel) return undefined;
  // Widened lookup: PANELS_BY_PAGE only has keys for the tabbed pages.
  const allowed = (
    PANELS_BY_PAGE as Partial<Record<DefaultPageId, readonly SettingsPanelId[]>>
  )[page];
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
 *      A URL whose `section` is absent or didn't dispatch above (an
 *      unrecognized value, or `display` with no id) but that carries a
 *      `page` or `panel` param is parsed the same way — a hand-trimmed
 *      `?page=screen&panel=sleep` or a miscased `?section=Defaults&page=X`
 *      renders the intended page instead of silently losing it.
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
  // Reached with section absent, unrecognized, or dispatched nowhere — in
  // every case a present page/panel still names real intent, and the
  // canonicalizer normalizes the section param afterward.
  const sectionlessDefaults =
    section !== 'defaults' && (params.get('page') !== null || params.get('panel') !== null);
  if (section === 'defaults' || sectionlessDefaults) {
    const rawPage = params.get('page') ?? 'screen';
    if (DEFAULT_PAGE_ID_SET.has(rawPage)) {
      const page = rawPage as DefaultPageId;
      // An explicit `?panel=` passes through, validated against that page's
      // own panel set so a stray value can't stick. The cast is sound:
      // `validPanelFor` only returns panels legal for `page`, which is
      // exactly the correlation `DefaultsRoute` encodes — TS just can't see
      // it through two runtime-widened variables.
      const panel = validPanelFor(page, params.get('panel'));
      return panel
        ? ({ kind: 'defaults', page, panel } as DefaultsRoute)
        : { kind: 'defaults', page };
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

  // The rewrite target is built by settingsHref — the one serializer of the
  // URL grammar — so the canonicalizer can never disagree with the builder
  // about what a route looks like. `from: params` keeps unrelated params
  // (e.g. analytics tags), and `highlight` is re-passed explicitly: a
  // canonicalizing rewrite is not a navigation, so the one-shot arrival
  // param must survive it (settingsHref drops it by default because tab
  // SWITCHES must not carry it).
  const canonicalQuery = () =>
    settingsHref(route, {
      from: params,
      highlight: params.get('highlight') ?? undefined,
    }).slice(1); // redirectedQuery is bare — the page prepends the '?'

  if (route.kind === 'defaults') {
    const sectionParam = params.get('section');
    const pageParam = params.get('page');
    const panelParam = params.get('panel');
    const stale =
      // A `section` that dispatched nowhere (e.g. `section=display` with no
      // id) leaves the URL advertising a route that isn't rendering. Note
      // `route.panel`, when set, is always the URL's own `?panel=` value
      // (`validPanelFor` passes it through or drops it), so the rewrite
      // keeps a panel the route kept and strips one the route dropped.
      (sectionParam !== null && sectionParam !== 'defaults') ||
      (pageParam !== null && pageParam !== route.page) ||
      (panelParam !== null && panelParam !== (route.panel ?? null));
    if (!stale) return { route };
    return { route, redirectedQuery: canonicalQuery() };
  }
  if (route.kind === 'display') {
    const subtabParam = params.get('subtab');
    if (subtabParam === null || subtabParam === route.subtab) return { route };
    return { route, redirectedQuery: canonicalQuery() };
  }
  return { route };
}
