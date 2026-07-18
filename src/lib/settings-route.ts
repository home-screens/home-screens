/**
 * Pure URL parser + redirect helper for the settings page.
 *
 * The sidebar URL shape:
 *   - `?section=defaults&page=screen`                — a Defaults source-of-truth page
 *   - `?section=display&id=kitchen&subtab=overrides` — a per-display drill-down page
 *   - `?section=displays`                            — the all-displays card grid
 *
 * Extracted from `app/(editor)/editor/settings/page.tsx` so the legacy
 * `?tab=X` redirect can be unit-tested without a `window`. The existing test
 * environment is `node`, not `jsdom`, and the original parser was buried
 * inside a client component that touched `window.history.replaceState` —
 * both blockers to a simple test. Everything in this file is intentionally
 * `string`-in / data-out so the tests don't need any DOM.
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
 * Old page ids stay routable via `LEGACY_PAGE_REDIRECTS` below.
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
 * Defaults → Screen page). Old subtab ids map via
 * `LEGACY_SUBTAB_REDIRECTS`.
 */
export const PER_DISPLAY_SUBTABS = ['overview', 'overrides'] as const;

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
 * Map a retired `?section=defaults&page=X` value onto the page that
 * absorbed it. These were canonical URLs between the Phase-4 settings
 * split and the page-merge reorganization, so bookmarks and stale links
 * from that window must keep landing on real content. `docs` maps to
 * `screen` (the landing page) because the docs list moved out of the
 * settings content area entirely — it's a footer link now.
 */
export const LEGACY_PAGE_REDIRECTS: Record<string, DefaultPageId> = {
  display: 'screen',
  sleep: 'screen',
  alerts: 'screen',
  profiles: 'automation',
  rules: 'automation',
  'shared-state': 'automation',
  docs: 'screen',
};

/**
 * Map a retired `?subtab=X` value onto the subtab that absorbed it.
 * Unknown values (not listed here, not in `PER_DISPLAY_SUBTABS`) still
 * fall back to `overview`.
 */
export const LEGACY_SUBTAB_REDIRECTS: Record<string, PerDisplaySubtab> = {
  display: 'overrides',
  sleep: 'overrides',
  alerts: 'overrides',
  profile: 'overview',
  identity: 'overview',
};

/**
 * Map a legacy `?tab=X` value (from the old flat sidebar) onto the new
 * section/page shape. Bookmarks survive: anyone visiting an old URL
 * lands on the right content on the first render and the page rewrites
 * the URL bar to the canonical form.
 */
export const LEGACY_TAB_REDIRECTS: Record<string, SettingsRoute> = {
  display: { kind: 'defaults', page: 'screen' },
  sleep: { kind: 'defaults', page: 'screen' },
  alerts: { kind: 'defaults', page: 'screen' },
  location: { kind: 'defaults', page: 'location' },
  // Language was merged into the Location page on 2026-05-17 — the
  // standalone "Language & region" tab no longer exists. Legacy
  // `?tab=language` bookmarks land on the merged page so the language
  // picker (now rendered above the location form) is still one click away.
  language: { kind: 'defaults', page: 'location' },
  weather: { kind: 'defaults', page: 'weather' },
  calendar: { kind: 'defaults', page: 'calendar' },
  meals: { kind: 'defaults', page: 'meals' },
  profiles: { kind: 'defaults', page: 'automation' },
  rules: { kind: 'defaults', page: 'automation' },
  integrations: { kind: 'defaults', page: 'integrations' },
  security: { kind: 'defaults', page: 'security' },
  data: { kind: 'defaults', page: 'data' },
  stats: { kind: 'defaults', page: 'stats' },
  system: { kind: 'defaults', page: 'system' },
  network: { kind: 'defaults', page: 'network' },
  docs: { kind: 'defaults', page: 'screen' },
  displays: { kind: 'displays' },
  // Hidden routes that briefly existed — bookmarks of those collapse to
  // the proper Defaults pages.
  'default-display': { kind: 'defaults', page: 'screen' },
  'default-sleep': { kind: 'defaults', page: 'screen' },
  'default-alerts': { kind: 'defaults', page: 'screen' },
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
 *      a per-display page; a retired `subtab` maps through
 *      `LEGACY_SUBTAB_REDIRECTS` and an unrecognized one falls back
 *      to `overview`.
 *   3. `?section=displays` is the all-displays index.
 *   4. `?section=defaults&page=X` validates against `DEFAULT_PAGE_IDS`,
 *      mapping retired page ids through `LEGACY_PAGE_REDIRECTS`.
 *   5. Unknown / missing params land on `defaults/screen`, the
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
        : LEGACY_SUBTAB_REDIRECTS[rawSubtab] ?? 'overview';
      return { kind: 'display', displayId: id, subtab };
    }
  }
  if (section === 'displays') {
    return { kind: 'displays' };
  }
  if (section === 'defaults') {
    const rawPage = params.get('page') ?? 'screen';
    if (DEFAULT_PAGE_ID_SET.has(rawPage)) {
      return { kind: 'defaults', page: rawPage as DefaultPageId };
    }
    if (LEGACY_PAGE_REDIRECTS[rawPage]) {
      return { kind: 'defaults', page: LEGACY_PAGE_REDIRECTS[rawPage] };
    }
  }
  return { kind: 'defaults', page: 'screen' };
}

/**
 * Resolve a query string to its parsed route AND, if a legacy `?tab=X`
 * key, a retired `page` id, or a retired `subtab` id was present, the
 * canonical query string the page should rewrite the URL bar to.
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

  const legacyTab = params.get('tab');
  const hasLegacyTab = !!legacyTab && !!LEGACY_TAB_REDIRECTS[legacyTab];
  // A retired `page` / `subtab` value only counts as legacy when the parser
  // actually consumed it — e.g. `?section=defaults&page=sleep` needs a
  // rewrite, but a stray `page=sleep` on a `?section=displays` URL doesn't
  // change what renders and isn't worth a history rewrite.
  const hasLegacyPage =
    route.kind === 'defaults' &&
    params.get('section') === 'defaults' &&
    !!params.get('page') &&
    !DEFAULT_PAGE_ID_SET.has(params.get('page')!) &&
    !!LEGACY_PAGE_REDIRECTS[params.get('page')!];
  const hasLegacySubtab =
    route.kind === 'display' &&
    !!params.get('subtab') &&
    !PER_DISPLAY_SUBTAB_SET.has(params.get('subtab')!) &&
    !!LEGACY_SUBTAB_REDIRECTS[params.get('subtab')!];

  if (!hasLegacyTab && !hasLegacyPage && !hasLegacySubtab) {
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
    next.set('section', 'display');
    next.set('id', route.displayId);
    next.set('subtab', route.subtab);
  }
  return { route, redirectedQuery: next.toString() };
}
