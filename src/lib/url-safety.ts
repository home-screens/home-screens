/**
 * Shared SSRF prevention utilities.
 *
 * Any server-side code that fetches a user-supplied URL should call
 * `isSafeExternalUrl()` (or at minimum `isBlockedHost()`) before making
 * the request.
 */

/**
 * Returns true when a hostname resolves to a private, loopback,
 * link-local, or cloud-metadata address that should never be
 * reached via user-supplied URLs.
 */
export function isBlockedHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '0.0.0.0') return true;
  if (hostname.startsWith('[')) return true; // block all IPv6 (incl. [::1], [::ffff:127.0.0.1])
  // Block private/reserved IPv4 ranges
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
 * Only allows http: and https: protocols, and blocks all private/reserved hosts.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return !isBlockedHost(parsed.hostname);
  } catch {
    return false;
  }
}
