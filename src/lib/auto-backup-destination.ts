import { sameServer, type ShareDestination, type StorageDestination, type StorageKind, type StorageServer, type WebdavDestination } from './storage-destination';
import { parseFolderUrl } from './webdav-url';
import { parseShareAddress, splitAccountName } from './share-address';

const MAX_FIELD = 500;

export interface DestinationRefusal {
  error: string;
  code: string;
}

type Place = Omit<WebdavDestination, 'username' | 'password'> | Omit<ShareDestination, 'username' | 'password' | 'domain'>;

/** The address part of a request body, as a destination without its sign-in, or why it cannot be one. */
function placeFromBody(v: Record<string, unknown>): Place | DestinationRefusal {
  if (v.kind === 'smb') {
    const parsed = parseShareAddress(v.address);
    if ('problem' in parsed) {
      const error = parsed.problem === 'no-share'
        ? 'Add the share\'s name after the server, such as \\\\nas.local\\Backups.'
        : parsed.problem === 'credentials'
          ? 'Put the name and password in their own boxes, not in the address.'
          : parsed.problem === 'bad-character'
            ? 'The share address has a character a shared folder cannot use.'
            : 'That is not a share address. Type it like \\\\nas.local\\Backups.';
      return { error, code: `address_${parsed.problem.replace('-', '_')}` };
    }
    return { kind: 'smb', ...parsed };
  }
  if (v.kind !== 'webdav') return { error: 'Choose a network share or WebDAV.', code: 'kind_invalid' };
  const parsed = parseFolderUrl(v.url);
  if (!('url' in parsed)) {
    const error = parsed.problem === 'scheme'
      ? 'The folder address must start with http:// or https://.'
      : parsed.problem === 'credentials'
        ? 'Put the name and password in their own boxes, not in the address.'
        : 'That folder address is not a web address.';
    return { error, code: `url_${parsed.problem}` };
  }
  return { kind: 'webdav', url: parsed.url };
}

/**
 * The storage folder in a request body: `{ kind: 'webdav', url, ... }` or
 * `{ kind: 'smb', address, ... }`, with `username` and `password`. An empty
 * password means "keep the saved one", but only for the same kind on the
 * same server: otherwise changing the address would send the saved password
 * to whatever server was typed, which is a way to read it out.
 */
export function destinationFromBody(raw: unknown, saved: StorageDestination | undefined): StorageDestination | DestinationRefusal {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const place = placeFromBody(v);
  if ('error' in place) return place;
  const typedName = typeof v.username === 'string' ? v.username.trim() : '';
  if (!typedName || typedName.length > MAX_FIELD) {
    return { error: 'Type the name you sign in to your storage with.', code: 'username_required' };
  }
  let password = typeof v.password === 'string' ? v.password : '';
  if (password.length > MAX_FIELD) return { error: 'That password is too long.', code: 'password_too_long' };
  const account = place.kind === 'smb' ? splitAccountName(typedName) : { username: typedName };
  const candidate = { ...place, ...account, password } as StorageDestination;
  if (!password && saved && sameServer(saved, candidate)) password = saved.password;
  if (!password) return { error: 'Type the password you sign in to your storage with.', code: 'password_required' };
  return { ...candidate, password };
}

/**
 * Which server the form's address points at, or null while it is not a
 * usable address. The editor uses it with `sameServer` to show "leave empty
 * to keep the saved one" only when the hub would keep it.
 */
export function draftServer(kind: StorageKind, address: string): StorageServer | null {
  const place = placeFromBody(kind === 'smb' ? { kind, address } : { kind, url: address });
  return 'error' in place ? null : place;
}

export function isDestinationRefusal(value: StorageDestination | DestinationRefusal): value is DestinationRefusal {
  return 'error' in value;
}

export const MAX_SECRET_FIELD = MAX_FIELD;
