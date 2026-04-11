import net from 'net';

const MAPPED_V4_PREFIX = /^::ffff:/i;

/**
 * Normalize IPv4-mapped IPv6 addresses to plain IPv4.
 * Node.js often reports 127.0.0.1 as ::ffff:127.0.0.1.
 */
export function normalizeIp(ip: string): string {
  if (MAPPED_V4_PREFIX.test(ip)) {
    const v4 = ip.replace(MAPPED_V4_PREFIX, '');
    if (net.isIPv4(v4)) return v4;
  }
  return ip;
}

/**
 * Validate a CIDR string. Returns null if valid, error message if not.
 * Accepts plain IPv4 ("192.168.1.1") or CIDR ("192.168.1.0/24").
 */
export function validateCidr(entry: string): string | null {
  const parts = entry.split('/');
  if (parts.length > 2) return 'Invalid CIDR format';

  const ip = parts[0];
  if (!net.isIPv4(ip)) return 'Invalid IP address';

  if (parts.length === 2) {
    const prefix = Number(parts[1]);
    if (!Number.isInteger(prefix) || parts[1] !== String(prefix) || prefix < 0) return 'Invalid prefix length';
    if (prefix > 32) return 'Prefix length must be 0-32';
  }

  return null;
}

/** Convert an IPv4 address string to a 32-bit integer. */
function ipToInt(ip: string): number {
  const parts = ip.split('.');
  return ((+parts[0]) << 24 | (+parts[1]) << 16 | (+parts[2]) << 8 | (+parts[3])) >>> 0;
}

/**
 * Check if an IP address matches any entry in a CIDR allowlist.
 * Normalizes IPv4-mapped IPv6 before matching. Bare IPs are treated as /32.
 *
 * Fails safe: garbage entries (non-IPv4, out-of-range prefix) are skipped,
 * never treated as match-all. Entries passed through validateCidr() in the
 * PUT handler are guaranteed clean, but a hand-edited auth.json with a typo
 * like "foo/24" would otherwise match any IP in 0.0.0.0/24 (because +"foo"
 * coerces to NaN which becomes 0 under bitwise).
 */
export function isIpAllowed(ip: string, allowlist: string[]): boolean {
  const normalized = normalizeIp(ip);
  if (!net.isIPv4(normalized)) return false;

  const ipNum = ipToInt(normalized);

  for (const entry of allowlist) {
    const [cidrIp, prefixStr] = entry.split('/');
    if (!net.isIPv4(cidrIp)) continue; // fail-safe: skip garbage

    const prefix = prefixStr != null ? +prefixStr : 32;
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) continue;

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    const networkNum = ipToInt(cidrIp);

    if ((ipNum & mask) === (networkNum & mask)) return true;
  }

  return false;
}
