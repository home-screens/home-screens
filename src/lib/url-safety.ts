/**
 * Shared SSRF prevention utilities.
 *
 * Any server-side code that fetches a user-supplied URL should call
 * `isSafeExternalUrl()` (or at minimum `isBlockedHost()`) before making
 * the request.
 *
 * Two layers of defense:
 *  1. Fast-path string check (`isBlockedHost`) — rejects obvious literal
 *     private/loopback addresses (IPv4 and IPv6) without a DNS round-trip.
 *  2. DNS-resolved check (`isSafeExternalUrl`) — resolves the hostname and
 *     validates EVERY resulting IP against the same blocklist. Closes the
 *     DNS-rebinding gap where `evil.com` resolves to `127.0.0.1`.
 *
 * IMPORTANT: results are NOT cached. A previous version of this file kept
 * a 60-second resolved-IP cache for performance. That cache re-introduced
 * the rebinding window it was meant to defend against — an attacker could
 * present a public IP on the first lookup, get cached, then rebind to a
 * private IP for the next 60 seconds while subsequent fetches did their
 * own (now-stale) DNS lookup. We always re-resolve so the safety check and
 * the actual fetch see the same addresses.
 */

import { promises as dns } from 'dns';

// ── IPv6 range checks ────────────────────────────────────────────────────
//
// We can't blanket-block bracketed IPv6 because legitimate dual-stack APIs
// and CDNs return AAAA records. Match the actual private/internal ranges
// instead, parallel to the IPv4 check below.
function isBlockedIPv6(addr: string): boolean {
  // Normalize: lowercase, strip brackets, strip zone id (e.g. fe80::1%eth0)
  let v = addr.toLowerCase();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  const zoneIdx = v.indexOf('%');
  if (zoneIdx >= 0) v = v.slice(0, zoneIdx);

  if (v === '') return true;
  // Loopback ::1 (and unspecified ::)
  if (v === '::1' || v === '0:0:0:0:0:0:0:1') return true;
  if (v === '::' || v === '0:0:0:0:0:0:0:0') return true;
  // Link-local fe80::/10 — first 10 bits are 1111 1110 10
  // First two hex digits in [fe80, febf]; lookahead handles short forms.
  if (/^fe[89ab](?:[0-9a-f])?:/.test(v)) return true;
  // Unique local fc00::/7 — first 7 bits are 1111 110
  // First two hex digits in [fc00, fdff].
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return true;
  // IPv4-mapped IPv6 ::ffff:a.b.c.d — validate the embedded IPv4
  const v4Mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Mapped) return isBlockedHost(v4Mapped[1]);
  // Deprecated IPv4-compatible ::a.b.c.d
  const v4Compat = v.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Compat) return isBlockedHost(v4Compat[1]);

  return false;
}

/**
 * Returns true when a hostname is a literal private, loopback, link-local,
 * or cloud-metadata address that should never be reached via user-supplied
 * URLs. Handles IPv4 dotted-decimal, bracketed IPv6, and bare IPv6 (which
 * is what `dns.lookup` returns for AAAA records).
 *
 * For DNS names, this returns false on its own — use `isSafeExternalUrl`
 * to validate after resolution.
 */
export function isBlockedHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '0.0.0.0') return true;
  // Bracketed literal IPv6 (e.g. [::1], [2001:db8::1])
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return isBlockedIPv6(hostname);
  }
  // Bare IPv6 (e.g. ::1, 2001:db8::1) — what dns.lookup returns for AAAA
  if (hostname.includes(':')) {
    return isBlockedIPv6(hostname);
  }
  // IPv4 ranges
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    if (parts[0] === 10) return true;                                  // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true;            // 192.168.0.0/16
    if (parts[0] === 127) return true;                                 // 127.0.0.0/8
    if (parts[0] === 169 && parts[1] === 254) return true;            // 169.254.0.0/16 link-local
  }
  return false;
}

/**
 * Reject URLs that point at private/internal networks (SSRF prevention).
 *
 * Only allows http: and https: protocols. Two-stage validation:
 *   1. Fast-path: literal host blocked by `isBlockedHost` → reject without DNS.
 *   2. DNS-resolved: every resolved address must pass `isBlockedHost`. This
 *      catches DNS rebinding (e.g. `evil.com` → 127.0.0.1) and IPv6 internal
 *      addresses returned via AAAA records.
 *
 * Returns false on any error (DNS failure, parse error, blocked address).
 */
export async function isSafeExternalUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  // Fast-path: reject obvious literal private hosts before DNS lookup
  if (isBlockedHost(parsed.hostname)) return false;

  // Strip IPv6 brackets if present (e.g. [2001:db8::1] → 2001:db8::1)
  const hostForLookup = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;

  // Always re-resolve. dns.lookup uses the system resolver (matches what
  // fetch() does under the hood) so the safety check and the subsequent
  // fetch see the same addresses. Caching here would re-introduce the
  // DNS-rebinding window we're trying to close.
  let addresses: string[];
  try {
    const results = await dns.lookup(hostForLookup, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    // Resolution failure → treat as unsafe
    return false;
  }
  if (addresses.length === 0) return false;

  // Every resolved address must pass the blocklist. isBlockedHost handles
  // both bare IPv4 and bare IPv6 forms returned by dns.lookup directly.
  for (const addr of addresses) {
    if (isBlockedHost(addr)) return false;
  }
  return true;
}
