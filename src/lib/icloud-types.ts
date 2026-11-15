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
  /** A screen-sized JPEG of a photo, when Apple keeps one beside a larger
   *  `url` (new-format albums). The wall is served this; a download that is
   *  kept (a rotating background) takes `url`. */
  previewUrl?: string;
  /** Apple's stable per-item GUID — the signed URLs churn on every resolve,
   *  so this is the only durable identity (e.g. for cache filenames). */
  guid: string;
}

/**
 * What a slideshow list needs to know about an album item: which one it is
 * and what kind, with no link. The wall is handed hub addresses by guid, so
 * a list never has to ask Apple for links (the slow part on the legacy
 * backend); they are looked up when an item is served.
 */
export interface ICloudAlbumEntry {
  guid: string;
  type: 'image' | 'video';
  /** A video with a poster frame to show while it loads. */
  hasPoster: boolean;
}
