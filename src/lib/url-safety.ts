/**
 * Shared SSRF prevention utilities.
 *
 * Any server-side code that fetches a user-supplied URL should call
 * `isSafeExternalUrl()` (or at minimum `isBlockedHost()`) before making
 * the request. Code that downloads a document should not call these itself:
 * `fetchWithAllowedRedirects` in `guarded-fetch.ts` runs them on every
 * redirect hop and caps the body.
 *
 * Two layers of defense:
 *  1. Fast-path string check (`isBlockedHost`) — rejects obvious literal
 *     private/loopback addresses (IPv4 and IPv6) without a DNS round-trip.
 *  2. DNS-resolved check (`isSafeExternalUrl`) — resolves the hostname and
 *     validates EVERY resulting IP against the same blocklist. Catches a
 *     public-looking name such as `evil.com` that resolves to `127.0.0.1`.
 *
 * Neither of those is the last word, because a fetch resolves the name again
 * when it connects, and whoever runs the name's DNS can answer the check
 * with a public address and the connection with a private one. So the fetch
 * itself has to connect through `checkedLookup` (wired up in
 * `pinned-fetch.ts`): the address it hands the socket is the address it
 * just checked, so there is no second answer to swap in. The two checks
 * above stay in front of it as the quick refusal with a clear reason.
 *
 * Results are NOT cached, here or there. A previous version of this file
 * kept a 60-second resolved-IP cache for performance, which only widened the
 * gap between the answer that was checked and the answer that was used.
 */

import { promises as dns, type LookupAddress } from 'dns';
import type { LookupFunction } from 'net';

// --- Domain validation ---

function matchesDomain(hostname: string, pattern: string): boolean {
  if (pattern === '*') return true; // caller already checked isBlockedHost
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return hostname === suffix || hostname.endsWith('.' + suffix);
  }
  return hostname === pattern;
}

/** The host list alone, with no opinion on private addresses. */
export function matchesAllowedHost(url: string, allowedDomains: string[]): boolean {
  try {
    const { hostname } = new URL(url);
    return allowedDomains.some((pattern) => matchesDomain(hostname, pattern));
  } catch {
    return false;
  }
}

export function isAllowedDomain(url: string, allowedDomains: string[], allowLan: boolean): boolean {
  try {
    const { hostname } = new URL(url);
    // Without allowLan, apply the strict SSRF blocklist (rejects all private
    // ranges and loopback). With allowLan, reject only the targets that are
    // dangerous regardless of permission: cloud metadata + unspecified.
    if (!allowLan && isBlockedHost(hostname)) return false;
    if (allowLan) {
      const lit = hostname.toLowerCase();
      if (lit === '0.0.0.0' || lit === '169.254.169.254') return false;
    }
    return allowedDomains.some((pattern) => matchesDomain(hostname, pattern));
  } catch {
    return false;
  }
}

// ── IPv6 range checks ────────────────────────────────────────────────────

/**
 * The IPv4 address an IPv6 literal carries, in the mapped form (::ffff:) or
 * the old compatible one (::), however it was written. `new URL()` rewrites
 * `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, so a check that only knew the
 * dotted form never saw the address inside a URL. The literal is put through
 * the same parser first, so every spelling (dotted, hex, zeros written out)
 * arrives here as one.
 */
