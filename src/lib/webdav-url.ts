/**
 * The storage folder's address, checked the same way in the editor (as it is
 * typed) and on the hub (before it is saved). Pure, so the editor can use
 * it.
 */
import { isHomeHost } from './home-host';

/** Why an address cannot be a storage folder. Each maps to one sentence. */
export type FolderUrlProblem = 'invalid' | 'scheme' | 'credentials';

/**
 * The folder address as it will be used, always ending in `/`, or why it
 * cannot be one. The name and password live in their own fields: an address
 * carrying them would be saved, logged and shown where the password field
 * never is.
 */
export function parseFolderUrl(raw: unknown): { url: string } | { problem: FolderUrlProblem } {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2000) return { problem: 'invalid' };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { problem: 'invalid' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { problem: 'scheme' };
  if (url.username || url.password) return { problem: 'credentials' };
  if (!url.hostname) return { problem: 'invalid' };
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return { url: url.toString() };
}

/** A plain http address that leaves the home: the password could be read on the way. */
export function warnsPlainHttp(raw: string): boolean {
  const parsed = parseFolderUrl(raw);
  if (!('url' in parsed)) return false;
  const url = new URL(parsed.url);
  return url.protocol === 'http:' && !isHomeHost(url.hostname);
}

/** The part of the address worth showing on one line: the host, and the port when it is not the usual one. */
export function folderHostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
