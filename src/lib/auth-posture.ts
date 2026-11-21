/**
 * What `data/auth.json` says about access, decided in one place.
 *
 * Two readers look at that file: the gate in `src/proxy.ts`, which reads it
 * synchronously on every request, and the guards in `src/lib/auth.ts`, which
 * read it through the store. Each used to decide "is a password set" for
 * itself, with three different rules between them, so a hand-edited or
 * half-restored file could have the gate asking for a login the guards did
 * not want, or the other way round. Both now ask here.
 *
 * No `fs` import, so either reader can use it.
 */

export interface AuthPosture {
  /** A password is set, so the editor and the phone need a sign-in. */
  enabled: boolean;
  /** CIDR entries; anything that is not text is dropped. */
  ipAllowlist: string[];
  ipBypassAuth: boolean;
  ipRestrictAccess: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * True when the auth state holds a password.
 *
 * - No hash (`null`, a missing key, or an empty string) is "no password":
 *   nothing can be checked against it, so asking for a login would lock
 *   everyone out of a hub that has no password to give.
 * - Anything else counts as a password, including a value that is not text.
 *   That is not something the app writes, and a file that says something
 *   unreadable about its password is treated as locked, not open.
 * - A file that is not an object at all is locked for the same reason.
 */
export function hasPassword(raw: unknown): boolean {
  if (!isRecord(raw)) return true;
  const hash = raw.passwordHash;
  return hash !== null && hash !== undefined && hash !== '';
}

/** The access settings in an auth state, as both readers must see them. */
export function authPosture(raw: unknown): AuthPosture {
  const state = isRecord(raw) ? raw : {};
  return {
    enabled: hasPassword(raw),
    ipAllowlist: Array.isArray(state.ipAllowlist)
      ? state.ipAllowlist.filter((entry): entry is string => typeof entry === 'string')
      : [],
    ipBypassAuth: state.ipBypassAuth === true,
    ipRestrictAccess: state.ipRestrictAccess === true,
  };
}
