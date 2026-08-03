'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { settingsHref } from '@/lib/settings-route';
import type { PanelIdFor, SettingsRoute, TabbedPageId } from '@/lib/settings-route';

/**
 * Tab-switch navigation for a tabbed Defaults page (Screen, Automation).
 * Generic over the page so each caller's callback only accepts that page's
 * OWN panel ids — `useNavigateToPanel('screen')('rules')` is a compile
 * error, not a self-rewriting URL.
 *
 * Pushes (not replaces) so the back button walks tabs, matching
 * PerDisplayPage's subtab navigation. Builds from `window.location.search`
 * rather than the `useSearchParams` snapshot, and drops the one-shot
 * `highlight` param — see `SettingsHrefOptions.from` in `settings-route.ts`
 * for why both matter.
 */
export function useNavigateToPanel<P extends TabbedPageId>(page: P) {
  const router = useRouter();
  return useCallback(
    (next: PanelIdFor<P>) => {
      // Cast: TS cannot correlate the generic `page` with `next` against the
      // distributed DefaultsRoute union, but the signature above guarantees
      // exactly that pairing.
      const route = { kind: 'defaults', page, panel: next } as SettingsRoute;
      router.push(settingsHref(route, { from: window.location.search }));
    },
    [router, page],
  );
}
