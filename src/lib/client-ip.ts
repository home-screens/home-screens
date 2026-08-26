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
