/**
 * `localhost`, `*.localhost`, `127.x`, `::1` (bracketed or not), `0.0.0.0`:
 * a name for whichever machine reads it. Printed on a wall or followed from a
 * phone, an address like that points at the phone, not at the hub.
 */
export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h.startsWith('127.') || h === '[::1]' || h === '::1' || h === '0.0.0.0';
}
