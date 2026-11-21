/**
 * A file's identity without reading it: inode, size and mtime. Every writer
 * replaces the file or rewrites it in place, so any change moves at least
 * one of the three. `missing` when there is no file.
 *
 * No imports, so the request gate in `src/proxy.ts` (a synchronous stat) and
 * the stores (an awaited one) can both build the same string.
 */
export function statSignature(stat: { ino: number; size: number; mtimeMs: number } | undefined): string {
  return stat ? `${stat.ino}:${stat.size}:${stat.mtimeMs}` : 'missing';
}
