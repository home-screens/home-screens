/**
 * Shared display-item contract for the two iCloud shared-album backends
 * (icloud-album.ts legacy sharedstreams, icloud-link.ts CloudKit). Lives in a
 * neutral module so neither backend has to reach into its sibling for the
 * shape they both produce.
 */
export interface ICloudAlbumItem {
  url: string;
  type: 'image' | 'video';
  posterUrl?: string;
  /** Apple's stable per-item GUID — the signed URLs churn on every resolve,
   *  so this is the only durable identity (e.g. for cache filenames). */
  guid: string;
}
