'use client';

import { useEffect, useState } from 'react';
import { fetchMealieCookbooks, type MealFetch } from '@/lib/meal-client';
import type { MealieCookbook } from '@/lib/mealie';

/**
 * The household's Mealie cookbooks for a row of filter chips, or none while
 * they load or when Mealie does not answer: the chips are a shortcut, and
 * the search and the other chips work without them. Shared by the phone's
 * Library and pickers and the editor's picker.
 *
 * `refresh` changing asks again (Mealie answering after an outage, the
 * search's `recovered`); a failed ask keeps the cookbooks already shown.
 */
export function useMealieCookbooks(fetcher: MealFetch, enabled = true, refresh = 0): MealieCookbook[] {
  const [cookbooks, setCookbooks] = useState<MealieCookbook[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchMealieCookbooks(fetcher, controller.signal).then(setCookbooks, () => {});
    return () => controller.abort();
  }, [fetcher, enabled, refresh]);
  return cookbooks;
}
