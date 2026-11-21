/**
 * The pasted link, short enough to read back on one line. A spreadsheet link is
 * mostly its document id, so the scheme and anything after the path are dropped
 * before the middle of it is.
 */
export function sheetLabel(url: string): string {
  const bare = url.replace(/^https?:\/\//, '').split(/[?#]/)[0];
  return bare.length > 48 ? `${bare.slice(0, 47)}…` : bare;
}