function embeddedIPv4(v: string): string | null {
  let canonical: string;
  try {
    canonical = new URL(`http://[${v}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const m = canonical.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!m) return null;
  const high = parseInt(m[1], 16);
  const low = parseInt(m[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}
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
  // An IPv4 address inside an IPv6 one is judged as that IPv4 address.
  const v4 = embeddedIPv4(v);
  if (v4) return isBlockedHost(v4);

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

  // Always re-resolve, through the system resolver a connection uses. This
  // answer is not the one the fetch connects with (see `checkedLookup`), so
  // it is only the early, well-worded refusal.
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

// ── Relaxed variant: LAN-allowed (localNetwork permission) ───────────────
//
// The strict blocklist above is right for plugins that talk to public SaaS
// APIs. Self-hosted LAN services (Home Assistant, Plex, Proxmox, Octoprint)
// live on RFC1918 addresses, so those plugins would never succeed. A plugin
// that declares the `localNetwork` permission opts into this relaxed path:
//
//   Still blocked:
//     - AWS/GCP/Azure cloud metadata endpoints (169.254.169.254, fd00:ec2::254)
//     - Unspecified addresses (0.0.0.0, ::) — routable to anything
//     - Invalid / empty hosts
//
//   Now allowed (user consented via `localNetwork` permission):
//     - Loopback (127/8, ::1) — single-box installs (HA + HS on same host)
//     - RFC1918 private (10/8, 172.16/12, 192.168/16)
//     - Link-local / APIPA (169.254/16, except the metadata IP)
//     - IPv6 ULA (fc00::/7) and link-local (fe80::/10)
//
// Every resolved address is still checked, and checked again at connect
// time by `checkedLookup('home-network')`.
function isBlockedHostForLan(hostname: string): boolean {
  if (hostname === '' || hostname === '0.0.0.0') return true;
  // Bracketed or bare IPv6
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return isBlockedIPv6ForLan(hostname);
  }
  if (hostname.includes(':')) {
    return isBlockedIPv6ForLan(hostname);
  }
  const parts = hostname.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    // Cloud metadata — always blocked regardless of permission
    if (parts[0] === 169 && parts[1] === 254 && parts[2] === 169 && parts[3] === 254) return true;
  }
  return false;
}

function isBlockedIPv6ForLan(addr: string): boolean {
  let v = addr.toLowerCase();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  const zoneIdx = v.indexOf('%');
  if (zoneIdx >= 0) v = v.slice(0, zoneIdx);

  if (v === '') return true;
  if (v === '::' || v === '0:0:0:0:0:0:0:0') return true;    // unspecified
  // AWS IPv6 metadata
  if (v === 'fd00:ec2::254' || v === 'fd00:ec2:0:0:0:0:0:254') return true;
  // An IPv4 address inside an IPv6 one, under the same LAN rules.
  const v4 = embeddedIPv4(v);
  if (v4) return isBlockedHostForLan(v4);
  return false;
}

/**
 * Relaxed variant of `isSafeExternalUrl`: allows loopback, RFC1918, mDNS and
 * link-local addresses (see the list above), still blocks cloud-metadata
 * endpoints and the unspecified address.
 *
 * Only for a fetch the household opted into by name: a plugin that declares
 * the `localNetwork` permission, or a calendar or news feed saved with "Home
 * network" on. Every other user-supplied URL goes through `isSafeExternalUrl`.
 */
export async function isSafeLocalOrExternalUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

  if (isBlockedHostForLan(parsed.hostname)) return false;

  const hostForLookup = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname;

  let addresses: string[];
  try {
    const results = await dns.lookup(hostForLookup, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;

  for (const addr of addresses) {
    if (isBlockedHostForLan(addr)) return false;
  }
  return true;
}

// ── The check at connect time ────────────────────────────────────────────

/**
 * Which addresses a fetch may connect to: `public` is the strict rule
 * (`isSafeExternalUrl`), `home-network` the relaxed one a household opted
 * into (`isSafeLocalOrExternalUrl`).
 */
export type AddressRule = 'public' | 'home-network';

const ADDRESS_BLOCKED = 'EADDRBLOCKED';

/** Whether one resolved address is off limits under a rule. */
export function isBlockedAddress(address: string, rule: AddressRule): boolean {
  return rule === 'home-network' ? isBlockedHostForLan(address) : isBlockedHost(address);
}

/**
 * A `lookup` for `net.connect` / `tls.connect` that resolves a name and
 * refuses it unless every address it resolves to passes the rule. Whatever
 * it hands back is what the socket connects to, so the address that was
 * checked and the address that is used are one answer, not two.
 *
 * A name with even one blocked address is refused outright rather than
 * narrowed to its good ones, the same as the up-front checks: a public name
 * that also answers with a private address is not a name to trust.
 *
 * Node skips `lookup` for a host that is already an address, so a literal
 * never comes through here. It cannot change between check and connect
 * either, and the up-front checks have already judged it.
 */
export function checkedLookup(rule: AddressRule): LookupFunction {
  return (hostname, options, callback) => {
    const wantsAll = typeof options === 'object' && options !== null && options.all === true;
    const family = typeof options === 'object' && options !== null && typeof options.family === 'number' ? options.family : 0;
    const settle = callback as (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;
    dns.lookup(hostname, { all: true, verbatim: true, family }).then(
      (found) => {
        if (found.length === 0 || found.some((entry) => isBlockedAddress(entry.address, rule))) {
          settle(addressBlockedError(hostname));
          return;
        }
        if (wantsAll) settle(null, found);
        else settle(null, found[0].address, found[0].family);
      },
      (error: NodeJS.ErrnoException) => settle(error),
    );
  };
}

function addressBlockedError(hostname: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`${hostname} resolves to an address that may not be reached`);
  error.code = ADDRESS_BLOCKED;
  return error;
}

/**
 * Whether a failed fetch failed because `checkedLookup` refused the address.
 * A fetch wraps the socket's error as its `cause`, sometimes more than once.
 */
export function isAddressBlockedError(error: unknown): boolean {
  for (let depth = 0, at: unknown = error; depth < 5 && at instanceof Error; depth++, at = at.cause) {
    if ((at as NodeJS.ErrnoException).code === ADDRESS_BLOCKED) return true;
    if (at instanceof AggregateError && at.errors.some((inner) => isAddressBlockedError(inner))) return true;
  }
  return false;
}
