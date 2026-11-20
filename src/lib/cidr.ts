/**
 * What makes an allowlist entry valid, with no server imports so the editor
 * refuses a bad one as it is typed and the hub refuses the same ones on
 * save. An entry is a plain IPv4 address ("192.168.1.1") or one with a
 * prefix ("192.168.1.0/24").
 */

/** What is wrong with an entry: its shape, its address, or its prefix. */
export type CidrFault = 'format' | 'address' | 'prefix';

/** Four numbers from 0 to 255 with dots between, and no leading zeros (as Node's `net.isIPv4`). */
export function isIPv4Text(value: string): boolean {
  const octets = value.split('.');
  return octets.length === 4 && octets.every((o) => /^(0|[1-9]\d{0,2})$/.test(o) && Number(o) <= 255);
}

/** Null for a valid entry, otherwise which part of it is wrong. */
export function cidrFault(entry: string): CidrFault | null {
  const parts = entry.split('/');
  if (parts.length > 2) return 'format';
  if (!isIPv4Text(parts[0])) return 'address';
  if (parts.length === 2) {
    const prefix = Number(parts[1]);
    // The text must be the number as it would be written: "08" and "" are not prefixes.
    if (!Number.isInteger(prefix) || parts[1] !== String(prefix) || prefix < 0 || prefix > 32) return 'prefix';
  }
  return null;
}
