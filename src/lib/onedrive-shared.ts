/**
 * The client-safe half of the OneDrive source. `lib/onedrive.ts` reads
 * secrets and the token file, so the editor panel and the API routes cannot
 * import it for a constant or a validator without dragging fs in — these
 * live here instead, with one definition each.
 */

/** Hub-side shuffle happens over at most this many photos. */
export const ONEDRIVE_MAX_SAMPLE = 1000;

/**
 * Graph driveItem IDs as personal OneDrive mints them: base64-ish, plus the
 * `!` separator consumer drives use. Every route that takes an item ID from
 * a query param validates through this, so the accepted alphabet cannot
 * drift between the folder browser and the two display-facing routes.
 */
const ITEM_ID = /^[A-Za-z0-9!_.=-]{1,200}$/;

export function isOneDriveItemId(value: string): boolean {
  return ITEM_ID.test(value);
}
