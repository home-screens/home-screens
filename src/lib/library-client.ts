'use client';

import { editorFetch, sessionExpired } from '@/lib/editor-fetch';
import { readJson, refusalMessage } from '@/lib/hub-request';
import type { MediaUse } from '@/lib/media-usage';

/**
 * Client-side counterpart to `library-files.ts` (the server's filesystem
 * plumbing): the media-library wire shapes and mutations shared by the
 * editor's `useImageLibrary` and the /remote Photos tab.
 */

/** One entry of `GET /api/backgrounds/directories`. */
export interface DirectoryInfo {
  name: string;
  path: string;
  imageCount: number;
}

/** The library-relative path a serve URL points at (its `file=` param,
 *  decoded), or null for anything that is not a library serve URL. */
export function libraryFileFromServeUrl(serveUrl: string): string | null {
  return new URL(serveUrl, 'http://localhost').searchParams.get('file') || null;
}

/** Outcome of one library delete, for every surface that offers one. */
export interface DeleteLibraryResult {
  ok: boolean;
  status: number;
  /** On a 409 the server refused because something still shows the file;
   *  this lists where, so the caller can say so instead of "failed". Empty
   *  for every other outcome. */
  usage: MediaUse[];
}

/**
 * Unique display names of the things still using a file (screens, modules'
 * screens), for a "still in use on X and Y" line. Empty when the server knew
 * only that the file is used, not by what.
 */
export function usageNames(usage: readonly MediaUse[]): string[] {
  return [...new Set(usage.map((use) => use.name).filter((name): name is string => !!name))];
}

/**
 * Delete one library file by its library-relative path (`folder/name`).
 * Splits it into the directory-plus-basename shape the DELETE endpoint
 * expects and folds the response into a `DeleteLibraryResult`. A network
 * failure or an expired session still throws, as `editorFetch` does.
 */
export async function deleteLibraryFile(libraryPath: string): Promise<DeleteLibraryResult> {
  const parts = libraryPath.split('/');
  const basename = parts.pop() || '';
  const directory = parts.join('/');

  const res = await editorFetch('/api/backgrounds', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: basename, directory: directory || undefined }),
  });
  // 404: it is already gone, which is what was wanted anyway.
  if (res.ok || res.status === 404) return { ok: true, status: res.status, usage: [] };
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { usage?: unknown };
    return { ok: false, status: 409, usage: Array.isArray(body.usage) ? body.usage as MediaUse[] : [] };
  }
  return { ok: false, status: res.status, usage: [] };
}

/**
 * Delete a library file given its serve URL
 * (`/api/backgrounds/serve?file=<dir>/<name>`). Returns null without issuing
 * a request when the URL carries no `file` param.
 */
export async function deleteLibraryImage(imageUrl: string): Promise<DeleteLibraryResult | null> {
  const file = libraryFileFromServeUrl(imageUrl);
  if (!file) return null;
  return deleteLibraryFile(file);
}

/** Outcome of a folder or move operation: the server's message on failure. */
export interface LibraryActionResult<T = undefined> {
  ok: boolean;
  status: number;
  error?: string;
  data?: T;
}

async function libraryAction<T>(url: string, method: string, body: unknown): Promise<LibraryActionResult<T>> {
  const res = await editorFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await readJson(res)) as T | null;
  return res.ok
    ? { ok: true, status: res.status, data: data ?? undefined }
    : { ok: false, status: res.status, error: refusalMessage(data, '') || undefined };
}

export interface MoveLibraryResult {
  moved: { from: string; to: string }[];
  /** Left behind: each is the last picture a slideshow has to show. */
  kept: { path: string; usage: MediaUse[] }[];
  rewritten: number;
  /** Config revision after the rewrite, so an editor copy can catch up. */
  revision: string;
  /** Config revision the rewrite was applied to. */
  previousRevision: string;
}

/** Move files into a folder ('' for the top level); references follow. */
export function moveLibraryFiles(files: string[], directory: string): Promise<LibraryActionResult<MoveLibraryResult>> {
  return libraryAction('/api/backgrounds/move', 'POST', { files, directory });
}

export function createLibraryFolder(name: string, parent?: string): Promise<LibraryActionResult<{ path: string }>> {
  return libraryAction('/api/backgrounds/directories', 'POST', parent ? { name, parent } : { name });
}

export interface RenameFolderResult {
  from: string;
  to: string;
  rewritten: number;
  revision: string;
  previousRevision: string;
}

/** Rename a folder in place; references to its files follow. */
export function renameLibraryFolder(path: string, name: string): Promise<LibraryActionResult<RenameFolderResult>> {
  return libraryAction('/api/backgrounds/directories', 'PATCH', { path, name });
}

/** Delete an empty folder; the server answers 409 while it holds files. */
export function deleteLibraryFolder(path: string): Promise<LibraryActionResult<{ deleted: string }>> {
  return libraryAction('/api/backgrounds/directories', 'DELETE', { path });
}

/** Outcome of one upload: the new file's serve URL, or the hub's reason. */
export interface UploadLibraryResult {
  ok: boolean;
  status: number;
  /** Serve URL of the stored file. */
  path?: string;
  error?: string;
}

/**
 * Upload one file into a library folder ('' for the top level), reporting
 * bytes sent as they go: `fetch` cannot report upload progress, and a phone
 * sending a 60 MB video needs a real bar. An expired session sends the page
 * to the login screen and rejects with the same error `editorFetch` throws;
 * a dropped connection rejects too.
 */
export function uploadLibraryFile(
  file: File,
  directory: string,
  onProgress?: (sent: number, total: number) => void,
): Promise<UploadLibraryResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/backgrounds');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 401) {
        reject(sessionExpired());
        return;
      }
      let body: { path?: unknown; error?: unknown } = {};
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
      } catch {
        // A proxy page or an empty answer: the status says enough.
      }
      const ok = xhr.status >= 200 && xhr.status < 300;
      resolve({
        ok,
        status: xhr.status,
        ...(ok && typeof body.path === 'string' ? { path: body.path } : {}),
        ...(!ok && typeof body.error === 'string' ? { error: body.error } : {}),
      });
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onabort = () => reject(new Error('Upload failed'));
    const form = new FormData();
    form.append('file', file);
    if (directory) form.append('directory', directory);
    xhr.send(form);
  });
}
