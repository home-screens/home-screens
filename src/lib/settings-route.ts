/**
 * Pure URL parser + redirect helper for the settings page.
 *
 * The sidebar URL shape:
 *   - `?section=defaults&page=display`             — a Defaults source-of-truth page
 *   - `?section=display&id=kitchen&subtab=display` — a per-display drill-down page
 *   - `?section=displays`                          — the all-displays card grid
 *
 * Extracted from `app/(editor)/editor/settings/page.tsx` so the legacy
 * `?tab=X` redirect can be unit-tested without a `window`. The existing test
 * environment is `node`, not `jsdom`, and the original parser was buried
 * inside a client component that touched `window.history.replaceState` —
 * both blockers to a simple test. Everything in this file is intentionally
 * `string`-in / data-out so the tests don't need any DOM.
 */

/**
 * Canonical list of every Defaults page id. Mirrors `DEFAULT_PAGES` in
 * `SettingsSidebar.tsx` but lives here so the route parser can validate
 * against it without importing client components. New defaults pages
 * must be added in BOTH places — sidebar for rendering, here for routing.
 */
export const DEFAULT_PAGE_IDS = [
  'display',
  'sleep',
  'alerts',
  'location',
  'language',
  'weather',
  'calendar',
  'meals',
  'profiles',
  'integrations',
  'security',
  'data',
  'stats',
  'system',
  'network',
  'docs',
] as const;

export type DefaultPageId = (typeof DEFAULT_PAGE_IDS)[number];

/**
 * Sub-tabs on a per-display drill-down page. Mirrors `PER_DISPLAY_SUBTABS`
 * in `display/PerDisplayPage.tsx` — kept here so the route parser can
 * validate the `subtab` param without dragging a client component into
 * the lib graph.
 */
export const PER_DISPLAY_SUBTABS = [
  'overview',
  'display',
  'sleep',
  'alerts',
  'profile',
  'identity',
] as const;

export type PerDisplaySubtab = (typeof PER_DISPLAY_SUBTABS)[number];

/**
 * Resolved settings route. Three discriminated kinds:
 *   - `defaults` — render a Defaults source-of-truth page
 *   - `display`  — render a per-display drill-down page
 *   - `displays` — render the all-displays index
 */
export type SettingsRoute =
  | { kind: 'defaults'; page: DefaultPageId }
  | { kind: 'display'; displayId: string; subtab: PerDisplaySubtab }
  | { kind: 'displays' };

/**
 * Map a legacy `?tab=X` value (from the old flat sidebar) onto the new
 * section/page shape. Bookmarks survive: anyone visiting an old URL
 * lands on the right content on the first render and the page rewrites
 * the URL bar to the canonical form.
 */
export const LEGACY_TAB_REDIRECTS: Record<string, SettingsRoute> = {
  display: { kind: 'defaults', page: 'display' },
  sleep: { kind: 'defaults', page: 'sleep' },
  alerts: { kind: 'defaults', page: 'alerts' },
  location: { kind: 'defaults', page: 'location' },
  language: { kind: 'defaults', page: 'language' },
  weather: { kind: 'defaults', page: 'weather' },
  calendar: { kind: 'defaults', page: 'calendar' },
  meals: { kind: 'defaults', page: 'meals' },
  profiles: { kind: 'defaults', page: 'profiles' },
  integrations: { kind: 'defaults', page: 'integrations' },
  security: { kind: 'defaults', page: 'security' },
  data: { kind: 'defaults', page: 'data' },
  stats: { kind: 'defaults', page: 'stats' },
  system: { kind: 'defaults', page: 'system' },
  network: { kind: 'defaults', page: 'network' },
  docs: { kind: 'defaults', page: 'docs' },
  displays: { kind: 'displays' },
  // Hidden routes that briefly existed — bookmarks of those collapse to
  // the proper Defaults pages.
  'default-display': { kind: 'defaults', page: 'display' },
  'default-sleep': { kind: 'defaults', page: 'sleep' },
  'default-alerts': { kind: 'defaults', page: 'alerts' },
};

const DEFAULT_PAGE_ID_SET: Set<string> = new Set(DEFAULT_PAGE_IDS);
const PER_DISPLAY_SUBTAB_SET: Set<string> = new Set(PER_DISPLAY_SUBTABS);

/**
 * Pure URL parser. Takes a `URLSearchParams` and returns the resolved
 * `SettingsRoute`. Used from a `useMemo` in the page component so the
 * route derives directly from the current URL without a popstate listener.
 *
 * Order matters:
 *   1. Legacy `?tab=X` wins so old bookmarks land on the right page
 *      before the canonicalization rewrite fires.
 *   2. `?section=display` requires a non-empty `id` to dispatch to
 *      a per-display page; an unrecognized `subtab` falls back to
 *      `overview`.
 *   3. `?section=displays` is the all-displays index.
 *   4. `?section=defaults&page=X` validates against `DEFAULT_PAGE_IDS`.
 *   5. Unknown / missing params land on `defaults/display`, the
 *      first-visit landing page.
 */
export function parseSettingsRoute(params: URLSearchParams): SettingsRoute {
  const legacyTab = params.get('tab');
  if (legacyTab && LEGACY_TAB_REDIRECTS[legacyTab]) {
    return LEGACY_TAB_REDIRECTS[legacyTab];
  }

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
  if (section === 'defaults') {
    const rawPage = params.get('page') ?? 'display';
    if (DEFAULT_PAGE_ID_SET.has(rawPage)) {
      return { kind: 'defaults', page: rawPage as DefaultPageId };
    }
  }
  return { kind: 'defaults', page: 'display' };
}

/**
 * Resolve a query string to its parsed route AND, if a legacy `?tab=X`
 * key was present, the canonical query string the page should rewrite
 * the URL bar to. Returns `redirectedQuery: undefined` when no rewrite
 * is needed.
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

  const legacyTab = params.get('tab');
  if (!legacyTab || !LEGACY_TAB_REDIRECTS[legacyTab]) {
    return { route };
  }

  // Build the canonical query string the page should rewrite to. We keep
  // any unrelated params (e.g. analytics tags) so navigation context isn't
  // silently dropped on the redirect.
  const next = new URLSearchParams(params);
  next.delete('tab');
  if (route.kind === 'defaults') {
    next.set('section', 'defaults');
    next.set('page', route.page);
  } else if (route.kind === 'displays') {
    next.set('section', 'displays');
    next.delete('page');
  } else if (route.kind === 'display') {
    // Defensive — currently no legacy `?tab=X` maps to a per-display
    // route, but if a future redirect adds one we want the canonical
    // query string to carry the id and subtab too.
    next.set('section', 'display');
    next.set('id', route.displayId);
    next.set('subtab', route.subtab);
  }
  return { route, redirectedQuery: next.toString() };
}
