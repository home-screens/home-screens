'use client';

import { useCallback } from 'react';
import { useOrigin } from '@/hooks/useOrigin';
import { mealieLinkFor } from '@/lib/meal-sources';

/**
 * Links to Mealie as a phone, a laptop or a QR code can open them: every link
 * to Mealie on the phone, in the editor and on the wall goes through this.
 *
 * A family running Mealie on the hub saves `http://localhost:9925`; such a
 * link takes the address the hub is reached at instead (`mealieLinkFor`).
 * That is this browser's own host, or, on the hub's own kiosk, the hub's
 * address on the home network, where a QR code's phone can reach it too.
 * Until that is known (a tick after mount) links read as saved.
 */
export function useMealieLink(): (url: string) => string {
  const origin = useOrigin();
  return useCallback((url: string) => mealieLinkFor(url, hostnameOf(origin)), [origin]);
}

function hostnameOf(origin: string): string | undefined {
  try {
    return origin ? new URL(origin).hostname : undefined;
  } catch {
    return undefined;
  }
}
