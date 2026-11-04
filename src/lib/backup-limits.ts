/**
 * The most a backup bundle may be when it is posted back or zipped: a full
 * icon library is 60 MB of pictures, a third more as base64. The library
 * pictures are not inside the bundle (they ride beside it in the zip), so
 * this stays the JSON's cap however large the library is.
 */
export const MAX_RESTORE_BYTES = 100 * 1024 * 1024;
