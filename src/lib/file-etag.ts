import { createHash } from 'crypto';
import { readBuildId } from './build-id';
import { fileSignature } from './file-signature';

/**
 * The ETag of an answer built from data files, worked out without reading
 * the answer: the running build (an upgrade can change what the same files
 * answer), each file's identity (every store write lands through a rename,
 * so each write is a new inode, size or mtime) and whatever else the answer
 * turns on (the household's day, a save counter). The heartbeat hands the
 * same values to walls, so a wall fetches a list only when it changed.
 */
export async function fileEtag(files: readonly string[], ...extra: string[]): Promise<string> {
  const parts = await Promise.all([readBuildId(), ...files.map(fileSignature)]);
  const hash = createHash('sha256').update([...parts, ...extra].join('|')).digest('hex').slice(0, 24);
  return `"${hash}"`;
}

/**
 * Headers for an answer a browser may keep but must check before every reuse.
 * Browsers then send the ETag back on their own, and an unchanged answer is a
 * bodiless 304 that `fetch` still hands the page as the kept 200.
 */
export function revalidatedHeaders(etag: string): Record<string, string> {
  return { ETag: etag, 'Cache-Control': 'no-cache' };
}

/** Whether the request already holds the answer `etag` names. */
export function holdsEtag(request: Request, etag: string): boolean {
  return request.headers.get('if-none-match') === etag;
}
