/**
 * Where automatic backups are sent: a WebDAV folder or a network share (SMB).
 * One at a time. Pure, so the editor can read the summary types.
 *
 * The full destination, password included, lives only in
 * `data/auto-backup-secrets.json` and inside a backup's locked keys. Routes
 * answer `DestinationSummary`, which never carries the password.
 */

/** "Check it works" saves this file in the folder and removes it again. */
export const TEST_FILE_NAME = 'home-screens-test.txt';
export const TEST_FILE_TEXT = 'Home Screens saved this file to check it can reach this folder. It removes it again straight away.\n';

export interface WebdavDestination {
  kind: 'webdav';
  /** The folder's address, ending in `/`. */
  url: string;
  username: string;
  password: string;
}

export interface ShareDestination {
  kind: 'smb';
  host: string;
  /** Only when the address named one. */
  port?: number;
  share: string;
  /** The folder inside the share, `/`-separated, empty for the share itself. */
  folder: string;
  username: string;
  /** From a `DOMAIN\name` typed in the Name box. */
  domain?: string;
  password: string;
}

export type StorageDestination = WebdavDestination | ShareDestination;
export type StorageKind = StorageDestination['kind'];

/** The part of a destination that says which server it is: the same-server rule needs nothing else. */
export type StorageServer = { kind: 'webdav'; url: string } | { kind: 'smb'; host: string; port?: number };

export type DestinationSummary =
  | { kind: 'webdav'; url: string; username: string }
  | { kind: 'smb'; host: string; port?: number; share: string; folder: string; username: string; domain?: string };

function text(value: unknown): value is string {
  return typeof value === 'string';
}

/** A saved or restored destination, or undefined when it is malformed. */
export function sanitizeDestination(raw: unknown): StorageDestination | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const v = raw as Record<string, unknown>;
  if (!text(v.username) || !text(v.password)) return undefined;
  if (v.kind === 'webdav' && text(v.url)) {
    return { kind: 'webdav', url: v.url, username: v.username, password: v.password };
  }
  if (v.kind === 'smb' && text(v.host) && v.host && text(v.share) && v.share && text(v.folder)) {
    const port = typeof v.port === 'number' && Number.isInteger(v.port) && v.port > 0 && v.port <= 65535 ? v.port : undefined;
    return {
      kind: 'smb',
      host: v.host,
      ...(port !== undefined ? { port } : {}),
      share: v.share,
      folder: v.folder,
      username: v.username,
      ...(text(v.domain) && v.domain ? { domain: v.domain } : {}),
      password: v.password,
    };
  }
  return undefined;
}

function origin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The same kind on the same server: only then may an empty password box
 * keep the saved password. Otherwise changing the address would send the
 * saved password to whatever server was typed, which is a way to read it out.
 */
export function sameServer(a: StorageServer, b: StorageServer): boolean {
  if (a.kind === 'webdav' && b.kind === 'webdav') {
    const left = origin(a.url);
    return left !== null && left === origin(b.url);
  }
  if (a.kind === 'smb' && b.kind === 'smb') {
    return a.host.toLowerCase() === b.host.toLowerCase() && (a.port ?? 445) === (b.port ?? 445);
  }
  return false;
}

/** Everything but the password, for the editor and the status answer. */
export function destinationSummary(dest: StorageDestination): DestinationSummary {
  if (dest.kind === 'webdav') return { kind: 'webdav', url: dest.url, username: dest.username };
  return {
    kind: 'smb',
    host: dest.host,
    ...(dest.port !== undefined ? { port: dest.port } : {}),
    share: dest.share,
    folder: dest.folder,
    username: dest.username,
    ...(dest.domain ? { domain: dest.domain } : {}),
  };
}

/** Where the files land, as one string, to tell whether a change moved them somewhere else. */
export function destinationPlace(dest: StorageDestination): string {
  if (dest.kind === 'webdav') return `webdav ${dest.url} ${dest.username}`;
  return `smb ${dest.host.toLowerCase()}:${dest.port ?? 445}/${dest.share.toLowerCase()}/${dest.folder} ${dest.domain ?? ''}\\${dest.username}`;
}
