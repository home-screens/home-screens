/**
 * Whether a server is inside the home. Pure, no imports, so the editor can
 * use it as an address is typed. Only used to decide whether to warn: a
 * plain http storage folder, or a network share, that is reached across the
 * internet.
 */

const PRIVATE_SUFFIXES = ['.local', '.lan', '.home', '.internal', '.home.arpa', '.localdomain'];

/**
 * A private or loopback address, a name with no dots (a NAS called `nas`),
 * or one of the names home routers hand out.
 */
export function isHomeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) return true;
  if (PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (host.includes(':')) {
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  }
  return false;
}
