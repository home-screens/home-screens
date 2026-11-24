/**
 * Humanize the raw client address that `getClientIP` returned from the
 * server-stamped `x-hs-client-ip` header (the TCP peer address). IPv6 loopback
 * collapses to "localhost"; IPv4-mapped-IPv6 addresses drop their
 * `::ffff:` prefix so the editor shows plain dotted-quad IPs instead of
 * mixed-form strings; everything else is passed through. Returns null
 * for an empty / missing value so the caller can skip rendering the row.
 */
export function formatClientAddress(addr: string | undefined | null): string | null {
  if (!addr) return null;
  const trimmed = addr.trim();
  if (!trimmed) return null;
  if (trimmed === '::1' || trimmed === '127.0.0.1' || trimmed === 'localhost') {
    return 'localhost';
  }
  if (trimmed.toLowerCase().startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}
