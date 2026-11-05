/**
 * The Immich API key permissions Home Screens uses, and how the hub tells the
 * editor that a key is missing one. Pure, so the hub's routes and the
 * editor's notes read the same names.
 *
 * Immich answers a valid key that lacks a permission with 403 "Missing
 * required permission: <name>", and a wrong key with 401. A household that
 * scopes its key to the bare minimum (often `asset.read` and `asset.view`,
 * which is all the wall needs) must still see the filters it can use, with a
 * plain note where a list is hidden, rather than "API key invalid".
 *
 * Checked against Immich v3.0.1's API spec:
 * - `asset.read`: finding photos (random and paged search)
 * - `asset.view`: showing pictures and playing videos
 * - `album.read`: the album list
 * - `person.read`: the people list and their face pictures
 * - `server.about`: optional, only shows the server version
 */

export type ImmichPermission = 'asset.read' | 'asset.view' | 'album.read' | 'person.read' | 'server.about';

/** The body of the hub's 403 when the Immich key is missing a permission. */
export interface ImmichMissingPermission {
  error: 'missing-permission';
  permission: ImmichPermission;
}

export function missingPermissionBody(permission: ImmichPermission): ImmichMissingPermission {
  return { error: 'missing-permission', permission };
}

const PERMISSIONS: ReadonlySet<string> = new Set<ImmichPermission>([
  'asset.read', 'asset.view', 'album.read', 'person.read', 'server.about',
]);

/** The permission a failed hub answer says the Immich key lacks, or null for any other failure. */
export function missingImmichPermission(failure: { status: number; body: unknown } | null): ImmichPermission | null {
  if (!failure || failure.status !== 403) return null;
  const body = failure.body as Partial<ImmichMissingPermission> | null;
  if (body?.error !== 'missing-permission' || typeof body.permission !== 'string') return null;
  return PERMISSIONS.has(body.permission) ? body.permission : null;
}
