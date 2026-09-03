import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withDisplayAuth } from '@/lib/api-utils';
import { pickLanIpv4 } from '@/lib/hub-address';

export const dynamic = 'force-dynamic';

export interface HubAddressResponse {
  /** The origin a phone on the LAN can reach this hub at, or null if none is known. */
  origin: string | null;
}

/**
 * The hub's reachable origin, for a client whose own `window.location` is
 * `localhost` (a kiosk running on the hub Pi). Scheme and port are the ones
 * this request arrived on; only the host is replaced with the LAN IPv4.
 */
export const GET = withDisplayAuth(async (request: NextRequest) => {
  const ip = pickLanIpv4();
  if (!ip) return NextResponse.json({ origin: null } satisfies HubAddressResponse);
  const url = request.nextUrl;
  const port = url.port ? `:${url.port}` : '';
  return NextResponse.json({ origin: `${url.protocol}//${ip}${port}` } satisfies HubAddressResponse);
}, 'Failed to resolve the hub address');
