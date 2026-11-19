/**
 * A network share's address, checked the same way in the editor (as it is
 * typed) and on the hub (before it is saved). Pure, so the editor can use it.
 *
 * Families copy the address from their computer, so both spellings are
 * taken: `\\nas.local\Backups\home-screens` (Windows) and
 * `smb://nas.local/Backups/home-screens` (a Mac, Linux). Everything after the
 * share is a folder inside it, which Home Screens makes when it is missing.
 */
import { isHomeHost } from './home-host';

export interface ShareAddress {
  host: string;
  /** Only when the address names one; SMB's own port is used otherwise. */
  port?: number;
  share: string;
  /** The folder inside the share, `/`-separated, empty for the share itself. */
  folder: string;
}

/** Why an address cannot be a share. Each maps to one sentence. */
export type ShareAddressProblem = 'invalid' | 'no-share' | 'credentials' | 'bad-character';

const MAX_ADDRESS = 2000;
const MAX_SHARE = 80;
const MAX_PART = 255;
// What Windows refuses in a file or folder name, plus control characters.
const FORBIDDEN = /[<>:"|?*\u0000-\u001f]/;
const HOST = /^(\[[0-9a-f:.]+\]|[a-z0-9]([a-z0-9._-]*[a-z0-9])?)$/i;

function splitHostPort(raw: string): { host: string; port?: number } | null {
  const bracketed = /^(\[[^\]]+\])(?::(\d{1,5}))?$/.exec(raw);
  const plain = /^([^:]+)(?::(\d{1,5}))?$/.exec(raw);
  const match = bracketed ?? plain;
  if (!match) return null;
  const host = match[1];
  if (!HOST.test(host)) return null;
  if (match[2] === undefined) return { host };
  const port = Number(match[2]);
  if (port < 1 || port > 65535) return null;
  return { host, port };
}

/**
 * The address as it will be used, or why it cannot be one. A name or
 * password inside the address is refused: they have their own boxes, and an
 * address is saved, logged and shown where the password never is.
 */
export function parseShareAddress(raw: unknown): ShareAddress | { problem: ShareAddressProblem } {
  if (typeof raw !== 'string') return { problem: 'invalid' };
  const text = raw.trim();
  if (!text || text.length > MAX_ADDRESS) return { problem: 'invalid' };

  let authority: string;
  let parts: string[];
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text);
  if (scheme) {
    if (scheme[1].toLowerCase() !== 'smb') return { problem: 'invalid' };
    // Either slash separates: people paste `smb://nas/Backups` and then type
    // a Windows-style `\home-screens` after it.
    const rest = text.slice(scheme[0].length);
    const slash = rest.search(/[\\/]/);
    authority = slash === -1 ? rest : rest.slice(0, slash);
    if (authority.includes('@')) return { problem: 'credentials' };
    try {
      parts = (slash === -1 ? '' : rest.slice(slash + 1)).split(/[\\/]/).map((part) => decodeURIComponent(part));
    } catch {
      return { problem: 'invalid' };
    }
  } else {
    // `\\host\share`, `//host/share`, or the same without the leading pair.
    const [first, ...rest] = text.replace(/^[\\/]{2}/, '').split(/[\\/]/);
    authority = first;
    if (authority.includes('@')) return { problem: 'credentials' };
    parts = rest;
  }

  const server = splitHostPort(authority);
  if (!server) return { problem: 'invalid' };
  const named = parts.map((part) => part.trim()).filter((part) => part !== '');
  if (named.length === 0) return { problem: 'no-share' };
  const [share, ...folder] = named;
  // A separator that arrives percent-encoded (`%5C`, `%2F`) is a character in a name, which no share allows.
  if (named.some((part) => part === '.' || part === '..' || FORBIDDEN.test(part) || /[\\/]/.test(part))) {
    return { problem: 'bad-character' };
  }
  if (share.length > MAX_SHARE || folder.some((part) => part.length > MAX_PART)) return { problem: 'invalid' };
  return { ...server, share, folder: folder.join('/') };
}

/** The address the way a computer shows it: `\\host\share\folder`, or `smb://` when it names a port. */
export function formatShareAddress(address: ShareAddress): string {
  const parts = [address.share, ...(address.folder ? address.folder.split('/') : [])];
  if (address.port !== undefined) {
    return `smb://${address.host}:${address.port}/${parts.map(encodeURIComponent).join('/')}`;
  }
  return `\\\\${address.host}\\${parts.join('\\')}`;
}

/** The same address with another share in it, keeping the folder: the share list's buttons. */
export function withShare(raw: string, share: string): string | null {
  const parsed = parseShareAddress(raw);
  if ('problem' in parsed) return null;
  return formatShareAddress({ ...parsed, share });
}

/** Which kind of storage an address is for, from how it starts: pasting one switches the form's choice. */
export function addressKind(raw: string): 'smb' | 'webdav' | null {
  const text = raw.trim().toLowerCase();
  if (text.startsWith('\\\\') || text.startsWith('smb://')) return 'smb';
  if (text.startsWith('http://') || text.startsWith('https://')) return 'webdav';
  return null;
}

/** A share outside the home: SMB is not made to be reached across the internet. */
export function warnsOutsideHome(raw: string): boolean {
  const parsed = parseShareAddress(raw);
  return !('problem' in parsed) && !isHomeHost(parsed.host);
}

/** `DOMAIN\name` from the Name box, for work-style networks. A plain name has no domain. */
export function splitAccountName(raw: string): { username: string; domain?: string } {
  const name = raw.trim();
  const slash = name.indexOf('\\');
  if (slash <= 0 || slash === name.length - 1) return { username: name };
  return { domain: name.slice(0, slash), username: name.slice(slash + 1) };
}
