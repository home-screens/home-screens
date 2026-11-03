/**
 * Client-IP resolution shared by the http-server patch (instrumentation) and
 * every consumer that makes a security decision on the caller's address.
 *
 * Threat model: the hub runs Next.js directly on the Pi with no fronting
 * reverse proxy, so `X-Forwarded-For` / `X-Real-IP` are fully
 * attacker-supplied. They must never be trusted for the IP allowlist, the
 * IP-restrict gate, or login rate-limit bucketing. Instead,
 * `instrumentation.ts` installs a patch (see `server-ip-patch.ts`) that
 * stamps `CLIENT_IP_HEADER` from the real TCP peer address on every incoming
 * request, overwriting anything the client sent. Consumers read only that
 * header.
 *
 * Deployments that DO front the hub with a reverse proxy can set
 * `HS_TRUSTED_PROXIES` (comma-separated list of exact proxy IPs, e.g.
 * `127.0.0.1`) — when the TCP peer is one of those addresses, the
 * `X-Forwarded-For` chain it forwarded is honored by walking it right to
 * left past trusted hops. Default: trust no proxies.
 *
 * `normalizeIp` is shared with `ip-allowlist.ts` so "which IP is this?" and
 * "is this IP allowed?" can never disagree about an edge case like
 * `::ffff:garbage`.
 */
import { normalizeIp } from './ip-allowlist';

/**
 * Server-stamped header carrying the resolved client IP. Written only by
 * `server-ip-patch.ts` (which overwrites any client-supplied value), read by
 * `getClientIP` (api-utils) and `extractIp` (proxy).
 */
export const CLIENT_IP_HEADER = 'x-hs-client-ip';

/**
 * Server-stamped header carrying the address the request arrived ON (the
 * socket's local address). It names the adapter the browser is actually
 * using, which a route lookup toward the client cannot: with two adapters on
 * different subnets, `ip route get <client>` answers with the default route
 * for any client on a third subnet. Written by `server-ip-patch.ts`.
 */
export const LOCAL_IP_HEADER = 'x-hs-local-ip';

/**
 * Server-stamped header: `1` when the TCP peer is one of HS_TRUSTED_PROXIES,
 * so a forwarded header (`X-Forwarded-Host`) describes the real client, and
 * `0` otherwise. Written by `server-ip-patch.ts` over anything the client sent.
 */
export const VIA_TRUSTED_PROXY_HEADER = 'x-hs-via-trusted-proxy';

/**
 * The `X-Forwarded-Host` a trusted proxy sent, or null. Any client can write
 * the header, so it counts only when the TCP peer is one of
 * HS_TRUSTED_PROXIES; from anywhere else it is ignored and the `Host` header
 * stands. A chain (`public.lan, 127.0.0.1:3000`) names the outermost host first.
 */
export function trustedForwardedHost(input: { forwardedHost: string | null; viaTrustedProxy: boolean }): string | null {
  if (!input.viaTrustedProxy || !input.forwardedHost) return null;
  const first = input.forwardedHost.split(',')[0].trim();
  return first || null;
}

/**
 * The origin the caller reached this hub on (`http://192.168.1.10:3000`),
 * for a URL the caller must be able to follow back: an OAuth redirect, the
 * script a Pi pipes into bash. Read from the `Host` header because
 * `request.url` names the bind address (`0.0.0.0`). `X-Forwarded-Host` and
 * `X-Forwarded-Proto` count only behind a trusted proxy; from anyone else
 * they are ignored rather than believed.
 */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const viaTrustedProxy = request.headers.get(VIA_TRUSTED_PROXY_HEADER) === '1';
  const host =
    trustedForwardedHost({ forwardedHost: request.headers.get('x-forwarded-host'), viaTrustedProxy }) ??
    request.headers.get('host') ??
    url.host;
  const forwardedProto = viaTrustedProxy
    ? request.headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase()
    : undefined;
  const proto = forwardedProto === 'http' || forwardedProto === 'https' ? forwardedProto : url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/** Whether a request's TCP peer is one of the trusted proxies. */
export function isTrustedProxyPeer(peerAddress: string | null | undefined, trustedProxies: string[]): boolean {
  const peer = peerAddress ? normalizeIp(peerAddress) : '';
  return peer !== '' && trustedProxies.includes(peer);
}

/** Parse the HS_TRUSTED_PROXIES env value (comma-separated exact IPs). */
export function parseTrustedProxies(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => normalizeIp(s))
    .filter(Boolean);
}

/**
 * Resolve the effective client IP for a request.
 *
 * - Peer not in `trustedProxies` (the default — the list is empty unless
 *   HS_TRUSTED_PROXIES is set): the answer is the TCP peer itself. Any
 *   forwarded header is ignored as attacker-controlled.
 * - Peer IS a trusted proxy: walk the `X-Forwarded-For` chain right to left,
 *   skipping trusted hops; the first untrusted address is the client. If
 *   every hop is trusted, fall back to the leftmost entry.
 * - No peer address at all (socket already gone): 'unknown', which fails
 *   closed — it never matches an allowlist entry, and rate limiting
 *   degrades to one shared bucket.
 */
export function resolveClientIp(
  peerAddress: string | null | undefined,
  forwardedFor: string | null | undefined,
  trustedProxies: string[],
): string {
  const peer = peerAddress ? normalizeIp(peerAddress) : '';
  if (!peer) return 'unknown';
  if (!forwardedFor || !trustedProxies.includes(peer)) return peer;

  const chain = forwardedFor.split(',').map(normalizeIp).filter(Boolean);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!trustedProxies.includes(chain[i])) return chain[i];
  }
  return chain[0] ?? peer;
}
