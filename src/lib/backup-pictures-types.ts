/**
 * The Pictures choice and its summary, with no server imports, so the phone
 * and the editor can type the labels without pulling the library walk in.
 */

/** `used`: every file the config points at; `all`: the whole library;
 *  `off`: a backup without pictures, the JSON file. */
export type PictureBackupChoice = 'off' | 'used' | 'all';

export interface PictureBackupCount {
  count: number;
  bytes: number;
}

export interface PictureBackupSummary {
  used: PictureBackupCount;
  all: PictureBackupCount;
  /** Config references to files and folders the library does not hold, which
   *  no backup can carry. */
  missing: number;
}
