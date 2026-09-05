import { NextResponse } from 'next/server';
import { cachedProxyRoute, fetchWithTimeout } from '@/lib/api-utils';
import { readConfig } from '@/lib/config';
import { RADAR_INDEX_PATH, resolveRadarServerUrl } from '@/lib/radar-server';
import type { RadarIndexResponse } from '@/lib/rain-map-types';

export const dynamic = 'force-dynamic';

/**
 * Frame index for the rain map, read from the configured radar server
 * (LibreWXR's public instance unless Settings > Weather names another). The
 * response's `host` is rewritten to that server: a self-hosted instance
 * reports whatever LIBREWXR_PUBLIC_URL says, which is often `localhost`, and
 * the displays must fetch tiles from the address the hub was actually given.
 */
const { GET, cache } = cachedProxyRoute<RadarIndexResponse, string>({
  auth: 'display',
  ttlMs: 5 * 60 * 1000,
  prepare: async () => {
    let configured: string | undefined;
    try {
      configured = (await readConfig()).settings?.weather?.radarServerUrl;
    } catch { /* config not available: use the default server */ }
    return resolveRadarServerUrl(configured);
  },
  cacheKey: (server) => server,
  execute: async (server) => {
    const res = await fetchWithTimeout(`${server}${RADAR_INDEX_PATH}`);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Radar server returned ${res.status}` },
        { status: 502 },
      );
    }
    const index = (await res.json()) as RadarIndexResponse;
    return { ...index, host: server };
  },
  errorMessage: 'Failed to fetch rain map data',
});

/** @internal */
export { GET, cache };
