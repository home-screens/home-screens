import { NextResponse } from 'next/server';
import { cachedProxyRoute, fetchWithTimeout } from '@/lib/api-utils';
import type { RainViewerResponse } from '@/lib/rain-map-types';

export const dynamic = 'force-dynamic';

const { GET, cache } = cachedProxyRoute<RainViewerResponse>({
  auth: 'display',
  ttlMs: 5 * 60 * 1000,
  execute: async () => {
    const res = await fetchWithTimeout('https://api.rainviewer.com/public/weather-maps.json');
    if (!res.ok) {
      return NextResponse.json(
        { error: `RainViewer API returned ${res.status}` },
        { status: 502 },
      );
    }
    return await res.json();
  },
  errorMessage: 'Failed to fetch rain map data',
});

/** @internal */
export { GET, cache };
