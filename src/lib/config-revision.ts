/**
 * Header carrying the config's revision between the hub and its clients.
 *
 * The revision is a content hash of the config as the hub last read it (see
 * `configRevision` in `lib/config.ts`). `GET /api/config` returns it; the
 * editor sends it back on `PUT /api/config` so the hub can refuse to overwrite
 * a config that changed under it (a phone, another laptop, a remote profile
 * switch) with a 409 carrying the newer config. Client-safe: the hashing
 * itself stays server-side.
 */
export const CONFIG_REVISION_HEADER = 'X-Config-Revision';
