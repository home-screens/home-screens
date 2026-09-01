'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resolveSettingsRoute, type DefaultPageId, type SettingsPanelId, type SettingsRoute } from '@/lib/settings-route';

interface SettingsRouteState {
  /** The resolved route — content branches key off its `kind`. */
  route: SettingsRoute;
  /**
   * The intra-page tab of the active Defaults page. Carried on the route so
   * the sections no longer parse `?panel=` themselves and can't drift from
   * what the URL resolved to.
   */
  panel: SettingsPanelId | undefined;
}

/**
 * The URL is the single source of truth for settings content routing.
 * `useSearchParams` re-renders the caller whenever Next's router updates —
 * so browser back/forward, `router.push` from the sidebar, and every
 * `<Link>` click all stay in sync without a popstate listener.
 *
 * The URL shape — `?section=defaults&page=X`, `?section=display&id=X&subtab=Y`,
 * `?section=displays` — is parsed by the pure helpers in
 * `lib/settings-route.ts`, hoisted out so they can be unit-tested without a
 * `window`. This hook is the client half: it resolves the route and flushes
 * the canonical query string back into the URL bar.
 */
export function useSettingsRoute(landingPage: DefaultPageId = 'screen'): SettingsRouteState {
  const router = useRouter();
  const searchParams = useSearchParams();

  // The `redirectedQuery` field tells the effect below whether the URL bar
  // needs to be rewritten to the canonical shape (including the bare-URL
  // landing page, which is rewritten to name the page explicitly).
  const { route, redirectedQuery } = useMemo(
    () => resolveSettingsRoute(searchParams?.toString() ?? '', { landingPage }),
    [searchParams, landingPage],
  );

  // One-shot URL canonicalization. The pure helper above already
  // resolved the route, so the first render shows the right content.
  // This effect just flushes the canonical query string into the URL bar
  // when a stale param needs normalizing. No-op on every pass after
  // the first.
  //
  // Re-resolved from window.location at replace time rather than reusing
  // the memoized `redirectedQuery`: `syncEditorUrl` writes `display=` /
  // `screen=` via raw history.replaceState, which `useSearchParams` never
  // observes, so replacing with the stale snapshot could silently drop
  // params added after it was taken.
  useEffect(() => {
    if (!redirectedQuery) return;
    const { redirectedQuery: fresh } = resolveSettingsRoute(window.location.search, { landingPage });
    if (fresh) router.replace(`?${fresh}`);
  }, [redirectedQuery, router, landingPage]);

  return {
    route,
    panel: route.kind === 'defaults' ? route.panel : undefined,
  };
}
